import { Injectable, Logger } from '@nestjs/common';
import { CbsService } from '../cbs/cbs.service.js';
import {
  FspiopCallbackClient,
  FspiopErrors,
} from '../fspiop/index.js';
import { MojaloopConfigService } from '../config/mojaloop-config.service.js';
import type { PartyResponsePayload } from './dto/party.dto.js';

@Injectable()
export class InboundService {
  private readonly logger = new Logger(InboundService.name);

  constructor(
    private readonly cbsService: CbsService,
    private readonly callbackClient: FspiopCallbackClient,
    private readonly config: MojaloopConfigService,
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
      await this.callbackClient.sendErrorCallback(
        `/parties/${type}/${id}/error`,
        genericError,
        sourceFsp,
      );
    }
  }
}
