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
    const waiterPromise = this.waiterService.waitFor<PartyResponsePayload>(
      correlationKey,
      this.config.callbackTimeoutMs,
    );

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
          timeout: this.config.callbackTimeoutMs,
        }),
      );

      this.logger.log(
        `Switch accepted discovery request: ${res.status} ${res.statusText}. Waiting for callback...`,
      );
    } catch (err: any) {
      console.error(err);
      this.logger.error(
        `Failed to send GET /parties to Switch: ${err.message}`,
        err.stack,
      );
      // Clean up waiter to prevent leaks
      this.waiterService.clear();
      throw new BadRequestException(
        `Failed to dispatch party discovery to Switch: ${err.message}`,
      );
    }

    // 3. Await the callback arriving from the Switch
    return await waiterPromise;
  }
}
