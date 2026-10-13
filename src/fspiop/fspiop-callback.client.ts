import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { MojaloopConfigService } from '../config/mojaloop-config.service.js';
import {
  FSPIOP_CONTENT_TYPES,
  FSPIOP_HEADERS,
} from './constants/fspiop-headers.constants.js';
import type { FspiopErrorPayload } from './errors/fspiop-error.model.js';

@Injectable()
export class FspiopCallbackClient {
  private readonly logger = new Logger(FspiopCallbackClient.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly config: MojaloopConfigService,
  ) {}

  /**
   * Core dispatcher to send an asynchronous PUT callback to the Mojaloop Switch/Hub.
   */
  public async sendCallback<T = unknown>(
    endpoint: string,
    payload: unknown,
    destinationFsp: string,
    contentType: string,
  ): Promise<T> {
    const hubBase = this.config.hubBaseUrl.replace(/\/$/, '');
    const cleanEndpoint = endpoint.replace(/^\//, '');
    const targetUrl = `${hubBase}/${cleanEndpoint}`;

    const headers: Record<string, string> = {
      [FSPIOP_HEADERS.SOURCE]: this.config.dfspId,
      [FSPIOP_HEADERS.DESTINATION]: destinationFsp,
      [FSPIOP_HEADERS.DATE]: new Date().toUTCString(),
      'Content-Type': contentType,
    };

    this.logger.log(
      `Sending FSPIOP callback [PUT] -> ${targetUrl} (Destination: ${destinationFsp})`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.put<T>(targetUrl, payload, {
          headers,
          timeout: this.config.callbackTimeoutMs,
        }),
      );

      this.logger.log(
        `Callback acknowledged by switch: ${response.status} ${response.statusText}`,
      );
      return response.data;
    } catch (error: any) {
      const status = error?.response?.status;
      const responseData = JSON.stringify(error?.response?.data || {});
      this.logger.error(
        `Failed to deliver FSPIOP callback to ${targetUrl}: HTTP ${status || 'NETWORK_ERROR'} - ${responseData}`,
        error?.stack,
      );
      throw error;
    }
  }

  /**
   * Helper to send Party discovery callback (PUT /parties/{Type}/{ID}).
   */
  public async sendPartyCallback(
    type: string,
    id: string,
    payload: unknown,
    destinationFsp: string,
  ): Promise<unknown> {
    return this.sendCallback(
      `/parties/${type}/${id}`,
      payload,
      destinationFsp,
      FSPIOP_CONTENT_TYPES.PARTIES,
    );
  }

  /**
   * Helper to send Quote agreement callback (PUT /quotes/{id}).
   */
  public async sendQuoteCallback(
    quoteId: string,
    payload: unknown,
    destinationFsp: string,
  ): Promise<unknown> {
    return this.sendCallback(
      `/quotes/${quoteId}`,
      payload,
      destinationFsp,
      FSPIOP_CONTENT_TYPES.QUOTES,
    );
  }

  /**
   * Helper to send Transfer execution callback (PUT /transfers/{id}).
   */
  public async sendTransferCallback(
    transferId: string,
    payload: unknown,
    destinationFsp: string,
  ): Promise<unknown> {
    return this.sendCallback(
      `/transfers/${transferId}`,
      payload,
      destinationFsp,
      FSPIOP_CONTENT_TYPES.TRANSFERS,
    );
  }

  /**
   * Helper to send Error callback (e.g. PUT /parties/{Type}/{ID}/error).
   */
  public async sendErrorCallback(
    endpoint: string,
    errorPayload: FspiopErrorPayload,
    destinationFsp: string,
  ): Promise<unknown> {
    return this.sendCallback(
      endpoint,
      errorPayload,
      destinationFsp,
      FSPIOP_CONTENT_TYPES.ERRORS,
    );
  }
}
