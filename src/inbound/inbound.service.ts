import { Injectable, Logger } from '@nestjs/common';
import { CbsService } from '../cbs/cbs.service.js';
import {
  FspiopCallbackClient,
  FspiopErrors,
  IlpService,
  PreimageStoreService,
  createIlpPreparePacket,
} from '../fspiop/index.js';
import { MojaloopConfigService } from '../config/mojaloop-config.service.js';
import type { PartyResponsePayload } from './dto/party.dto.js';
import type {
  QuoteRequestPayload,
  QuoteResponsePayload,
} from './dto/quote.dto.js';

@Injectable()
export class InboundService {
  private readonly logger = new Logger(InboundService.name);

  constructor(
    private readonly cbsService: CbsService,
    private readonly callbackClient: FspiopCallbackClient,
    private readonly config: MojaloopConfigService,
    private readonly ilpService: IlpService,
    private readonly preimageStore: PreimageStoreService,
  ) {}

  /**
   * Handles an asynchronous party discovery request (GET /parties/{Type}/{ID}).
   * Resolves the account from the CBS and dispatches a PUT callback (Success or Error).
   */
  public async handlePartyLookup(
    type: string,
    id: string,
    sourceFsp: string,
  ): Promise<void> {
    this.logger.log(
      `Processing Party Lookup: Type=${type}, ID=${id}, Requester=${sourceFsp}`,
    );

    try {
      // 1. Query the Core Banking System
      const account = this.cbsService.lookupByIdentifier(type, id);

      // 2. Translate Case A: Account Not Found
      if (!account) {
        this.logger.warn(`Account not found in CBS: ${type}/${id}`);
        const errorPayload = FspiopErrors.idNotFound(id);
        await this.callbackClient.sendErrorCallback(
          `/parties/${type}/${id}/error`,
          errorPayload,
          sourceFsp,
        );
        return;
      }

      // 3. Translate Case B: Account Suspended or Inactive
      if (account.status !== 'ACTIVE') {
        this.logger.warn(
          `Account is not active in CBS: ${type}/${id} (Status: ${account.status})`,
        );
        const errorPayload = FspiopErrors.idNotActive(id);
        await this.callbackClient.sendErrorCallback(
          `/parties/${type}/${id}/error`,
          errorPayload,
          sourceFsp,
        );
        return;
      }

      // 4. Case C: Success - Reshape CBS model into Mojaloop FSPIOP Schema
      const payload: PartyResponsePayload = {
        party: {
          partyIdInfo: {
            partyIdType: type.toUpperCase(),
            partyIdentifier: id,
            fspId: this.config.dfspId,
          },
          name: account.name,
        },
      };

      this.logger.log(
        `Account resolved for ${account.name}. Sending PUT callback to ${sourceFsp}...`,
      );

      // 5. Dispatch PUT /parties/{Type}/{ID} callback
      await this.callbackClient.sendPartyCallback(type, id, payload, sourceFsp);
    } catch (err: any) {
      this.logger.error(
        `Unexpected error during party lookup: ${err.message}`,
        err.stack,
      );
      const genericError = FspiopErrors.genericTransferError(
        'Internal error during account lookup',
      );
      await this.callbackClient.sendErrorCallback(
        `/parties/${type}/${id}/error`,
        genericError,
        sourceFsp,
      );
    }
  }

