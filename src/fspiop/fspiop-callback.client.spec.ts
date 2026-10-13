import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import type { AxiosResponse } from 'axios';
import { FspiopCallbackClient } from './fspiop-callback.client.js';
import {
  FSPIOP_CONTENT_TYPES,
  FSPIOP_HEADERS,
} from './constants/fspiop-headers.constants.js';

describe('FspiopCallbackClient', () => {
  let client: FspiopCallbackClient;
  let mockHttpService: { put: ReturnType<typeof vi.fn> };
  let mockConfig: {
    dfspId: string;
    hubBaseUrl: string;
    callbackTimeoutMs: number;
  };

  beforeEach(() => {
    mockHttpService = {
      put: vi.fn(),
    };

    mockConfig = {
      dfspId: 'dfsp-b',
      hubBaseUrl: 'http://localhost:4040',
      callbackTimeoutMs: 5000,
    };

    client = new FspiopCallbackClient(
      mockHttpService as any,
      mockConfig as any,
    );
  });

  it('should send a callback with correct FSPIOP headers and URL', async () => {
    const mockResponse: AxiosResponse = {
      data: { status: 'OK' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    };
    mockHttpService.put.mockReturnValue(of(mockResponse));

    const payload = { party: { name: 'Alice' } };
    await client.sendCallback(
      '/parties/MSISDN/0911111111',
      payload,
      'dfsp-a',
      FSPIOP_CONTENT_TYPES.PARTIES,
    );

    expect(mockHttpService.put).toHaveBeenCalledTimes(1);
    const [url, data, config] = mockHttpService.put.mock.calls[0];

    expect(url).toBe('http://localhost:4040/parties/MSISDN/0911111111');
    expect(data).toEqual(payload);
    expect(config.headers[FSPIOP_HEADERS.SOURCE]).toBe('dfsp-b');
    expect(config.headers[FSPIOP_HEADERS.DESTINATION]).toBe('dfsp-a');
    expect(config.headers['Content-Type']).toBe(FSPIOP_CONTENT_TYPES.PARTIES);
    expect(config.headers[FSPIOP_HEADERS.DATE]).toBeDefined();
    expect(config.timeout).toBe(5000);
  });

  it('should call sendPartyCallback with parties content-type', async () => {
    mockHttpService.put.mockReturnValue(of({ data: {}, status: 200 } as any));

    await client.sendPartyCallback(
      'MSISDN',
      '0911111111',
      { name: 'Alice' },
      'dfsp-a',
    );

    const [url, , config] = mockHttpService.put.mock.calls[0];
    expect(url).toBe('http://localhost:4040/parties/MSISDN/0911111111');
    expect(config.headers['Content-Type']).toBe(FSPIOP_CONTENT_TYPES.PARTIES);
  });

  it('should call sendQuoteCallback with quotes content-type', async () => {
    mockHttpService.put.mockReturnValue(of({ data: {}, status: 200 } as any));

    await client.sendQuoteCallback('quote-123', { fee: '0' }, 'dfsp-a');

    const [url, , config] = mockHttpService.put.mock.calls[0];
    expect(url).toBe('http://localhost:4040/quotes/quote-123');
    expect(config.headers['Content-Type']).toBe(FSPIOP_CONTENT_TYPES.QUOTES);
  });

  it('should call sendTransferCallback with transfers content-type', async () => {
    mockHttpService.put.mockReturnValue(of({ data: {}, status: 200 } as any));

    await client.sendTransferCallback(
      'transfer-456',
      { transferState: 'COMMITTED' },
      'dfsp-a',
    );

    const [url, , config] = mockHttpService.put.mock.calls[0];
    expect(url).toBe('http://localhost:4040/transfers/transfer-456');
    expect(config.headers['Content-Type']).toBe(FSPIOP_CONTENT_TYPES.TRANSFERS);
  });

  it('should call sendErrorCallback with errors content-type', async () => {
    mockHttpService.put.mockReturnValue(of({ data: {}, status: 200 } as any));

    const errorPayload = {
      errorInformation: {
        errorCode: '3200',
        errorDescription: 'Generic ID not found',
      },
    };

    await client.sendErrorCallback(
      '/parties/MSISDN/0999999999/error',
      errorPayload,
      'dfsp-a',
    );

    const [url, , config] = mockHttpService.put.mock.calls[0];
    expect(url).toBe('http://localhost:4040/parties/MSISDN/0999999999/error');
    expect(config.headers['Content-Type']).toBe(FSPIOP_CONTENT_TYPES.ERRORS);
  });

  it('should rethrow errors when HTTP request fails', async () => {
    mockHttpService.put.mockReturnValue(
      throwError(() => new Error('Connection refused')),
    );

    await expect(
      client.sendCallback(
        '/parties/123',
        {},
        'dfsp-a',
        FSPIOP_CONTENT_TYPES.PARTIES,
      ),
    ).rejects.toThrow('Connection refused');
  });
});
