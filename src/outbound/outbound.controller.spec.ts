import { describe, expect, it, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
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
      mockErrorPayload,
    );
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
  });
});
