import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InboundService } from './inbound.service.js';
import { CbsService } from '../cbs/cbs.service.js';

describe('InboundService', () => {
  let inboundService: InboundService;
  let cbsService: CbsService;
  let mockCallbackClient: {
    sendPartyCallback: ReturnType<typeof vi.fn>;
    sendErrorCallback: ReturnType<typeof vi.fn>;
  };
  let mockConfig: { dfspId: string };

  beforeEach(() => {
    cbsService = new CbsService(); // Uses seed accounts: Alice (0911111111), Bob (0922222222)

    mockCallbackClient = {
      sendPartyCallback: vi.fn().mockResolvedValue({}),
      sendErrorCallback: vi.fn().mockResolvedValue({}),
    };

    mockConfig = {
      dfspId: 'dfsp-b',
    };

    inboundService = new InboundService(
      cbsService,
      mockCallbackClient as any,
      mockConfig as any,
    );
  });

  describe('handlePartyLookup', () => {
    it('should find active customer (Alice) and dispatch success PUT callback', async () => {
      await inboundService.handlePartyLookup('MSISDN', '0911111111', 'dfsp-a');

      expect(mockCallbackClient.sendPartyCallback).toHaveBeenCalledTimes(1);
      const [type, id, payload, destination] =
        mockCallbackClient.sendPartyCallback.mock.calls[0];

      expect(type).toBe('MSISDN');
      expect(id).toBe('0911111111');
      expect(destination).toBe('dfsp-a');
      expect(payload.party.name).toBe('Alice Smith');
      expect(payload.party.partyIdInfo.partyIdType).toBe('MSISDN');
      expect(payload.party.partyIdInfo.partyIdentifier).toBe('0911111111');
      expect(payload.party.partyIdInfo.fspId).toBe('dfsp-b');
    });

    it('should dispatch Error 3200 (Generic ID Not Found) when account does not exist', async () => {
      await inboundService.handlePartyLookup('MSISDN', '0999999999', 'dfsp-a');

      expect(mockCallbackClient.sendPartyCallback).not.toHaveBeenCalled();
      expect(mockCallbackClient.sendErrorCallback).toHaveBeenCalledTimes(1);

      const [endpoint, errorPayload, destination] =
        mockCallbackClient.sendErrorCallback.mock.calls[0];

      expect(endpoint).toBe('/parties/MSISDN/0999999999/error');
      expect(destination).toBe('dfsp-a');
      expect(errorPayload.errorInformation.errorCode).toBe('3200');
      expect(errorPayload.errorInformation.errorDescription).toBe(
        'Generic ID not found',
      );
    });

    it('should dispatch Error 3202 (ID Not Active) when account is not active', async () => {
      // Change Alice account status to SUSPENDED for test
      const alice = cbsService.getAccount('acc-alice');
      alice.status = 'SUSPENDED';

      await inboundService.handlePartyLookup('MSISDN', '0911111111', 'dfsp-a');

      expect(mockCallbackClient.sendPartyCallback).not.toHaveBeenCalled();
      expect(mockCallbackClient.sendErrorCallback).toHaveBeenCalledTimes(1);

      const [endpoint, errorPayload] =
        mockCallbackClient.sendErrorCallback.mock.calls[0];
      expect(endpoint).toBe('/parties/MSISDN/0911111111/error');
      expect(errorPayload.errorInformation.errorCode).toBe('3202');
    });
  });
});
