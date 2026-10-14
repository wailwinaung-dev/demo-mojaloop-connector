import { describe, expect, it, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { InboundController } from './inbound.controller.js';

describe('InboundController', () => {
  it('should immediately return HTTP 202 Accepted and dispatch async lookup', () => {
    const mockInboundService = {
      handlePartyLookup: vi.fn().mockResolvedValue(undefined),
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
});
