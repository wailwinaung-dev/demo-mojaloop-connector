import { Injectable, Logger } from '@nestjs/common';
import { CbsService } from '../cbs/cbs.service.js';
import {
  FspiopCallbackClient,
  FspiopErrors,
  IlpService,
  PreimageStoreService,
  createIlpPreparePacket,
  parseIlpPreparePacket,
} from '../fspiop/index.js';
import { MojaloopConfigService } from '../config/mojaloop-config.service.js';
import type { PartyResponsePayload } from './dto/party.dto.js';
import type {
  QuoteRequestPayload,
  QuoteResponsePayload,
} from './dto/quote.dto.js';
import type {
  TransferRequestPayload,
  TransferResponsePayload,
} from './dto/transfer.dto.js';

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
        try {
          await this.callbackClient.sendErrorCallback(
            `/parties/${type}/${id}/error`,
            errorPayload,
            sourceFsp,
          );
        } catch (callbackErr: any) {
          this.logger.error(
            `Failed to deliver error callback for party ${type}/${id}: ${callbackErr.message}`,
          );
        }
        return;
      }

      // 3. Translate Case B: Account Suspended or Inactive
      if (account.status !== 'ACTIVE') {
        this.logger.warn(
          `Account is not active in CBS: ${type}/${id} (Status: ${account.status})`,
        );
        const errorPayload = FspiopErrors.idNotActive(id);
        try {
          await this.callbackClient.sendErrorCallback(
            `/parties/${type}/${id}/error`,
            errorPayload,
            sourceFsp,
          );
        } catch (callbackErr: any) {
          this.logger.error(
            `Failed to deliver error callback for party ${type}/${id}: ${callbackErr.message}`,
          );
        }
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
      await this.callbackClient.sendPartyCallback(
        type,
        id,
        payload,
        sourceFsp,
      );
    } catch (err: any) {
      this.logger.error(
        `Unexpected error during party lookup: ${err.message}`,
        err.stack,
      );
      const genericError = FspiopErrors.genericTransferError(
        'Internal error during account lookup',
      );
      try {
        await this.callbackClient.sendErrorCallback(
          `/parties/${type}/${id}/error`,
          genericError,
          sourceFsp,
        );
      } catch (callbackErr: any) {
        this.logger.error(
          `Failed to deliver error callback for party ${type}/${id}: ${callbackErr.message}`,
        );
      }
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
      try {
        await this.callbackClient.sendErrorCallback(
          `/quotes/${quoteId}/error`,
          genericError,
          sourceFsp,
        );
      } catch (callbackErr: any) {
        this.logger.error(
          `Failed to deliver error callback for quote ${quoteId}: ${callbackErr.message}`,
        );
      }
    }
  }

  /**
   * Handles an asynchronous incoming transfer execution request (POST /transfers).
   * Validates cryptographic ILP condition against stored preimage, credits payee account in CBS,
   * and dispatches PUT /transfers/{id} callback with fulfillment and 'COMMITTED' state to the Switch.
   */
  public async handleTransferRequest(
    transferRequest: TransferRequestPayload,
    sourceFsp: string,
  ): Promise<void> {
    const { transferId, amount, condition, ilpPacket } = transferRequest;
    this.logger.log(
      `Processing Transfer Request: TransferID=${transferId}, Amount=${amount.amount} ${amount.currency}, Condition=${condition}, Requester=${sourceFsp}`,
    );

    try {
      // 1. Verify ILP Condition against stored Preimage in PreimageStore
      const storedRecord = this.preimageStore.getByCondition(condition);
      if (!storedRecord) {
        this.logger.warn(
          `Condition not found or expired in PreimageStore: ${condition}`,
        );
        const errorPayload = FspiopErrors.genericTransferError(
          'Transfer condition not found or expired',
        );
        await this.callbackClient.sendErrorCallback(
          `/transfers/${transferId}/error`,
          errorPayload,
          sourceFsp,
        );
        return;
      }

      // 2. Parse and validate ILP Prepare Packet
      let parsedPacket: ReturnType<typeof parseIlpPreparePacket>;
      try {
        parsedPacket = parseIlpPreparePacket(ilpPacket);
      } catch (parseErr: any) {
        this.logger.warn(`Failed to parse ILP Packet: ${parseErr.message}`);
        const errorPayload = FspiopErrors.genericTransferError(
          'Invalid ILP Packet structure',
        );
        await this.callbackClient.sendErrorCallback(
          `/transfers/${transferId}/error`,
          errorPayload,
          sourceFsp,
        );
        return;
      }

      // Verify packet execution condition matches transfer condition
      if (parsedPacket.executionCondition !== condition) {
        this.logger.warn(
          `ILP Packet condition mismatch: packet=${parsedPacket.executionCondition}, transfer=${condition}`,
        );
        const errorPayload = FspiopErrors.genericTransferError(
          'ILP Packet condition does not match transfer condition',
        );
        await this.callbackClient.sendErrorCallback(
          `/transfers/${transferId}/error`,
          errorPayload,
          sourceFsp,
        );
        return;
      }

      // 3. Extract Payee Account from destination address
      // e.g. "g.mojaloop.dfsp-b.0911111111"
      const destinationParts = parsedPacket.destination.split('.');
      const payeeIdentifier = destinationParts[destinationParts.length - 1];
      const account = this.cbsService.lookupByIdentifier(
        'MSISDN',
        payeeIdentifier,
      );

      if (!account) {
        this.logger.warn(`Payee account not found in CBS: ${payeeIdentifier}`);
        const errorPayload = FspiopErrors.idNotFound(payeeIdentifier);
        await this.callbackClient.sendErrorCallback(
          `/transfers/${transferId}/error`,
          errorPayload,
          sourceFsp,
        );
        return;
      }

      // 4. Credit account in Core Banking System
      try {
        this.cbsService.credit(
          account.id,
          Number(amount.amount),
          amount.currency,
        );
        this.logger.log(
          `Successfully credited ${amount.amount} ${amount.currency} to ${account.name} (${account.id}). New Balance: ${account.balance}`,
        );
      } catch (cbsErr: any) {
        this.logger.error(`CBS Credit failed: ${cbsErr.message}`, cbsErr.stack);
        const errorPayload = FspiopErrors.genericTransferError(
          `CBS Credit failed: ${cbsErr.message}`,
        );
        try {
          await this.callbackClient.sendErrorCallback(
            `/transfers/${transferId}/error`,
            errorPayload,
            sourceFsp,
          );
        } catch (callbackErr: any) {
          this.logger.error(
            `Failed to deliver error callback for transfer ${transferId}: ${callbackErr.message}`,
          );
        }
        return;
      }

      // 5. Remove preimage from store now that transfer has committed
      this.preimageStore.delete(storedRecord.quoteId);

      // 6. Construct Mojaloop FSPIOP v1.1 Transfer Response Payload
      const responsePayload: TransferResponsePayload = {
        fulfilment: storedRecord.fulfillment,
        fulfillment: storedRecord.fulfillment,
        completedTimestamp: new Date().toISOString(),
        transferState: 'COMMITTED',
      };

      this.logger.log(
        `Transfer COMMITTED for TransferID=${transferId}. Fulfillment=${storedRecord.fulfillment}. Sending PUT callback to ${sourceFsp}...`,
      );

      // 7. Dispatch PUT /transfers/{transferId} callback to Switch
      await this.callbackClient.sendTransferCallback(
        transferId,
        responsePayload,
        sourceFsp,
      );
    } catch (err: any) {
      this.logger.error(
        `Unexpected error during transfer execution: ${err.message}`,
        err.stack,
      );
      const genericError = FspiopErrors.genericTransferError(
        'Internal error during transfer execution',
      );
      try {
        await this.callbackClient.sendErrorCallback(
          `/transfers/${transferId}/error`,
          genericError,
          sourceFsp,
        );
      } catch (callbackErr: any) {
        this.logger.error(
          `Failed to deliver error callback for transfer ${transferId}: ${callbackErr.message}`,
        );
      }
    }
  }
}
