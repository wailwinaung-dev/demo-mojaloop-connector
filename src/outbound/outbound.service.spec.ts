import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OutboundService } from './outbound.service.js';
import { CallbackWaiterService } from './waiter/callback-waiter.service.js';
import { CbsService } from '../cbs/cbs.service.js';
import { IlpService } from '../fspiop/ilp/ilp.service.js';
import type { PartyResponsePayload } from '../inbound/dto/party.dto.js';
import type { QuoteResponsePayload } from '../inbound/dto/quote.dto.js';
import type { OutboundQuoteRequestDto } from './dto/outbound-quote.dto.js';
import type { OutboundTransferRequestDto } from './dto/outbound-transfer.dto.js';
import type { TransferResponsePayload } from '../inbound/dto/transfer.dto.js';

describe('OutboundService', () => {
  let outboundService: OutboundService;
  let waiterService: CallbackWaiterService;
  let cbsService: CbsService;
  let ilpService: IlpService;
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
    cbsService = new CbsService();
    ilpService = new IlpService();

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
      cbsService,
      ilpService,
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
    ).rejects.toThrow('Switch network error');

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
      'Switch network error',
    );

    expect(waiterService.activeWaitersCount).toBe(0);
  });

  describe('sendTransfer (2-Phase Commit)', () => {
    it('should successfully execute outbound transfer with 2PC and commit funds on valid fulfillment', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          status: 202,
          statusText: 'Accepted',
          data: {},
        }),
      );

      // Alice starts with 1000 USD
      const initialAccount = cbsService.getAccount('acc-alice');
      expect(initialAccount.balance).toBe(1000);
      expect(initialAccount.reservedBalance).toBe(0);

      // Cryptographic test pair
      const cryptoPair = ilpService.generatePreimageAndCondition();

      const transferDto: OutboundTransferRequestDto = {
        payerIdentifier: '0911111111',
        payeeIdentifier: '0922222222',
        payeeFsp: 'dfsp-b',
        amount: '100.00',
        currency: 'USD',
        ilpPacket: 'mock-ilp-packet-transfer',
        condition: cryptoPair.condition,
      };

      const transferPromise = outboundService.sendTransfer(transferDto);

      // Verify POST dispatched to Switch
      expect(mockHttpService.post).toHaveBeenCalledTimes(1);
      const [targetUrl, payload, options] = mockHttpService.post.mock.calls[0];

      expect(targetUrl).toBe('http://localhost:4040/transfers');
      expect(payload.amount.amount).toBe('100');
      expect(payload.condition).toBe(cryptoPair.condition);
      expect(options.headers['fspiop-source']).toBe('dfsp-a');
      expect(options.headers['fspiop-destination']).toBe('dfsp-b');

      // Verify funds were reserved during in-flight phase
      const inFlightAccount = cbsService.getAccount('acc-alice');
      expect(inFlightAccount.balance).toBe(1000);
      expect(inFlightAccount.reservedBalance).toBe(100);

      // Simulate asynchronous callback from Switch with VALID fulfillment
      const transferId = payload.transferId;
      const mockCallback: TransferResponsePayload = {
        fulfillment: cryptoPair.fulfillment,
        completedTimestamp: new Date().toISOString(),
        transferState: 'COMMITTED',
      };

      waiterService.resolve(`transfer:${transferId}`, mockCallback);

      const result = await transferPromise;
      expect(result.transferState).toBe('COMMITTED');
      expect(result.fulfillment).toBe(cryptoPair.fulfillment);
      expect(result.amount).toBe('100');

      // Verify final committed state in CBS: 100 deducted, reserved restored to 0
      const finalAccount = cbsService.getAccount('acc-alice');
      expect(finalAccount.balance).toBe(900);
      expect(finalAccount.reservedBalance).toBe(0);
    });

    it('should reject without dispatching if payer has insufficient balance in CBS', async () => {
      const transferDto: OutboundTransferRequestDto = {
        payerIdentifier: '0911111111',
        payeeIdentifier: '0922222222',
        payeeFsp: 'dfsp-b',
        amount: '5000.00', // Alice only has 1000 USD
        currency: 'USD',
        ilpPacket: 'mock-ilp-packet',
        condition: 'mock-condition-hash-43-chars-base64url_______',
      };

      await expect(outboundService.sendTransfer(transferDto)).rejects.toThrow(
        BadRequestException,
      );

      // Verify no network call made to Switch
      expect(mockHttpService.post).not.toHaveBeenCalled();

      // Verify balance remains untouched
      const account = cbsService.getAccount('acc-alice');
      expect(account.balance).toBe(1000);
      expect(account.reservedBalance).toBe(0);
    });

    it('should rollback reserved funds if Switch POST /transfers dispatch fails', async () => {
      mockHttpService.post.mockReturnValue(
        throwError(() => new Error('Switch network error')),
      );

      const cryptoPair = ilpService.generatePreimageAndCondition();
      const transferDto: OutboundTransferRequestDto = {
        payerIdentifier: '0911111111',
        payeeIdentifier: '0922222222',
        payeeFsp: 'dfsp-b',
        amount: '100.00',
        currency: 'USD',
        ilpPacket: 'mock-ilp-packet',
        condition: cryptoPair.condition,
      };

      await expect(outboundService.sendTransfer(transferDto)).rejects.toThrow(
        'Switch network error',
      );

      // Verify reservation was rolled back in CBS
      const account = cbsService.getAccount('acc-alice');
      expect(account.balance).toBe(1000);
      expect(account.reservedBalance).toBe(0);
      expect(waiterService.activeWaitersCount).toBe(0);
    });

    it('should rollback reserved funds if callback times out or errors', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          status: 202,
          statusText: 'Accepted',
          data: {},
        }),
      );

      const cryptoPair = ilpService.generatePreimageAndCondition();
      const transferDto: OutboundTransferRequestDto = {
        payerIdentifier: '0911111111',
        payeeIdentifier: '0922222222',
        payeeFsp: 'dfsp-b',
        amount: '100.00',
        currency: 'USD',
        ilpPacket: 'mock-ilp-packet',
        condition: cryptoPair.condition,
      };

      const transferPromise = outboundService.sendTransfer(transferDto);
      const [, payload] = mockHttpService.post.mock.calls[0];

      // Simulate Switch error callback (e.g. 5200 insufficient liquidity from Payee)
      waiterService.reject(
        `transfer:${payload.transferId}`,
        new BadRequestException('Payee insufficient liquidity'),
      );

      await expect(transferPromise).rejects.toThrow(
        'Payee insufficient liquidity',
      );

      // Verify reservation was rolled back
      const account = cbsService.getAccount('acc-alice');
      expect(account.balance).toBe(1000);
      expect(account.reservedBalance).toBe(0);
    });

    it('should rollback reserved funds and throw 422 if fulfillment is cryptographically invalid', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          status: 202,
          statusText: 'Accepted',
          data: {},
        }),
      );

      const cryptoPair = ilpService.generatePreimageAndCondition();
      const transferDto: OutboundTransferRequestDto = {
        payerIdentifier: '0911111111',
        payeeIdentifier: '0922222222',
        payeeFsp: 'dfsp-b',
        amount: '100.00',
        currency: 'USD',
        ilpPacket: 'mock-ilp-packet',
        condition: cryptoPair.condition,
      };

      const transferPromise = outboundService.sendTransfer(transferDto);
      const [, payload] = mockHttpService.post.mock.calls[0];

      // Send a TAMPERED fulfillment that does NOT match cryptoPair.condition
      const tamperedPair = ilpService.generatePreimageAndCondition();
      const mockCallback: TransferResponsePayload = {
        fulfillment: tamperedPair.fulfillment, // Wrong fulfillment!
        completedTimestamp: new Date().toISOString(),
        transferState: 'COMMITTED',
      };

      waiterService.resolve(`transfer:${payload.transferId}`, mockCallback);

      await expect(transferPromise).rejects.toThrow(
        UnprocessableEntityException,
      );

      // Verify security error caused immediate rollback in CBS!
      const account = cbsService.getAccount('acc-alice');
      expect(account.balance).toBe(1000);
      expect(account.reservedBalance).toBe(0);
    });

    it('should successfully commit when callback uses British spelling "fulfilment"', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          status: 202,
          statusText: 'Accepted',
          data: {},
        }),
      );

      const cryptoPair = ilpService.generatePreimageAndCondition();
      const transferDto: OutboundTransferRequestDto = {
        payerIdentifier: '0911111111',
        payeeIdentifier: '0922222222',
        payeeFsp: 'dfsp-b',
        amount: '50.00',
        currency: 'USD',
        ilpPacket: 'mock-ilp-packet',
        condition: cryptoPair.condition,
      };

      const transferPromise = outboundService.sendTransfer(transferDto);
      const [, payload] = mockHttpService.post.mock.calls[0];

      // Send British spelling "fulfilment"
      const mockCallback: TransferResponsePayload = {
        fulfilment: cryptoPair.fulfillment,
        completedTimestamp: new Date().toISOString(),
        transferState: 'COMMITTED',
      };

      waiterService.resolve(`transfer:${payload.transferId}`, mockCallback);

      const result = await transferPromise;
      expect(result.transferState).toBe('COMMITTED');
      expect(result.fulfillment).toBe(cryptoPair.fulfillment);

      const account = cbsService.getAccount('acc-alice');
      expect(account.balance).toBe(950);
      expect(account.reservedBalance).toBe(0);
    });

    it('should rollback funds and reject if transferState is ABORTED', async () => {
      mockHttpService.post.mockReturnValue(
        of({
          status: 202,
          statusText: 'Accepted',
          data: {},
        }),
      );

      const cryptoPair = ilpService.generatePreimageAndCondition();
      const transferDto: OutboundTransferRequestDto = {
        payerIdentifier: '0911111111',
        payeeIdentifier: '0922222222',
        payeeFsp: 'dfsp-b',
        amount: '50.00',
        currency: 'USD',
        ilpPacket: 'mock-ilp-packet',
        condition: cryptoPair.condition,
      };

      const transferPromise = outboundService.sendTransfer(transferDto);
      const [, payload] = mockHttpService.post.mock.calls[0];

      const mockCallback: TransferResponsePayload = {
        fulfilment: cryptoPair.fulfillment,
        completedTimestamp: new Date().toISOString(),
        transferState: 'ABORTED' as any,
      };

      waiterService.resolve(`transfer:${payload.transferId}`, mockCallback);

      await expect(transferPromise).rejects.toThrow();

      // Reservation rolled back
      const account = cbsService.getAccount('acc-alice');
      expect(account.balance).toBe(1000);
      expect(account.reservedBalance).toBe(0);
    });
  });
});
