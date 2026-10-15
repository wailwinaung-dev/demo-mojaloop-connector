import { describe, expect, it, vi } from 'vitest';
import { HttpStatus, NotFoundException } from '@nestjs/common';
import { OutboundController } from './outbound.controller.js';


describe('OutboundController', () => {
  it('should call outboundService.lookupParty when client invokes lookup endpoint', async () => {
    const mockOutboundService = {
      lookupParty: vi.fn().mockResolvedValue({
        party: { name: 'Bob Jones' },
      }),
    };
    const mockWaiterService = {
      resolve: vi.fn(),
      reject: vi.fn(),
    };

    const controller = new OutboundController(
      mockOutboundService as any,
      mockWaiterService as any,
    );

    const result = await controller.lookupParty('MSISDN', '0922222222');

    expect(mockOutboundService.lookupParty).toHaveBeenCalledWith(
      'MSISDN',
      '0922222222',
    );
    expect(result.party.name).toBe('Bob Jones');
  });

  it('should resolve waiter when PUT /parties/:type/:id callback arrives from Switch', () => {
    const mockOutboundService = {
      lookupParty: vi.fn(),
    };
    const mockWaiterService = {
      resolve: vi.fn().mockReturnValue(true),
      reject: vi.fn(),
    };

    const controller = new OutboundController(
      mockOutboundService as any,
      mockWaiterService as any,
    );

    const mockResponse: any = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    const mockPayload: any = {
      party: { name: 'Bob Jones' },
    };

    controller.handlePartyCallback('MSISDN', '0922222222', mockPayload, mockResponse);

    expect(mockWaiterService.resolve).toHaveBeenCalledWith(
      'party:MSISDN:0922222222',
      mockPayload,
    );
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('should reject waiter when PUT /parties/:type/:id/error callback arrives from Switch', () => {
    const mockOutboundService = {
      lookupParty: vi.fn(),
    };
    const mockWaiterService = {
      resolve: vi.fn(),
      reject: vi.fn().mockReturnValue(true),
    };

    const controller = new OutboundController(
      mockOutboundService as any,
      mockWaiterService as any,
    );

    const mockResponse: any = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    const mockErrorPayload: any = {
      errorInformation: { errorCode: '3200', errorDescription: 'ID not found' },
    };

    controller.handlePartyErrorCallback('MSISDN', '0999999999', mockErrorPayload, mockResponse);

    expect(mockWaiterService.reject).toHaveBeenCalledWith(
      'party:MSISDN:0999999999',
      expect.any(NotFoundException),
    );
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
  });


  it('should call outboundService.requestQuote when client invokes quote request endpoint', async () => {
    const mockOutboundService = {
      requestQuote: vi.fn().mockResolvedValue({
        transferAmount: { currency: 'USD', amount: '100.00' },
        condition: 'mock-condition',
      }),
    };
    const mockWaiterService = {
      resolve: vi.fn(),
      reject: vi.fn(),
    };

    const controller = new OutboundController(
      mockOutboundService as any,
      mockWaiterService as any,
    );

    const dto = {
      payerIdentifier: '0911111111',
      payeeIdentifier: '0922222222',
      payeeFsp: 'dfsp-b',
      amount: '100.00',
      currency: 'USD',
    };

    const result = await controller.requestQuote(dto);

    expect(mockOutboundService.requestQuote).toHaveBeenCalledWith(dto);
    expect(result.transferAmount.amount).toBe('100.00');
    expect(result.condition).toBe('mock-condition');
  });

  it('should resolve waiter when PUT /quotes/:id callback arrives from Switch', () => {
    const mockOutboundService = {
      requestQuote: vi.fn(),
    };
    const mockWaiterService = {
      resolve: vi.fn().mockReturnValue(true),
      reject: vi.fn(),
    };

    const controller = new OutboundController(
      mockOutboundService as any,
      mockWaiterService as any,
    );

    const mockResponse: any = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    const mockPayload: any = {
      transferAmount: { currency: 'USD', amount: '100.00' },
      condition: 'mock-condition',
    };

    controller.handleQuoteCallback('quote-123', mockPayload, mockResponse);

    expect(mockWaiterService.resolve).toHaveBeenCalledWith(
      'quote:quote-123',
      mockPayload,
    );
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('should reject waiter when PUT /quotes/:id/error callback arrives from Switch', () => {
    const mockOutboundService = {
      requestQuote: vi.fn(),
    };
    const mockWaiterService = {
      resolve: vi.fn(),
      reject: vi.fn().mockReturnValue(true),
    };

    const controller = new OutboundController(
      mockOutboundService as any,
      mockWaiterService as any,
    );

    const mockResponse: any = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    const mockErrorPayload: any = {
      errorInformation: { errorCode: '5000', errorDescription: 'Payee inactive' },
    };

    controller.handleQuoteErrorCallback('quote-999', mockErrorPayload, mockResponse);

    expect(mockWaiterService.reject).toHaveBeenCalledWith(
      'quote:quote-999',
      expect.any(Error),
    );
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('should call outboundService.sendTransfer when client invokes transfer send endpoint', async () => {
    const mockOutboundService = {
      sendTransfer: vi.fn().mockResolvedValue({
        transferId: 'transfer-123',
        transferState: 'COMMITTED',
        amount: '100',
        currency: 'USD',
      }),
    };
    const mockWaiterService = {
      resolve: vi.fn(),
      reject: vi.fn(),
    };

    const controller = new OutboundController(
      mockOutboundService as any,
      mockWaiterService as any,
    );

    const dto = {
      payerIdentifier: '0911111111',
      payeeIdentifier: '0922222222',
      payeeFsp: 'dfsp-b',
      amount: '100.00',
      currency: 'USD',
      ilpPacket: 'mock-ilp-packet',
      condition: 'mock-condition',
    };

    const result = await controller.sendTransfer(dto);

    expect(mockOutboundService.sendTransfer).toHaveBeenCalledWith(dto);
    expect(result.transferId).toBe('transfer-123');
    expect(result.transferState).toBe('COMMITTED');
  });

  it('should resolve waiter when PUT /transfers/:id callback arrives from Switch', () => {
    const mockOutboundService = {
      sendTransfer: vi.fn(),
    };
    const mockWaiterService = {
      resolve: vi.fn().mockReturnValue(true),
      reject: vi.fn(),
    };

    const controller = new OutboundController(
      mockOutboundService as any,
      mockWaiterService as any,
    );

    const mockResponse: any = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    const mockPayload: any = {
      fulfillment: 'mock-fulfillment-preimage',
      completedTimestamp: '2026-10-15T00:00:00.000Z',
      transferState: 'COMMITTED',
    };

    controller.handleTransferCallback('transfer-777', mockPayload, mockResponse);

    expect(mockWaiterService.resolve).toHaveBeenCalledWith(
      'transfer:transfer-777',
      mockPayload,
    );
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('should reject waiter when PUT /transfers/:id/error callback arrives from Switch', () => {
    const mockOutboundService = {
      sendTransfer: vi.fn(),
    };
    const mockWaiterService = {
      resolve: vi.fn(),
      reject: vi.fn().mockReturnValue(true),
    };

    const controller = new OutboundController(
      mockOutboundService as any,
      mockWaiterService as any,
    );

    const mockResponse: any = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    const mockErrorPayload: any = {
      errorInformation: { errorCode: '5100', errorDescription: 'Payer error' },
    };

    controller.handleTransferErrorCallback('transfer-777', mockErrorPayload, mockResponse);

    expect(mockWaiterService.reject).toHaveBeenCalledWith(
      'transfer:transfer-777',
      expect.any(Error),
    );
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
  });
});


