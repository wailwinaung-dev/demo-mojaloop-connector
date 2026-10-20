import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { MojaloopConfigService } from '../../config/mojaloop-config.service.js';
import { JwsService } from './jws.service.js';

/**
 * Axios request interceptor that automatically signs all outbound FSPIOP
 * requests (PUT, POST, PATCH) by attaching a JWS Compact Serialization
 * to the `fspiop-signature` HTTP header.
 *
 * This hooks into the HttpService's underlying Axios instance at module
 * initialization, so existing code in FspiopCallbackClient and OutboundService
 * requires zero modifications — signing is transparent at the transport layer.
 */
@Injectable()
export class JwsSigningInterceptor implements OnModuleInit {
  private readonly logger = new Logger(JwsSigningInterceptor.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly jwsService: JwsService,
    private readonly config: MojaloopConfigService,
  ) {}

  onModuleInit(): void {
    this.httpService.axiosRef.interceptors.request.use(
      (requestConfig: InternalAxiosRequestConfig) =>
        this.onRequest(requestConfig),
    );
    this.logger.log('JWS signing interceptor registered on HttpService');
  }

  /**
   * Intercepts outgoing Axios requests and attaches an `fspiop-signature`
   * header to all requests that carry a body (PUT, POST, PATCH).
   * GET and DELETE requests are passed through unmodified.
   */
  private onRequest(
    requestConfig: InternalAxiosRequestConfig,
  ): InternalAxiosRequestConfig {
    const method = requestConfig.method?.toLowerCase();

    // Only sign requests with a body per FSPIOP specification
    if (!requestConfig.data || !['put', 'post', 'patch'].includes(method!)) {
      return requestConfig;
    }

    try {
      // Extract the URI path from the full URL
      const uri = this.extractPath(requestConfig.url);

      // Extract optional FSPIOP headers for protected header inclusion
      const destinationFsp =
        requestConfig.headers.get('fspiop-destination') as string | undefined;
      let date = requestConfig.headers.get('date') as string | undefined;

      if (!date) {
        date = new Date().toUTCString();
        requestConfig.headers.set('date', date);
      }

      const signature = this.jwsService.sign({
        uri,
        httpMethod: method!.toUpperCase(),
        sourceFsp: this.config.dfspId,
        destinationFsp: destinationFsp || undefined,
        date,
        body: requestConfig.data,
      });

      requestConfig.headers.set('fspiop-signature', signature);
      requestConfig.headers.set('fspiop-uri', uri);
      requestConfig.headers.set('fspiop-http-method', method!.toUpperCase());

      this.logger.debug(
        `Signed outbound request: ${method!.toUpperCase()} ${uri}`,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to sign outbound request: ${err.message}`,
        err.stack,
      );
      throw err;
    }

    return requestConfig;
  }

  /**
   * Extracts the pathname from a URL string.
   * Handles both absolute URLs and relative paths.
   */
  private extractPath(url: string | undefined): string {
    if (!url) return '/';
    try {
      return new URL(url).pathname;
    } catch {
      // url is already a relative path
      return url.startsWith('/') ? url : `/${url}`;
    }
  }
}