  /**
   * Handles an asynchronous incoming quote agreement request (POST /quotes).
   * Generates a cryptographic ILP pre-image & condition, encodes the ILP Packet,
   * stores pre-image with TTL, and dispatches PUT /quotes/{id} callback to the Switch.
   */
  public async handleQuoteRequest(
    quoteRequest: QuoteRequestPayload,
    sourceFsp: string,
  ): Promise<void> {
    const { quoteId, payee, amount } = quoteRequest;
    this.logger.log(
      `Processing Quote Request: QuoteID=${quoteId}, Payee=${payee.partyIdInfo.partyIdType}/${payee.partyIdInfo.partyIdentifier}, Amount=${amount.amount} ${amount.currency}, Requester=${sourceFsp}`,
    );

    try {
      // 1. Verify Payee in CBS
      const payeeType = payee.partyIdInfo.partyIdType;
      const payeeId = payee.partyIdInfo.partyIdentifier;
      const account = this.cbsService.lookupByIdentifier(payeeType, payeeId);

      // Case A: Payee not found
      if (!account) {
        this.logger.warn(`Payee not found in CBS: ${payeeType}/${payeeId}`);
        const errorPayload = FspiopErrors.idNotFound(payeeId);
        await this.callbackClient.sendErrorCallback(
          `/quotes/${quoteId}/error`,
          errorPayload,
          sourceFsp,
        );
        return;
      }

      // Case B: Payee not active
      if (account.status !== 'ACTIVE') {
        this.logger.warn(
          `Payee is not active in CBS: ${payeeType}/${payeeId} (Status: ${account.status})`,
        );
        const errorPayload = FspiopErrors.idNotActive(payeeId);
        await this.callbackClient.sendErrorCallback(
          `/quotes/${quoteId}/error`,
          errorPayload,
          sourceFsp,
        );
        return;
      }

      // Case C: Currency check (if account has specific currency and does not match)
      if (account.currency && account.currency !== amount.currency) {
        this.logger.warn(
          `Currency mismatch for payee: requested ${amount.currency}, account has ${account.currency}`,
        );
        const errorPayload = FspiopErrors.unsupportedCurrency(
          amount.currency,
          account.currency,
        );
        await this.callbackClient.sendErrorCallback(
          `/quotes/${quoteId}/error`,
          errorPayload,
          sourceFsp,
        );
        return;
      }

      // 2. Compute Expiration Date & ISO string
      const expirySeconds = this.config.quoteExpirySeconds || 60;
      const expirationDate = new Date(Date.now() + expirySeconds * 1000);
      const expirationIso = expirationDate.toISOString();

      // 3. Cryptographically generate 32-byte secret fulfillment and SHA-256 condition
      const cryptoPair = this.ilpService.generatePreimageAndCondition();

      // 4. Store fulfillment & condition in PreimageStore with TTL indexed by quoteId
      this.preimageStore.save(
        quoteId,
        cryptoPair.fulfillment,
        cryptoPair.condition,
        expirySeconds,
      );

      // 5. Construct ASN.1 OER ILP Prepare Packet
      const ilpPacket = createIlpPreparePacket({
        amount: amount.amount,
        executionCondition: cryptoPair.condition,
        expiresAt: expirationDate,
        destination: `g.mojaloop.${this.config.dfspId}.${payeeId}`,
        data: {
          quoteId,
          transactionId: quoteRequest.transactionId,
          payerFsp: sourceFsp,
          payeeFsp: this.config.dfspId,
        },
      });

      // 6. Build Mojaloop FSPIOP v1.1 Quote Response Payload
      const responsePayload: QuoteResponsePayload = {
        transferAmount: {
          currency: amount.currency,
          amount: amount.amount,
        },
        payeeReceiveAmount: {
          currency: amount.currency,
          amount: amount.amount,
        },
        payeeFspFee: {
          currency: amount.currency,
          amount: '0',
        },
        expiration: expirationIso,
        ilpPacket,
        condition: cryptoPair.condition,
      };

      this.logger.log(
        `Quote agreement generated for QuoteID=${quoteId}. Condition=${cryptoPair.condition}. Sending PUT callback to ${sourceFsp}...`,
      );

      // 7. Dispatch PUT /quotes/{quoteId} callback
      await this.callbackClient.sendQuoteCallback(
        quoteId,
        responsePayload,
        sourceFsp,
      );
    } catch (err: any) {
      this.logger.error(
        `Unexpected error during quote processing: ${err.message}`,
        err.stack,
      );
      const genericError = FspiopErrors.genericQuoteError(
        'Internal error during quote processing',
      );
      await this.callbackClient.sendErrorCallback(
        `/quotes/${quoteId}/error`,
        genericError,
        sourceFsp,
      );
    }
  }
}
