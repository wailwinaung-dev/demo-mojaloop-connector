import { AxiosHeaders } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwsSigningInterceptor } from './jws-signing.interceptor.js';
import type { JwsService } from './jws.service.js';
import type { HttpService } from '@nestjs/axios';
import type { MojaloopConfigService } from '../../config/mojaloop-config.service.js';

describe('JwsSigningInterceptor', () => {
  let interceptor: JwsSigningInterceptor;
  let mockJwsService: { sign: ReturnType<typeof vi.fn> };
  let registeredInterceptorFn: (
    config: InternalAxiosRequestConfig,
  ) => InternalAxiosRequestConfig;

  beforeEach(() => {
    mockJwsService = {
      sign: vi.fn().mockReturnValue('header.payload.signature'),
    };

    const interceptors: Array<(config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig> = [];
    const mockHttpService = {
      axiosRef: {
        interceptors: {
          request: {
            use: (fn: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig) => {
              interceptors.push(fn);
            },
          },
        },
      },
    };

    const mockConfig = { dfspId: 'dfsp-b' };

    interceptor = new JwsSigningInterceptor(
      mockHttpService as unknown as HttpService,
      mockJwsService as unknown as JwsService,
      mockConfig as unknown as MojaloopConfigService,
    );

    interceptor.onModuleInit();
    registeredInterceptorFn = interceptors[0];
  });

  it('should register an Axios request interceptor on init', () => {
    expect(registeredInterceptorFn).toBeDefined();
  });

  it('should sign PUT requests with a body', () => {
    const config: InternalAxiosRequestConfig = {
      method: 'put',
      url: 'http://localhost:4040/parties/MSISDN/0911111111',
      data: { party: { name: 'Test' } },
      headers: new AxiosHeaders({
        'fspiop-destination': 'dfsp-a',
        'date': 'Wed, 16 Oct 2026 10:00:00 GMT',
      }),
    };

    const result = registeredInterceptorFn(config);

    expect(mockJwsService.sign).toHaveBeenCalledWith({
      uri: '/parties/MSISDN/0911111111',
      httpMethod: 'PUT',
      sourceFsp: 'dfsp-b',
      destinationFsp: 'dfsp-a',
      date: 'Wed, 16 Oct 2026 10:00:00 GMT',
      body: { party: { name: 'Test' } },
    });
    expect(result.headers.get('fspiop-signature')).toBe(
      'header.payload.signature',
    );
    expect(result.headers.get('fspiop-uri')).toBe(
      '/parties/MSISDN/0911111111',
    );
    expect(result.headers.get('fspiop-http-method')).toBe('PUT');
  });

  it('should sign POST requests with a body', () => {
    const config: InternalAxiosRequestConfig = {
      method: 'post',
      url: 'http://localhost:4040/quotes',
      data: { quoteId: 'q-1' },
      headers: new AxiosHeaders({
        'fspiop-destination': 'dfsp-c',
      }),
    };

    registeredInterceptorFn(config);

    expect(mockJwsService.sign).toHaveBeenCalledWith({
      uri: '/quotes',
      httpMethod: 'POST',
      sourceFsp: 'dfsp-b',
      destinationFsp: 'dfsp-c',
      date: expect.any(String),
      body: { quoteId: 'q-1' },
    });
    expect(config.headers.get('date')).toBeDefined();
  });

  it('should NOT sign GET requests', () => {
    const config: InternalAxiosRequestConfig = {
      method: 'get',
      url: 'http://localhost:4040/parties/MSISDN/0911111111',
      headers: new AxiosHeaders(),
    };

    const result = registeredInterceptorFn(config);

    expect(mockJwsService.sign).not.toHaveBeenCalled();
    expect(result.headers.get('fspiop-signature')).toBeUndefined();
  });

  it('should NOT sign requests without a body', () => {
    const config: InternalAxiosRequestConfig = {
      method: 'put',
      url: 'http://localhost:4040/parties/MSISDN/0911111111',
      data: undefined,
      headers: new AxiosHeaders(),
    };

    registeredInterceptorFn(config);

    expect(mockJwsService.sign).not.toHaveBeenCalled();
  });

  it('should handle relative URL paths', () => {
    const config: InternalAxiosRequestConfig = {
      method: 'put',
      url: '/transfers/tx-001',
      data: { amount: '100' },
      headers: new AxiosHeaders(),
    };

    registeredInterceptorFn(config);

    expect(mockJwsService.sign).toHaveBeenCalledWith(
      expect.objectContaining({ uri: '/transfers/tx-001' }),
    );
  });

  it('should throw if signing fails', () => {
    mockJwsService.sign.mockImplementation(() => {
      throw new Error('Private key missing');
    });

    const config: InternalAxiosRequestConfig = {
      method: 'put',
      url: 'http://localhost:4040/transfers/tx-001',
      data: { amount: '100' },
      headers: new AxiosHeaders(),
    };

    expect(() => registeredInterceptorFn(config)).toThrow('Private key missing');
  });
});
