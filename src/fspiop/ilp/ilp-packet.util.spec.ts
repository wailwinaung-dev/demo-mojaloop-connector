import { describe, expect, it } from 'vitest';
import {
  createIlpPreparePacket,
  formatIlpTimestamp,
  parseIlpPreparePacket,
} from './ilp-packet.util.js';
import { IlpService } from './ilp.service.js';

describe('IlpPacket Utilities', () => {
  const ilpService = new IlpService();

  it('should format date into 17-character ILP timestamp', () => {
    const timestamp = formatIlpTimestamp('2026-10-13T12:00:00.123Z');
    expect(timestamp).toBe('20261013120000123');
    expect(timestamp.length).toBe(17);
  });

  it('should create and parse an ILP Prepare packet accurately (Roundtrip)', () => {
    const { condition } = ilpService.generatePreimageAndCondition();

    const params = {
      amount: '500',
      executionCondition: condition,
      expiresAt: '2026-10-13T12:00:00.000Z',
      destination: 'g.mojaloop.dfsp-b.0911111111',
      data: {
        quoteId: 'quote-test-1',
        note: 'Payment for services',
      },
    };

    const base64urlPacket = createIlpPreparePacket(params);

    expect(base64urlPacket).toBeDefined();
    expect(typeof base64urlPacket).toBe('string');

    // Parse packet back
    const parsed = parseIlpPreparePacket(base64urlPacket);

    expect(parsed.amount).toBe('500');
    expect(parsed.executionCondition).toBe(condition);
    expect(parsed.destination).toBe('g.mojaloop.dfsp-b.0911111111');
    expect(parsed.data).toEqual({
      quoteId: 'quote-test-1',
      note: 'Payment for services',
    });
  });

  it('should handle empty data payload gracefully', () => {
    const { condition } = ilpService.generatePreimageAndCondition();

    const packet = createIlpPreparePacket({
      amount: 100,
      executionCondition: condition,
      expiresAt: new Date(),
      destination: 'g.mojaloop.dfsp-a.alice',
    });

    const parsed = parseIlpPreparePacket(packet);
    expect(parsed.amount).toBe('100');
    expect(parsed.destination).toBe('g.mojaloop.dfsp-a.alice');
    expect(parsed.data).toBe('');
  });

  it('should throw error when condition length is not 32 bytes', () => {
    expect(() =>
      createIlpPreparePacket({
        amount: '100',
        executionCondition: 'short',
        expiresAt: new Date(),
        destination: 'g.mojaloop.dfsp-a',
      }),
    ).toThrow(/Condition buffer must be exactly 32 bytes/);
  });
});
