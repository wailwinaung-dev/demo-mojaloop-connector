import { describe, expect, it, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { InboundController } from './inbound.controller.js';
import type { QuoteRequestPayload } from './dto/quote.dto.js';
import type { TransferRequestPayload } from './dto/transfer.dto.js';

describe('InboundController', () => {
  it('should immediately return HTTP 202 Accepted and dispatch async lookup for GET /parties', () => {
    const mockInboundService = {
      handlePartyLookup: vi.fn().mockResolvedValue(undefined),
      handleQuoteRequest: vi.fn().mockResolvedValue(undefined),
      handleTransferRequest: vi.fn().mockResolvedValue(undefined),
    };

    const controller = new InboundController(mockInboundService as any);

    const mockResponse: any = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    const mockHeaders = {
      source: 'dfsp-a',
      destination: 'dfsp-b',
      date: new Date().toUTCString(),
    };

    controller.getParty('MSISDN', '0911111111', mockHeaders, mockResponse);

    // 1. Verify immediate 202 Accepted
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.ACCEPTED);
    expect(mockResponse.send).toHaveBeenCalledTimes(1);

    // 2. Verify async service call
    expect(mockInboundService.handlePartyLookup).toHaveBeenCalledWith(
      'MSISDN',
      '0911111111',
      'dfsp-a',
    );
  });

  it('should immediately return HTTP 202 Accepted and dispatch async quote handling for POST /quotes', () => {
    const mockInboundService = {
      handlePartyLookup: vi.fn().mockResolvedValue(undefined),
      handleQuoteRequest: vi.fn().mockResolvedValue(undefined),
      handleTransferRequest: vi.fn().mockResolvedValue(undefined),
    };

    const controller = new InboundController(mockInboundService as any);

    const mockResponse: any = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    const mockHeaders = {
      source: 'dfsp-a',
      destination: 'dfsp-b',
      date: new Date().toUTCString(),
    };

    const mockQuoteBody: QuoteRequestPayload = {
      quoteId: 'quote-999',
      transactionId: 'tx-888',
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
        amount: '50',
      },
      transactionType: {
        scenario: 'TRANSFER',
        initiator: 'PAYER',
        initiatorType: 'CONSUMER',
      },
    };

    controller.postQuote(mockQuoteBody, mockHeaders, mockResponse);

    // 1. Verify immediate 202 Accepted
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.ACCEPTED);
    expect(mockResponse.send).toHaveBeenCalledTimes(1);

    // 2. Verify async service call
    expect(mockInboundService.handleQuoteRequest).toHaveBeenCalledWith(
      mockQuoteBody,
      'dfsp-a',
    );
  });

  it('should immediately return HTTP 202 Accepted and dispatch async transfer execution for POST /transfers', () => {
    const mockInboundService = {
      handlePartyLookup: vi.fn().mockResolvedValue(undefined),
      handleQuoteRequest: vi.fn().mockResolvedValue(undefined),
      handleTransferRequest: vi.fn().mockResolvedValue(undefined),
    };

    const controller = new InboundController(mockInboundService as any);

    const mockResponse: any = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    const mockHeaders = {
      source: 'dfsp-a',
      destination: 'dfsp-b',
      date: new Date().toUTCString(),
    };

    const mockTransferBody: TransferRequestPayload = {
      transferId: 'transfer-999',
      payeeFsp: 'dfsp-b',
      payerFsp: 'dfsp-a',
      amount: {
        currency: 'USD',
        amount: '100',
      },
      ilpPacket: 'test-ilp-packet',
      condition: 'f5sqb7tBTWPd5Y8BDFdMm9BJR_M43CharsCondition__',
      expiration: new Date(Date.now() + 60000).toISOString(),
    };

    controller.postTransfer(mockTransferBody, mockHeaders, mockResponse);

    // 1. Verify immediate 202 Accepted
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.ACCEPTED);
    expect(mockResponse.send).toHaveBeenCalledTimes(1);

    // 2. Verify async service call
    expect(mockInboundService.handleTransferRequest).toHaveBeenCalledWith(
      mockTransferBody,
      'dfsp-a',
    );
  });
});
