import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { MojaloopConfigService } from '../config/mojaloop-config.service.js';
import {
  FSPIOP_CONTENT_TYPES,
  FSPIOP_HEADERS,
} from '../fspiop/headers/fspiop-headers.constants.js';
import { CallbackWaiterService } from './waiter/callback-waiter.service.js';
import type { PartyResponsePayload } from '../inbound/dto/party.dto.js';
import type { OutboundQuoteRequestDto } from './dto/outbound-quote.dto.js';
import type {
  QuoteRequestPayload,
  QuoteResponsePayload,
} from '../inbound/dto/quote.dto.js';
import { formatMojaloopAmount } from '../fspiop/utils/amount.util.js';
import { mapFspiopErrorToHttpException } from '../fspiop/errors/fspiop-error.mapper.js';

@Injectable()
export class OutboundService {
  private readonly logger = new Logger(OutboundService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly config: MojaloopConfigService,
    private readonly waiterService: CallbackWaiterService,
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
    const waiter = this.waiterService.register<PartyResponsePayload>(correlationKey);

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
    const waiter = this.waiterService.register<QuoteResponsePayload>(correlationKey);

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
      // [FSPIOP_HEADERS.DATE]: new Date().toUTCString(),
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
}

