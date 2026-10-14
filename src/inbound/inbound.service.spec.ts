import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InboundService } from './inbound.service.js';
import { CbsService } from '../cbs/cbs.service.js';
import { IlpService } from '../fspiop/ilp/ilp.service.js';
import { PreimageStoreService } from '../fspiop/ilp/preimage-store.service.js';
import { createIlpPreparePacket } from '../fspiop/ilp/ilp-packet.util.js';
import type { QuoteRequestPayload } from './dto/quote.dto.js';
import type { TransferRequestPayload } from './dto/transfer.dto.js';

describe('InboundService', () => {
  let inboundService: InboundService;
  let cbsService: CbsService;
  let ilpService: IlpService;
  let preimageStore: PreimageStoreService;
  let mockCallbackClient: {
    sendPartyCallback: ReturnType<typeof vi.fn>;
    sendQuoteCallback: ReturnType<typeof vi.fn>;
    sendTransferCallback: ReturnType<typeof vi.fn>;
    sendErrorCallback: ReturnType<typeof vi.fn>;
  };
  let mockConfig: { dfspId: string; quoteExpirySeconds: number };

  beforeEach(() => {
    cbsService = new CbsService(); // Uses seed accounts: Alice (0911111111, bal: $1000), Bob (0922222222, bal: $500)
    ilpService = new IlpService();
    preimageStore = new PreimageStoreService();

    mockCallbackClient = {
      sendPartyCallback: vi.fn().mockResolvedValue({}),
      sendQuoteCallback: vi.fn().mockResolvedValue({}),
      sendTransferCallback: vi.fn().mockResolvedValue({}),
      sendErrorCallback: vi.fn().mockResolvedValue({}),
    };

    mockConfig = {
      dfspId: 'dfsp-b',
      quoteExpirySeconds: 60,
    };

    inboundService = new InboundService(
      cbsService,
      mockCallbackClient as any,
      mockConfig as any,
      ilpService,
      preimageStore,
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

  describe('handleQuoteRequest', () => {
    const validQuoteRequest: QuoteRequestPayload = {
      quoteId: 'quote-1001',
      transactionId: 'tx-2001',
      payer: {
        partyIdInfo: {
          partyIdType: 'MSISDN',
          partyIdentifier: '0988888888',
          fspId: 'dfsp-a',
        },
      },
      payee: {
        partyIdInfo: {
          partyIdType: 'MSISDN',
          partyIdentifier: '0911111111',
          fspId: 'dfsp-b',
        },
      },
      amountType: 'SEND',
      amount: {
        currency: 'USD',
        amount: '100',
      },
      transactionType: {
        scenario: 'TRANSFER',
        initiator: 'PAYER',
        initiatorType: 'CONSUMER',
      },
    };

    it('should successfully generate quote terms, ILP condition, and dispatch PUT /quotes/{id}', async () => {
      await inboundService.handleQuoteRequest(validQuoteRequest, 'dfsp-a');

      expect(mockCallbackClient.sendQuoteCallback).toHaveBeenCalledTimes(1);
      const [quoteId, responsePayload, destination] =
        mockCallbackClient.sendQuoteCallback.mock.calls[0];

      expect(quoteId).toBe('quote-1001');
      expect(destination).toBe('dfsp-a');
      expect(responsePayload.transferAmount).toEqual({
        currency: 'USD',
        amount: '100',
      });
      expect(responsePayload.payeeReceiveAmount).toEqual({
        currency: 'USD',
        amount: '100',
      });
      expect(responsePayload.payeeFspFee).toEqual({
        currency: 'USD',
        amount: '0',
      });
      expect(responsePayload.condition).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(typeof responsePayload.ilpPacket).toBe('string');
      expect(responsePayload.ilpPacket.length).toBeGreaterThan(0);

      // Verify that preimage is securely stored in PreimageStore
      const stored = preimageStore.getByQuoteId('quote-1001');
      expect(stored).not.toBeNull();
      expect(stored!.condition).toBe(responsePayload.condition);
      expect(
        ilpService.verifyFulfillment(stored!.fulfillment, stored!.condition),
      ).toBe(true);
    });

    it('should dispatch Error 3200 when payee account is not found in CBS', async () => {
      const nonExistentPayeeRequest: QuoteRequestPayload = {
        ...validQuoteRequest,
        quoteId: 'quote-404',
        payee: {
          partyIdInfo: {
            partyIdType: 'MSISDN',
            partyIdentifier: '0999999999',
            fspId: 'dfsp-b',
          },
        },
      };

      await inboundService.handleQuoteRequest(nonExistentPayeeRequest, 'dfsp-a');

      expect(mockCallbackClient.sendQuoteCallback).not.toHaveBeenCalled();
      expect(mockCallbackClient.sendErrorCallback).toHaveBeenCalledTimes(1);

      const [endpoint, errorPayload, destination] =
        mockCallbackClient.sendErrorCallback.mock.calls[0];
      expect(endpoint).toBe('/quotes/quote-404/error');
      expect(destination).toBe('dfsp-a');
      expect(errorPayload.errorInformation.errorCode).toBe('3200');
    });

    it('should dispatch Error 3202 when payee account is not active', async () => {
      const alice = cbsService.getAccount('acc-alice');
      alice.status = 'SUSPENDED';

      await inboundService.handleQuoteRequest(validQuoteRequest, 'dfsp-a');

      expect(mockCallbackClient.sendQuoteCallback).not.toHaveBeenCalled();
      expect(mockCallbackClient.sendErrorCallback).toHaveBeenCalledTimes(1);

      const [endpoint, errorPayload] =
        mockCallbackClient.sendErrorCallback.mock.calls[0];
      expect(endpoint).toBe('/quotes/quote-1001/error');
      expect(errorPayload.errorInformation.errorCode).toBe('3202');
    });

    it('should dispatch Error 5202 when requested currency does not match account currency', async () => {
      const currencyMismatchRequest: QuoteRequestPayload = {
        ...validQuoteRequest,
        amount: {
          currency: 'EUR',
          amount: '100',
        },
      };

      await inboundService.handleQuoteRequest(currencyMismatchRequest, 'dfsp-a');

      expect(mockCallbackClient.sendQuoteCallback).not.toHaveBeenCalled();
      expect(mockCallbackClient.sendErrorCallback).toHaveBeenCalledTimes(1);

      const [endpoint, errorPayload] =
        mockCallbackClient.sendErrorCallback.mock.calls[0];
      expect(endpoint).toBe('/quotes/quote-1001/error');
      expect(errorPayload.errorInformation.errorCode).toBe('5202');
    });
  });

  describe('handleTransferRequest', () => {
    let testPair: { fulfillment: string; condition: string };
    let validIlpPacket: string;
    let validTransferRequest: TransferRequestPayload;

    beforeEach(() => {
      testPair = ilpService.generatePreimageAndCondition();
      preimageStore.save('quote-555', testPair.fulfillment, testPair.condition, 60);

      validIlpPacket = createIlpPreparePacket({
        amount: '100',
        executionCondition: testPair.condition,
        expiresAt: new Date(Date.now() + 60000),
        destination: 'g.mojaloop.dfsp-b.0911111111',
        data: { quoteId: 'quote-555' },
      });

      validTransferRequest = {
        transferId: 'transfer-777',
        payeeFsp: 'dfsp-b',
        payerFsp: 'dfsp-a',
        amount: {
          currency: 'USD',
          amount: '100',
        },
        ilpPacket: validIlpPacket,
        condition: testPair.condition,
        expiration: new Date(Date.now() + 60000).toISOString(),
      };
    });

    it('should successfully execute transfer, credit CBS account, and dispatch PUT /transfers/{id} with COMMITTED state', async () => {
      const aliceBefore = cbsService.getAccount('acc-alice');
      expect(aliceBefore.balance).toBe(1000.0);

      await inboundService.handleTransferRequest(validTransferRequest, 'dfsp-a');

      // 1. Verify callback sent
      expect(mockCallbackClient.sendTransferCallback).toHaveBeenCalledTimes(1);
      const [transferId, responsePayload, destination] =
        mockCallbackClient.sendTransferCallback.mock.calls[0];

      expect(transferId).toBe('transfer-777');
      expect(destination).toBe('dfsp-a');
      expect(responsePayload.transferState).toBe('COMMITTED');
      expect(responsePayload.fulfillment).toBe(testPair.fulfillment);

      // 2. Verify CBS account balance increased by $100
      const aliceAfter = cbsService.getAccount('acc-alice');
      expect(aliceAfter.balance).toBe(1100.0);

      // 3. Verify preimage was consumed and cleared
      expect(preimageStore.getByQuoteId('quote-555')).toBeNull();
    });

    it('should dispatch Error callback when condition is not found or expired in PreimageStore', async () => {
      const unknownConditionRequest = {
        ...validTransferRequest,
        condition: 'UnknownConditionHash43CharsBase64urlFormat__',
      };

      await inboundService.handleTransferRequest(
        unknownConditionRequest,
        'dfsp-a',
      );

      expect(mockCallbackClient.sendTransferCallback).not.toHaveBeenCalled();
      expect(mockCallbackClient.sendErrorCallback).toHaveBeenCalledTimes(1);

      const [endpoint] = mockCallbackClient.sendErrorCallback.mock.calls[0];
      expect(endpoint).toBe('/transfers/transfer-777/error');
    });

    it('should dispatch Error callback when ILP packet condition does not match transfer condition', async () => {
      const differentPair = ilpService.generatePreimageAndCondition();
      const mismatchedPacket = createIlpPreparePacket({
        amount: '100',
        executionCondition: differentPair.condition,
        expiresAt: new Date(Date.now() + 60000),
        destination: 'g.mojaloop.dfsp-b.0911111111',
      });

      const mismatchedRequest = {
        ...validTransferRequest,
        ilpPacket: mismatchedPacket,
      };

      await inboundService.handleTransferRequest(mismatchedRequest, 'dfsp-a');

      expect(mockCallbackClient.sendTransferCallback).not.toHaveBeenCalled();
      expect(mockCallbackClient.sendErrorCallback).toHaveBeenCalledTimes(1);

      const [endpoint] = mockCallbackClient.sendErrorCallback.mock.calls[0];
      expect(endpoint).toBe('/transfers/transfer-777/error');
    });

    it('should dispatch Error callback when Payee account does not exist in CBS', async () => {
      const nonExistentPayeePacket = createIlpPreparePacket({
        amount: '100',
        executionCondition: testPair.condition,
        expiresAt: new Date(Date.now() + 60000),
        destination: 'g.mojaloop.dfsp-b.0999999999', // non-existent MSISDN
      });

      const nonExistentRequest = {
        ...validTransferRequest,
        ilpPacket: nonExistentPayeePacket,
      };

      await inboundService.handleTransferRequest(nonExistentRequest, 'dfsp-a');

      expect(mockCallbackClient.sendTransferCallback).not.toHaveBeenCalled();
      expect(mockCallbackClient.sendErrorCallback).toHaveBeenCalledTimes(1);

      const [endpoint, errorPayload] =
        mockCallbackClient.sendErrorCallback.mock.calls[0];
      expect(endpoint).toBe('/transfers/transfer-777/error');
      expect(errorPayload.errorInformation.errorCode).toBe('3200');
    });
  });
});
