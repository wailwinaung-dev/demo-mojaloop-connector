import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { OutboundService } from './outbound.service.js';
import { CallbackWaiterService } from './waiter/callback-waiter.service.js';
import type { PartyResponsePayload } from '../inbound/dto/party.dto.js';
import type { QuoteResponsePayload } from '../inbound/dto/quote.dto.js';
import type { OutboundQuoteRequestDto } from './dto/outbound-quote.dto.js';

describe('OutboundService', () => {
  let outboundService: OutboundService;
  let waiterService: CallbackWaiterService;
  let mockHttpService: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
  let mockConfig: {
    dfspId: string;
    hubBaseUrl: string;
    callbackTimeoutMs: number;
  };

  beforeEach(() => {
    waiterService = new CallbackWaiterService();

    mockHttpService = {
      get: vi.fn(),
      post: vi.fn(),
    };

    mockConfig = {
      dfspId: 'dfsp-a',
      hubBaseUrl: 'http://localhost:4040',
      callbackTimeoutMs: 5000,
    };

    outboundService = new OutboundService(
      mockHttpService as any,
      mockConfig as any,
      waiterService,
    );
  });

  it('should dispatch GET /parties to Switch and resolve when callback arrives', async () => {
    mockHttpService.get.mockReturnValue(
      of({
        status: 202,
        statusText: 'Accepted',
        data: {},
      }),
    );

    const lookupPromise = outboundService.lookupParty('MSISDN', '0922222222');

    // 1. Verify GET request dispatched to Switch
    expect(mockHttpService.get).toHaveBeenCalledTimes(1);
    const [targetUrl, options] = mockHttpService.get.mock.calls[0];

    expect(targetUrl).toBe('http://localhost:4040/parties/MSISDN/0922222222');
    expect(options.headers['fspiop-source']).toBe('dfsp-a');
    expect(options.headers['Accept']).toContain(
      'application/vnd.interoperability.parties+json',
    );

    // 2. Simulate asynchronous callback arriving from Switch
    const mockCallbackPayload: PartyResponsePayload = {
      party: {
        partyIdInfo: {
          partyIdType: 'MSISDN',
          partyIdentifier: '0922222222',
          fspId: 'dfsp-b',
        },
        name: 'Bob Jones',
      },
    };

    waiterService.resolve('party:MSISDN:0922222222', mockCallbackPayload);

    // 3. Verify client promise receives the resolved payload
    const result = await lookupPromise;
    expect(result.party.name).toBe('Bob Jones');
    expect(result.party.partyIdInfo.fspId).toBe('dfsp-b');
  });

  it('should clean up waiter and throw if Switch GET dispatch fails', async () => {
    mockHttpService.get.mockReturnValue(
      throwError(() => new Error('Switch network error')),
    );

    await expect(
      outboundService.lookupParty('MSISDN', '0922222222'),
    ).rejects.toThrow('Failed to dispatch party discovery to Switch');

    expect(waiterService.activeWaitersCount).toBe(0);
  });

  it('should dispatch POST /quotes to Switch and resolve when callback arrives', async () => {
    mockHttpService.post.mockReturnValue(
      of({
        status: 202,
        statusText: 'Accepted',
        data: {},
      }),
    );

    const quoteDto: OutboundQuoteRequestDto = {
      payerIdentifier: '0911111111',
      payeeIdentifier: '0922222222',
      amount: '100.00',
      currency: 'USD',
      payeeFsp: 'dfsp-b',
    };

    const quotePromise = outboundService.requestQuote(quoteDto);

    // 1. Verify POST request dispatched to Switch
    expect(mockHttpService.post).toHaveBeenCalledTimes(1);
    const [targetUrl, payload, options] = mockHttpService.post.mock.calls[0];

    expect(targetUrl).toBe('http://localhost:4040/quotes');
    expect(payload.amount.amount).toBe('100');
    expect(payload.payer.partyIdInfo.partyIdentifier).toBe('0911111111');

    expect(payload.payee.partyIdInfo.partyIdentifier).toBe('0922222222');
    expect(options.headers['fspiop-source']).toBe('dfsp-a');
    expect(options.headers['fspiop-destination']).toBe('dfsp-b');
    expect(options.headers['Accept']).toContain(
      'application/vnd.interoperability.quotes+json',
    );

    // 2. Simulate asynchronous PUT /quotes/{id} callback arriving from Switch
    const quoteId = payload.quoteId;
    const mockQuoteCallback: QuoteResponsePayload = {
      transferAmount: { currency: 'USD', amount: '100.00' },
      payeeFspFee: { currency: 'USD', amount: '0.50' },
      expiration: new Date(Date.now() + 60000).toISOString(),
      ilpPacket: 'mock-ilp-packet',
      condition: 'mock-sha256-condition',
    };

    waiterService.resolve(`quote:${quoteId}`, mockQuoteCallback);

    // 3. Verify client promise receives the resolved quote
    const result = await quotePromise;
    expect(result.transferAmount.amount).toBe('100.00');
    expect(result.payeeFspFee?.amount).toBe('0.50');
    expect(result.condition).toBe('mock-sha256-condition');
  });

  it('should clean up waiter and throw if Switch POST /quotes dispatch fails', async () => {
    mockHttpService.post.mockReturnValue(
      throwError(() => new Error('Switch network error')),
    );

    const quoteDto: OutboundQuoteRequestDto = {
      payerIdentifier: '0911111111',
      payeeIdentifier: '0922222222',
      payeeFsp: 'dfsp-b',
      amount: '100.00',
      currency: 'USD',
    };

    await expect(outboundService.requestQuote(quoteDto)).rejects.toThrow(
      'Failed to dispatch quote request to Switch',
    );

    expect(waiterService.activeWaitersCount).toBe(0);
  });

});
