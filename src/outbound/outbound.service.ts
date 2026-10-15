import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { MojaloopConfigService } from '../config/mojaloop-config.service.js';
import {
  FSPIOP_CONTENT_TYPES,
  FSPIOP_HEADERS,
} from '../fspiop/headers/fspiop-headers.constants.js';
import { FSPIOP_ERROR_CODES } from '../fspiop/errors/fspiop-error-codes.js';
import { CallbackWaiterService } from './waiter/callback-waiter.service.js';
import { CbsService } from '../cbs/cbs.service.js';
import { IlpService } from '../fspiop/ilp/ilp.service.js';
import type { PartyResponsePayload } from '../inbound/dto/party.dto.js';
import type { OutboundQuoteRequestDto } from './dto/outbound-quote.dto.js';
import type {
  QuoteRequestPayload,
  QuoteResponsePayload,
} from '../inbound/dto/quote.dto.js';
import type {
  OutboundTransferRequestDto,
  OutboundTransferResponse,
} from './dto/outbound-transfer.dto.js';
import type {
  TransferRequestPayload,
  TransferResponsePayload,
} from '../inbound/dto/transfer.dto.js';
import { formatMojaloopAmount } from '../fspiop/utils/amount.util.js';
import { mapFspiopErrorToHttpException } from '../fspiop/errors/fspiop-error.mapper.js';

@Injectable()
export class OutboundService {
  private readonly logger = new Logger(OutboundService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly config: MojaloopConfigService,
    private readonly waiterService: CallbackWaiterService,
    private readonly cbsService: CbsService,
    private readonly ilpService: IlpService,
  ) {}

  /**
   * Performs an asynchronous Party Lookup against the Mojaloop Switch
   * and blocks until the asynchronous PUT /parties callback returns.
   */
  public async lookupParty(
    type: string,
    id: string,
  ): Promise<PartyResponsePayload> {
    const normalizedType = type.toUpperCase();
    const correlationKey = `party:${normalizedType}:${id}`;

    this.logger.log(
      `Initiating Outbound Party Discovery: Type=${normalizedType}, ID=${id}`,
    );

    // 1. Register a waiter for the incoming asynchronous callback
    const waiter =
      this.waiterService.register<PartyResponsePayload>(correlationKey);

    // 2. Dispatch GET /parties/{Type}/{ID} to Mojaloop Switch
    const hubBase = this.config.hubBaseUrl.replace(/\/$/, '');
    const targetUrl = `${hubBase}/parties/${normalizedType}/${id}`;

    const headers: Record<string, string> = {
      [FSPIOP_HEADERS.SOURCE]: this.config.dfspId,
      [FSPIOP_HEADERS.DATE]: new Date().toUTCString(),
      Accept: FSPIOP_CONTENT_TYPES.PARTIES,
      'Content-Type': FSPIOP_CONTENT_TYPES.PARTIES,
    };

    try {
      this.logger.log(
        `Sending GET ${targetUrl} (Source: ${this.config.dfspId})...`,
      );
      const res = await firstValueFrom(
        this.httpService.get(targetUrl, {
          headers,
          timeout: 3000,
        }),
      );

      this.logger.log(
        `Switch accepted discovery request: ${res.status} ${res.statusText}. Waiting for callback...`,
      );
    } catch (err: unknown) {
      const exception = mapFspiopErrorToHttpException(err);
      this.logger.error(
        `Failed to send GET /parties to Switch: ${exception.message}`,
        (err as any)?.stack,
      );
      // Clean up waiter to prevent leaks
      this.waiterService.cancel(correlationKey);
      throw exception;
    }

    // 3. Await the callback arriving from the Switch (starts callbackTimeout countdown)
    return await waiter.wait(this.config.callbackTimeoutMs);
  }

