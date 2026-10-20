import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwsVerificationGuard } from './jws-verification.guard.js';
import type { JwsService } from './jws.service.js';
import type { ExecutionContext } from '@nestjs/common';

function createMockContext(
  method: string,
  headers: Record<string, string>,
  body?: unknown,
  path = '/parties/MSISDN/0911111111',
  rawBody?: Buffer | string,
): ExecutionContext {
  const request = {
    method,
    headers,
    path,
    url: path,
    body: body ?? {},
    rawBody,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('JwsVerificationGuard', () => {
  let guard: JwsVerificationGuard;
  let mockJwsService: { verify: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockJwsService = {
      verify: vi.fn().mockReturnValue(true),
    };

    guard = new JwsVerificationGuard(
      mockJwsService as unknown as JwsService,
    );
  });

  describe('GET requests (no JWS required)', () => {
    it('should allow GET requests without any signature', () => {
      const ctx = createMockContext('GET', {
        'fspiop-source': 'dfsp-a',
      });

      expect(guard.canActivate(ctx)).toBe(true);
      expect(mockJwsService.verify).not.toHaveBeenCalled();
    });
  });

  describe('DELETE requests (no JWS required)', () => {
    it('should allow DELETE requests without any signature', () => {
      const ctx = createMockContext('DELETE', {
        'fspiop-source': 'dfsp-a',
      });

      expect(guard.canActivate(ctx)).toBe(true);
      expect(mockJwsService.verify).not.toHaveBeenCalled();
    });
  });

  describe('PUT/POST requests (JWS required)', () => {
    it('should allow PUT request with valid signature and pass context to verify', () => {
      const body = { party: { name: 'Alice' } };
      const date = 'Mon, 19 Oct 2026 05:00:00 GMT';
      const ctx = createMockContext(
        'PUT',
        {
          'fspiop-source': 'dfsp-a',
          'fspiop-signature': 'valid.jws.token',
          date,
        },
        body,
        '/parties/MSISDN/0911111111',
      );

      expect(guard.canActivate(ctx)).toBe(true);
      expect(mockJwsService.verify).toHaveBeenCalledWith({
        signatureHeader: 'valid.jws.token',
        sourceFsp: 'dfsp-a',
        uri: '/parties/MSISDN/0911111111',
        httpMethod: 'PUT',
        body,
        rawBody: undefined,
        date,
      });
    });

    it('should allow POST request with valid signature', () => {
      const body = { quoteId: 'q-1' };
      const ctx = createMockContext(
        'POST',
        {
          'fspiop-source': 'dfsp-a',
          'fspiop-signature': 'valid.jws.token',
        },
        body,
        '/quotes',
      );

      expect(guard.canActivate(ctx)).toBe(true);
      expect(mockJwsService.verify).toHaveBeenCalledWith({
        signatureHeader: 'valid.jws.token',
        sourceFsp: 'dfsp-a',
        uri: '/quotes',
        httpMethod: 'POST',
        body,
        rawBody: undefined,
        date: undefined,
      });
    });

    it('should forward request.rawBody to jwsService.verify when present', () => {
      const rawBody = Buffer.from('{"party":{"name":"Alice"}}');
      const ctx = createMockContext(
        'PUT',
        {
          'fspiop-source': 'dfsp-a',
          'fspiop-signature': 'valid.jws.token',
        },
        { party: { name: 'Alice' } },
        '/parties/MSISDN/0911111111',
        rawBody,
      );

      expect(guard.canActivate(ctx)).toBe(true);
      expect(mockJwsService.verify).toHaveBeenCalledWith({
        signatureHeader: 'valid.jws.token',
        sourceFsp: 'dfsp-a',
        uri: '/parties/MSISDN/0911111111',
        httpMethod: 'PUT',
        body: { party: { name: 'Alice' } },
        rawBody,
        date: undefined,
      });
    });

    it('should throw ForbiddenException when fspiop-signature header is missing', () => {
      const ctx = createMockContext('PUT', {
        'fspiop-source': 'dfsp-a',
      });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when fspiop-source header is missing', () => {
      const ctx = createMockContext('POST', {
        'fspiop-signature': 'some.jws.token',
      });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when signature verification fails', () => {
      mockJwsService.verify.mockReturnValue(false);

      const ctx = createMockContext(
        'PUT',
        {
          'fspiop-source': 'dfsp-a',
          'fspiop-signature': 'invalid.jws.token',
        },
        { data: 'tampered' },
      );

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
