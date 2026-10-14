import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { OutboundService } from './outbound.service.js';
import { CallbackWaiterService } from './waiter/callback-waiter.service.js';
import type { PartyResponsePayload } from '../inbound/dto/party.dto.js';

describe('OutboundService', () => {
  let outboundService: OutboundService;
  let waiterService: CallbackWaiterService;
  let mockHttpService: {
    get: ReturnType<typeof vi.fn>;
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
    expect(options.headers['Accept']).toContain('application/vnd.interoperability.parties+json');

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
});