  /**
   * Requests a Quote from the Payee DFSP via Mojaloop Switch
   * and blocks until the asynchronous PUT /quotes/{id} callback returns.
   */
  public async requestQuote(
    dto: OutboundQuoteRequestDto,
  ): Promise<QuoteResponsePayload> {
    const quoteId = randomUUID();
    const transactionId = randomUUID();
    const correlationKey = `quote:${quoteId}`;

    this.logger.log(
      `Initiating Outbound Quote: QuoteID=${quoteId}, Payee=${dto.payeeIdentifier}, Amount=${dto.amount} ${dto.currency}`,
    );

    // 1. Register a waiter for the incoming asynchronous callback
    const waiter =
      this.waiterService.register<QuoteResponsePayload>(correlationKey);

    // 2. Build standard Mojaloop FSPIOP POST /quotes payload
    const payload: QuoteRequestPayload = {
      quoteId,
      transactionId,
      payer: {
        partyIdInfo: {
          partyIdType: (dto.payerIdType || 'MSISDN').toUpperCase(),
          partyIdentifier: dto.payerIdentifier,
          fspId: this.config.dfspId,
        },
      },
      payee: {
        partyIdInfo: {
          partyIdType: (dto.payeeIdType || 'MSISDN').toUpperCase(),
          partyIdentifier: dto.payeeIdentifier,
          fspId: dto.payeeFsp,
        },
      },
      amountType: dto.amountType || 'SEND',
      amount: {
        amount: formatMojaloopAmount(dto.amount),
        currency: dto.currency,
      },
      transactionType: {
        scenario: 'TRANSFER',
        initiator: 'PAYER',
        initiatorType: 'CONSUMER',
      },
    };

    // 3. Dispatch POST /quotes to Mojaloop Switch
    const hubBase = this.config.hubBaseUrl.replace(/\/$/, '');
    const targetUrl = `${hubBase}/quotes`;

    const headers: Record<string, string> = {
      [FSPIOP_HEADERS.SOURCE]: this.config.dfspId,
      [FSPIOP_HEADERS.DESTINATION]: dto.payeeFsp,
      [FSPIOP_HEADERS.DATE]: new Date().toUTCString(),
      Accept: FSPIOP_CONTENT_TYPES.QUOTES,
      'Content-Type': FSPIOP_CONTENT_TYPES.QUOTES,
    };

    try {
      this.logger.log(`Sending POST ${targetUrl} (QuoteID: ${quoteId})...`);
      const res = await firstValueFrom(
        this.httpService.post(targetUrl, payload, {
          headers,
          timeout: 3000,
        }),
      );

      this.logger.log(
        `Switch accepted quote request: ${res.status} ${res.statusText}. Waiting for callback...`,
      );
    } catch (err: unknown) {
      const exception = mapFspiopErrorToHttpException(err);
      this.logger.error(
        `Failed to send POST /quotes to Switch: ${exception.message}`,
        (err as any)?.stack,
      );
      this.waiterService.cancel(correlationKey);
      throw exception;
    }

    // 4. Await the callback arriving from the Switch (starts callbackTimeout countdown)
    return await waiter.wait(this.config.callbackTimeoutMs);
  }

