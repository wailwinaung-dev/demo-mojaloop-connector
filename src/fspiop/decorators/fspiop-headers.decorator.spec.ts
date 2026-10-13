import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { parseFspiopHeaders } from './fspiop-headers.decorator.js';

describe('parseFspiopHeaders', () => {
  it('should parse valid FSPIOP headers correctly', () => {
    const rawHeaders = {
      'fspiop-source': 'dfsp-a',
      'fspiop-destination': 'dfsp-b',
      date: 'Tue, 13 Oct 2026 03:00:00 GMT',
      'fspiop-http-method': 'GET',
    };

    const parsed = parseFspiopHeaders(rawHeaders);

    expect(parsed.source).toBe('dfsp-a');
    expect(parsed.destination).toBe('dfsp-b');
    expect(parsed.date).toBe('Tue, 13 Oct 2026 03:00:00 GMT');
    expect(parsed.httpMethod).toBe('GET');
  });

  it('should throw BadRequestException if fspiop-source is missing', () => {
    const rawHeaders = {
      'fspiop-destination': 'dfsp-b',
    };

    expect(() => parseFspiopHeaders(rawHeaders)).toThrow(BadRequestException);
    expect(() => parseFspiopHeaders(rawHeaders)).toThrow(
      "Missing mandatory FSPIOP header: 'fspiop-source'",
    );
  });

  it('should generate a current date header if date is not provided', () => {
    const rawHeaders = {
      'fspiop-source': 'dfsp-a',
    };

    const parsed = parseFspiopHeaders(rawHeaders);
    expect(parsed.source).toBe('dfsp-a');
    expect(parsed.date).toBeDefined();
  });
});
