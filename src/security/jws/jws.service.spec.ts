import { createSign, createVerify, generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { JwsService } from './jws.service.js';
import type { FspiopSignatureObject } from './jws.service.js';
import type { KeystoreService } from '../keystore/keystore.service.js';

/**
 * Generates a fresh RSA-2048 key pair for isolated test runs.
 */
function generateTestKeyPair() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(encoded: string): string {
  return Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

describe('JwsService', () => {
  let jwsService: JwsService;
  let ownPrivateKey: string;
  let ownPublicKey: string;
  const peerKeys = new Map<string, string>();

  beforeEach(() => {
    const keyPair = generateTestKeyPair();
    ownPrivateKey = keyPair.privateKey;
    ownPublicKey = keyPair.publicKey;
    peerKeys.clear();

    const mockKeystore = {
      getJwsAlgorithm: () => 'RS256',
      getJwsPrivateKey: () => ownPrivateKey,
      getJwsPublicKey: () => ownPublicKey,
      getPeerJwsPublicKey: (dfspId: string) => peerKeys.get(dfspId),
    } as unknown as KeystoreService;

    jwsService = new JwsService(mockKeystore);
  });

  describe('sign()', () => {
    it('should return a JSON string with "signature" and "protectedHeader" fields', () => {
      const result = jwsService.sign({
        uri: '/parties/MSISDN/0911111111',
        httpMethod: 'PUT',
        sourceFsp: 'dfsp-b',
        body: { party: { name: 'Test User' } },
      });

      const parsed: FspiopSignatureObject = JSON.parse(result);
      expect(parsed).toHaveProperty('signature');
      expect(parsed).toHaveProperty('protectedHeader');
      expect(parsed.signature.length).toBeGreaterThan(0);
      expect(parsed.protectedHeader.length).toBeGreaterThan(0);
    });

    it('should include required FSPIOP fields in the protected header', () => {
      const result = jwsService.sign({
        uri: '/quotes/abc-123',
        httpMethod: 'post',
        sourceFsp: 'dfsp-b',
        body: { quoteId: 'abc-123' },
      });

      const parsed: FspiopSignatureObject = JSON.parse(result);
      const header = JSON.parse(base64urlDecode(parsed.protectedHeader));

      expect(header).toEqual({
        alg: 'RS256',
        'FSPIOP-URI': '/quotes/abc-123',
        'FSPIOP-HTTP-Method': 'POST',
        'FSPIOP-Source': 'dfsp-b',
      });
    });

    it('should include FSPIOP-Destination in protected header when provided', () => {
      const result = jwsService.sign({
        uri: '/quotes/abc-123',
        httpMethod: 'POST',
        sourceFsp: 'dfsp-b',
        destinationFsp: 'dfsp-a',
        body: { quoteId: 'abc-123' },
      });

      const parsed: FspiopSignatureObject = JSON.parse(result);
      const header = JSON.parse(base64urlDecode(parsed.protectedHeader));

      expect(header['FSPIOP-Destination']).toBe('dfsp-a');
    });

    it('should NOT include FSPIOP-Destination when not provided', () => {
      const result = jwsService.sign({
        uri: '/parties/MSISDN/123',
        httpMethod: 'PUT',
        sourceFsp: 'dfsp-b',
        body: {},
      });

      const parsed: FspiopSignatureObject = JSON.parse(result);
      const header = JSON.parse(base64urlDecode(parsed.protectedHeader));

      expect(header).not.toHaveProperty('FSPIOP-Destination');
    });

    it('should include Date in protected header when provided', () => {
      const dateStr = 'Tue, 23 May 2017 21:12:31 GMT';
      const result = jwsService.sign({
        uri: '/quotes/q-1',
        httpMethod: 'POST',
        sourceFsp: 'dfsp-b',
        date: dateStr,
        body: { quoteId: 'q-1' },
      });

      const parsed: FspiopSignatureObject = JSON.parse(result);
      const header = JSON.parse(base64urlDecode(parsed.protectedHeader));

      expect(header['Date']).toBe(dateStr);
    });

    it('should produce a cryptographically valid RSA-SHA256 signature', () => {
      const body = { transferId: 'tx-001', amount: { amount: '100', currency: 'USD' } };
      const result = jwsService.sign({
        uri: '/transfers/tx-001',
        httpMethod: 'PUT',
        sourceFsp: 'dfsp-b',
        body,
      });

      const parsed: FspiopSignatureObject = JSON.parse(result);
      const encodedPayload = base64url(JSON.stringify(body));
      const signingInput = `${parsed.protectedHeader}.${encodedPayload}`;

      const signatureBuffer = Buffer.from(
        parsed.signature.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      );
      const verifier = createVerify('RSA-SHA256');
      verifier.update(signingInput);
      expect(verifier.verify(ownPublicKey, signatureBuffer)).toBe(true);
    });
  });

  describe('verify()', () => {
    /** Helper: simulate a peer DFSP signing a request */
    function peerSign(
      peerPrivateKey: string,
      body: unknown,
      opts: {
        uri?: string;
        method?: string;
        source?: string;
        destination?: string;
        date?: string;
      },
    ): string {
      const headerObj: Record<string, string> = {
        alg: 'RS256',
      };
      if (opts.uri !== undefined) headerObj['FSPIOP-URI'] = opts.uri;
      if (opts.method !== undefined)
        headerObj['FSPIOP-HTTP-Method'] = opts.method;
      if (opts.source !== undefined) headerObj['FSPIOP-Source'] = opts.source;
      if (opts.destination) headerObj['FSPIOP-Destination'] = opts.destination;
      if (opts.date) headerObj['Date'] = opts.date;

      const encodedHeader = base64url(JSON.stringify(headerObj));
      const encodedPayload = base64url(JSON.stringify(body));
      const signingInput = `${encodedHeader}.${encodedPayload}`;

      const signer = createSign('RSA-SHA256');
      signer.update(signingInput);
      const sig = signer
        .sign(peerPrivateKey)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      return JSON.stringify({ signature: sig, protectedHeader: encodedHeader });
    }

    it('should return true for a valid signature with JwsVerifyInput object', () => {
      const peerKeyPair = generateTestKeyPair();
      peerKeys.set('dfsp-a', peerKeyPair.publicKey);

      const body = { party: { name: 'Alice' } };
      const sigHeader = peerSign(peerKeyPair.privateKey, body, {
        uri: '/parties/MSISDN/0911111111',
        method: 'PUT',
        source: 'dfsp-a',
      });

      const result = jwsService.verify({
        signatureHeader: sigHeader,
        sourceFsp: 'dfsp-a',
        uri: '/parties/MSISDN/0911111111',
        httpMethod: 'PUT',
        body,
      });

      expect(result).toBe(true);
    });

    it('should return true for a valid signature with positional arguments', () => {
      const peerKeyPair = generateTestKeyPair();
      peerKeys.set('dfsp-a', peerKeyPair.publicKey);

      const body = { party: { name: 'Alice' } };
      const sigHeader = peerSign(peerKeyPair.privateKey, body, {
        uri: '/parties/MSISDN/0911111111',
        method: 'PUT',
        source: 'dfsp-a',
      });

      const result = jwsService.verify(
        sigHeader,
        'dfsp-a',
        '/parties/MSISDN/0911111111',
        'PUT',
        body,
      );

      expect(result).toBe(true);
    });

    it('should verify successfully using rawBody Buffer even when JSON formatting differs', () => {
      const peerKeyPair = generateTestKeyPair();
      peerKeys.set('dfsp-a', peerKeyPair.publicKey);

      // Sender signed pretty-printed JSON with newlines & spaces
      const rawWireJson = '{\n  "amount": "100",\n  "currency": "MMK"\n}';
      const parsedBody = JSON.parse(rawWireJson);

      const headerObj = {
        alg: 'RS256',
        'FSPIOP-URI': '/transfers',
        'FSPIOP-HTTP-Method': 'POST',
        'FSPIOP-Source': 'dfsp-a',
      };
      const encodedHeader = base64url(JSON.stringify(headerObj));
      const encodedPayload = base64url(rawWireJson);
      const signer = createSign('RSA-SHA256');
      signer.update(`${encodedHeader}.${encodedPayload}`);
      const sig = signer
        .sign(peerKeyPair.privateKey)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      const sigHeader = JSON.stringify({
        signature: sig,
        protectedHeader: encodedHeader,
      });

      // Verifying with rawBody Buffer preserves exact wire bytes
      const valid = jwsService.verify({
        signatureHeader: sigHeader,
        sourceFsp: 'dfsp-a',
        uri: '/transfers',
        httpMethod: 'POST',
        body: parsedBody,
        rawBody: Buffer.from(rawWireJson),
      });

      expect(valid).toBe(true);
    });

    it('should verify successfully using rawBody string', () => {
      const peerKeyPair = generateTestKeyPair();
      peerKeys.set('dfsp-a', peerKeyPair.publicKey);

      const rawWireJson = '{"amount": "500", "currency": "USD"}';
      const parsedBody = JSON.parse(rawWireJson);

      const headerObj = {
        alg: 'RS256',
        'FSPIOP-URI': '/quotes',
        'FSPIOP-HTTP-Method': 'POST',
        'FSPIOP-Source': 'dfsp-a',
      };
      const encodedHeader = base64url(JSON.stringify(headerObj));
      const encodedPayload = base64url(rawWireJson);
      const signer = createSign('RSA-SHA256');
      signer.update(`${encodedHeader}.${encodedPayload}`);
      const sig = signer
        .sign(peerKeyPair.privateKey)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      const sigHeader = JSON.stringify({
        signature: sig,
        protectedHeader: encodedHeader,
      });

      const valid = jwsService.verify({
        signatureHeader: sigHeader,
        sourceFsp: 'dfsp-a',
        uri: '/quotes',
        httpMethod: 'POST',
        body: parsedBody,
        rawBody: rawWireJson,
      });

      expect(valid).toBe(true);
    });

    it('should return false when the body has been tampered with', () => {
      const peerKeyPair = generateTestKeyPair();
      peerKeys.set('dfsp-a', peerKeyPair.publicKey);

      const originalBody = { amount: '100' };
      const sigHeader = peerSign(peerKeyPair.privateKey, originalBody, {
        uri: '/transfers/tx-001',
        method: 'PUT',
        source: 'dfsp-a',
      });

      expect(
        jwsService.verify({
          signatureHeader: sigHeader,
          sourceFsp: 'dfsp-a',
          uri: '/transfers/tx-001',
          httpMethod: 'PUT',
          body: { amount: '999' },
        }),
      ).toBe(false);
    });

    it('should return false when no peer public key is registered', () => {
      const sigHeader = JSON.stringify({
        signature: 'fakesig',
        protectedHeader: base64url(
          JSON.stringify({
            alg: 'RS256',
            'FSPIOP-URI': '/transfers',
            'FSPIOP-HTTP-Method': 'POST',
            'FSPIOP-Source': 'unknown-dfsp',
          }),
        ),
      });
      expect(
        jwsService.verify({
          signatureHeader: sigHeader,
          sourceFsp: 'unknown-dfsp',
          uri: '/transfers',
          httpMethod: 'POST',
          body: { test: 1 },
        }),
      ).toBe(false);
    });

    it('should return false for non-JSON signature header', () => {
      peerKeys.set('dfsp-a', ownPublicKey);
      expect(
        jwsService.verify({
          signatureHeader: 'not-valid-json',
          sourceFsp: 'dfsp-a',
          uri: '/transfers',
          httpMethod: 'POST',
          body: {},
        }),
      ).toBe(false);
    });

    it('should return false when signature field is missing', () => {
      peerKeys.set('dfsp-a', ownPublicKey);
      const header = JSON.stringify({ protectedHeader: 'abc' });
      expect(
        jwsService.verify({
          signatureHeader: header,
          sourceFsp: 'dfsp-a',
          uri: '/transfers',
          httpMethod: 'POST',
          body: {},
        }),
      ).toBe(false);
    });

    it('should return false when protectedHeader field is missing', () => {
      peerKeys.set('dfsp-a', ownPublicKey);
      const header = JSON.stringify({ signature: 'abc' });
      expect(
        jwsService.verify({
          signatureHeader: header,
          sourceFsp: 'dfsp-a',
          uri: '/transfers',
          httpMethod: 'POST',
          body: {},
        }),
      ).toBe(false);
    });

    it('should return false when required verification parameters (uri, method, source) are missing', () => {
      peerKeys.set('dfsp-a', ownPublicKey);
      const header = JSON.stringify({
        signature: 'abc',
        protectedHeader: 'def',
      });
      expect(
        jwsService.verify({
          signatureHeader: header,
          sourceFsp: '',
          uri: '',
          httpMethod: '',
          body: {},
        }),
      ).toBe(false);
    });

    describe('Replay Attack Prevention', () => {
      let peerKeyPair: { privateKey: string; publicKey: string };

      beforeEach(() => {
        peerKeyPair = generateTestKeyPair();
        peerKeys.set('dfsp-a', peerKeyPair.publicKey);
      });

      it('should reject when URI does not match (cross-endpoint replay attack)', () => {
        const body = { quoteId: 'q-100', amount: '500' };
        // Legitimate signature created for /quotes
        const sigHeader = peerSign(peerKeyPair.privateKey, body, {
          uri: '/quotes',
          method: 'POST',
          source: 'dfsp-a',
        });

        // Attacker replays this signature to /transfers
        const isReplayAccepted = jwsService.verify({
          signatureHeader: sigHeader,
          sourceFsp: 'dfsp-a',
          uri: '/transfers',
          httpMethod: 'POST',
          body,
        });

        expect(isReplayAccepted).toBe(false);
      });

      it('should reject when HTTP method does not match (method tampering attack)', () => {
        const body = { transferId: 'tx-1' };
        const sigHeader = peerSign(peerKeyPair.privateKey, body, {
          uri: '/transfers',
          method: 'POST',
          source: 'dfsp-a',
        });

        // Replay with PUT instead of POST
        const isReplayAccepted = jwsService.verify({
          signatureHeader: sigHeader,
          sourceFsp: 'dfsp-a',
          uri: '/transfers',
          httpMethod: 'PUT',
          body,
        });

        expect(isReplayAccepted).toBe(false);
      });

      it('should reject when FSPIOP-Source does not match sourceFsp', () => {
        const body = { test: 'data' };
        const sigHeader = peerSign(peerKeyPair.privateKey, body, {
          uri: '/transfers',
          method: 'POST',
          source: 'dfsp-attacker',
        });

        const isReplayAccepted = jwsService.verify({
          signatureHeader: sigHeader,
          sourceFsp: 'dfsp-a',
          uri: '/transfers',
          httpMethod: 'POST',
          body,
        });

        expect(isReplayAccepted).toBe(false);
      });

      it('should reject when protected header is missing FSPIOP-URI claim', () => {
        const body = { test: 123 };
        const sigHeader = peerSign(peerKeyPair.privateKey, body, {
          method: 'POST',
          source: 'dfsp-a',
        });

        expect(
          jwsService.verify({
            signatureHeader: sigHeader,
            sourceFsp: 'dfsp-a',
            uri: '/transfers',
            httpMethod: 'POST',
            body,
          }),
        ).toBe(false);
      });

      it('should reject when protected header is missing FSPIOP-HTTP-Method claim', () => {
        const body = { test: 123 };
        const sigHeader = peerSign(peerKeyPair.privateKey, body, {
          uri: '/transfers',
          source: 'dfsp-a',
        });

        expect(
          jwsService.verify({
            signatureHeader: sigHeader,
            sourceFsp: 'dfsp-a',
            uri: '/transfers',
            httpMethod: 'POST',
            body,
          }),
        ).toBe(false);
      });

      it('should reject when protected header is missing FSPIOP-Source claim', () => {
        const body = { test: 123 };
        const sigHeader = peerSign(peerKeyPair.privateKey, body, {
          uri: '/transfers',
          method: 'POST',
        });

        expect(
          jwsService.verify({
            signatureHeader: sigHeader,
            sourceFsp: 'dfsp-a',
            uri: '/transfers',
            httpMethod: 'POST',
            body,
          }),
        ).toBe(false);
      });

      it('should reject when HTTP Date is provided but missing in protected header', () => {
        const body = { test: 123 };
        const sigHeader = peerSign(peerKeyPair.privateKey, body, {
          uri: '/transfers',
          method: 'POST',
          source: 'dfsp-a',
          // No date in protected header
        });

        expect(
          jwsService.verify({
            signatureHeader: sigHeader,
            sourceFsp: 'dfsp-a',
            uri: '/transfers',
            httpMethod: 'POST',
            body,
            date: new Date().toUTCString(),
          }),
        ).toBe(false);
      });

      it('should reject when HTTP Date does not match protected header Date', () => {
        const body = { test: 123 };
        const sigHeader = peerSign(peerKeyPair.privateKey, body, {
          uri: '/transfers',
          method: 'POST',
          source: 'dfsp-a',
          date: 'Mon, 19 Oct 2026 05:00:00 GMT',
        });

        expect(
          jwsService.verify({
            signatureHeader: sigHeader,
            sourceFsp: 'dfsp-a',
            uri: '/transfers',
            httpMethod: 'POST',
            body,
            date: 'Mon, 19 Oct 2026 05:05:00 GMT', // Mismatched date
          }),
        ).toBe(false);
      });

      it('should reject when message Date is expired (older than maxClockSkewSeconds)', () => {
        const body = { test: 123 };
        // Date 10 minutes (600s) ago
        const pastDate = new Date(Date.now() - 600 * 1000).toUTCString();
        const sigHeader = peerSign(peerKeyPair.privateKey, body, {
          uri: '/transfers',
          method: 'POST',
          source: 'dfsp-a',
          date: pastDate,
        });

        expect(
          jwsService.verify({
            signatureHeader: sigHeader,
            sourceFsp: 'dfsp-a',
            uri: '/transfers',
            httpMethod: 'POST',
            body,
            date: pastDate,
            maxClockSkewSeconds: 300, // 5 min allowed
          }),
        ).toBe(false);
      });

      it('should accept when message Date is valid and within allowable skew', () => {
        const body = { test: 123 };
        // Date 30 seconds ago
        const validDate = new Date(Date.now() - 30 * 1000).toUTCString();
        const sigHeader = peerSign(peerKeyPair.privateKey, body, {
          uri: '/transfers',
          method: 'POST',
          source: 'dfsp-a',
          date: validDate,
        });

        expect(
          jwsService.verify({
            signatureHeader: sigHeader,
            sourceFsp: 'dfsp-a',
            uri: '/transfers',
            httpMethod: 'POST',
            body,
            date: validDate,
            maxClockSkewSeconds: 300,
          }),
        ).toBe(true);
      });
    });
  });

  describe('sign() + verify() round-trip', () => {
    it('should verify a signature produced by sign() when using own keys', () => {
      peerKeys.set('dfsp-b', ownPublicKey);

      const body = {
        quoteId: 'q-123',
        transferAmount: { amount: '500', currency: 'USD' },
      };
      const date = new Date().toUTCString();

      const sigHeader = jwsService.sign({
        uri: '/quotes/q-123',
        httpMethod: 'PUT',
        sourceFsp: 'dfsp-b',
        destinationFsp: 'dfsp-a',
        date,
        body,
      });

      expect(
        jwsService.verify({
          signatureHeader: sigHeader,
          sourceFsp: 'dfsp-b',
          uri: '/quotes/q-123',
          httpMethod: 'PUT',
          body,
          date,
        }),
      ).toBe(true);
    });

    it('should fail round-trip verification if body differs', () => {
      peerKeys.set('dfsp-b', ownPublicKey);

      const body = { amount: '100' };
      const sigHeader = jwsService.sign({
        uri: '/transfers/tx-1',
        httpMethod: 'PUT',
        sourceFsp: 'dfsp-b',
        body,
      });

      expect(
        jwsService.verify({
          signatureHeader: sigHeader,
          sourceFsp: 'dfsp-b',
          uri: '/transfers/tx-1',
          httpMethod: 'PUT',
          body: { amount: '200' },
        }),
      ).toBe(false);
    });

    it('should fail round-trip verification if replayed to different URI', () => {
      peerKeys.set('dfsp-b', ownPublicKey);

      const body = { amount: '100' };
      const sigHeader = jwsService.sign({
        uri: '/transfers/tx-1',
        httpMethod: 'PUT',
        sourceFsp: 'dfsp-b',
        body,
      });

      expect(
        jwsService.verify({
          signatureHeader: sigHeader,
          sourceFsp: 'dfsp-b',
          uri: '/quotes/tx-1', // Wrong endpoint
          httpMethod: 'PUT',
          body,
        }),
      ).toBe(false);
    });
  });
});