  /**
   * Executes an Outbound Transfer with 2-Phase Commit (2PC):
   * 1. Reserves funds in Payer CBS.
   * 2. Registers callback waiter and dispatches POST /transfers to Mojaloop Switch.
   * 3. Awaits asynchronous PUT /transfers/{id} callback.
   * 4. Cryptographically verifies fulfillment against condition.
   * 5. Commits funds in CBS on success, or rolls back on any error/tampering.
   */
  public async sendTransfer(
    dto: OutboundTransferRequestDto,
  ): Promise<OutboundTransferResponse> {
    const transferId = randomUUID();
    const reservationId = `res-${transferId}`;
    const correlationKey = `transfer:${transferId}`;
    const numericAmount = parseFloat(dto.amount);
    const formattedAmount = formatMojaloopAmount(dto.amount);

    this.logger.log(
      `Initiating Outbound Transfer: TransferID=${transferId}, Payer=${dto.payerIdentifier}, Payee=${dto.payeeIdentifier}, Amount=${formattedAmount} ${dto.currency}`,
    );

    // 1. Look up Payer account in CBS
    const payerAccount = this.cbsService.lookupByIdentifier(
      dto.payerIdType || 'MSISDN',
      dto.payerIdentifier,
    );
    if (!payerAccount) {
      throw new NotFoundException(
        `Payer account ${dto.payerIdentifier} not found in CBS`,
      );
    }

    // 2. Phase 1 of 2PC: Reserve funds locally
    this.logger.log(
      `Reserving ${formattedAmount} ${dto.currency} from Payer account ${payerAccount.id} (ReservationID=${reservationId})...`,
    );
    this.cbsService.reserve(
      payerAccount.id,
      numericAmount,
      dto.currency,
      reservationId,
    );

    // 3. Register waiter for the incoming asynchronous callback
    const waiter =
      this.waiterService.register<TransferResponsePayload>(correlationKey);

    // 4. Build standard Mojaloop FSPIOP POST /transfers payload
    const expiration =
      dto.expiration || new Date(Date.now() + 60000).toISOString();

    const payload: TransferRequestPayload = {
      transferId,
      payerFsp: this.config.dfspId,
      payeeFsp: dto.payeeFsp,
      amount: {
        amount: formattedAmount,
        currency: dto.currency,
      },
      ilpPacket: dto.ilpPacket,
      condition: dto.condition,
      expiration,
    };

    // 5. Dispatch POST /transfers to Mojaloop Switch
    const hubBase = this.config.hubBaseUrl.replace(/\/$/, '');
    const targetUrl = `${hubBase}/transfers`;

    const headers: Record<string, string> = {
      [FSPIOP_HEADERS.SOURCE]: this.config.dfspId,
      [FSPIOP_HEADERS.DESTINATION]: dto.payeeFsp,
      [FSPIOP_HEADERS.DATE]: new Date().toUTCString(),
      Accept: FSPIOP_CONTENT_TYPES.TRANSFERS,
      'Content-Type': FSPIOP_CONTENT_TYPES.TRANSFERS,
    };

    try {
      this.logger.log(
        `Sending POST ${targetUrl} (TransferID: ${transferId})...`,
      );
      const res = await firstValueFrom(
        this.httpService.post(targetUrl, payload, {
          headers,
          timeout: 3000,
        }),
      );

      this.logger.log(
        `Switch accepted transfer request: ${res.status} ${res.statusText}. Waiting for callback...`,
      );
    } catch (err: unknown) {
      const exception = mapFspiopErrorToHttpException(err);
      this.logger.error(
        `Failed to send POST /transfers to Switch: ${exception.message}`,
        (err as any)?.stack,
      );
      this.waiterService.cancel(correlationKey);
      // Rollback reserved funds because transfer was rejected by the Switch/network
      this.cbsService.rollback(reservationId);
      throw exception;
    }

    // 6. Await the callback arriving from the Switch (starts callbackTimeout countdown)
    let callbackPayload: TransferResponsePayload;
    try {
      callbackPayload = await waiter.wait(this.config.callbackTimeoutMs);
    } catch (err: unknown) {
      this.logger.error(
        `Transfer ${transferId} failed or timed out: ${(err as any)?.message}`,
      );
      // Rollback reserved funds on callback timeout or error callback
      this.cbsService.rollback(reservationId);
      throw err;
    }

    // 7. Extract fulfillment (handling Mojaloop 'fulfilment' vs 'fulfillment')
    const rawFulfillment =
      callbackPayload.fulfilment || callbackPayload.fulfillment;

    // Validate Transfer State
    if (callbackPayload.transferState !== 'COMMITTED') {
      this.logger.error(
        `Transfer ${transferId} was not COMMITTED. State=${callbackPayload.transferState}`,
      );
      this.cbsService.rollback(reservationId);
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: `Transfer was not COMMITTED: ${callbackPayload.transferState}`,
      });
    }

    // Validate Fulfillment existence
    if (!rawFulfillment) {
      this.logger.error(
        `Transfer ${transferId} missing fulfillment in callback payload`,
      );
      this.cbsService.rollback(reservationId);
      throw new UnprocessableEntityException({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        message: 'Missing cryptographic fulfillment in callback payload',
        mojaloopErrorCode: FSPIOP_ERROR_CODES.GENERIC_SECURITY_ERROR,
      });
    }

    // 8. Cryptographic Fulfillment Verification
    this.logger.log(
      `Verifying ILP Fulfillment against Condition for Transfer ${transferId}...`,
    );
    const isValid = this.ilpService.verifyFulfillment(
      rawFulfillment,
      dto.condition,
    );

    if (!isValid) {
      this.logger.error(
        `Cryptographic fulfillment mismatch for Transfer ${transferId}! Condition=${dto.condition}, Fulfillment=${rawFulfillment}`,
      );
      // Security mismatch/tampering: rollback funds immediately
      this.cbsService.rollback(reservationId);
      throw new UnprocessableEntityException({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        message: 'Cryptographic fulfillment mismatch or tampering detected',
        mojaloopErrorCode: FSPIOP_ERROR_CODES.GENERIC_SECURITY_ERROR,
      });
    }

    // 9. Phase 2 of 2PC: Finalize commit in CBS
    this.cbsService.commit(reservationId);
    this.logger.log(
      `Transfer ${transferId} COMMITTED successfully in CBS. Balance permanently deducted.`,
    );

    return {
      transferId,
      transferState: 'COMMITTED',
      completedTimestamp:
        callbackPayload.completedTimestamp || new Date().toISOString(),
      fulfillment: rawFulfillment,
      amount: formattedAmount,
      currency: dto.currency,
      payerIdentifier: dto.payerIdentifier,
      payeeIdentifier: dto.payeeIdentifier,
    };
  }
}
