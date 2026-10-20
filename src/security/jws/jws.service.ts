import { createSign, createVerify } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { KeystoreService } from '../keystore/keystore.service.js';

/**
 * Input required to produce an FSPIOP JWS signature for an outbound request.
 */
export interface JwsSigningInput {
  /** The FSPIOP request URI path, e.g. "/parties/MSISDN/0911111111" */
  uri: string;
  /** The HTTP method, e.g. "PUT" or "POST" */
  httpMethod: string;
  /** The FSPIOP-Source (this DFSP's identifier), e.g. "dfsp-b" */
  sourceFsp: string;
  /** The FSPIOP-Destination (target DFSP's identifier). Included in protected header if known. */
  destinationFsp?: string;
  /** The HTTP Date header value. Included in protected header if present. */
  date?: string;
  /** The JSON request body to sign */
  body: unknown;
}

/**
 * The FSPIOP-Signature header value as defined in the Mojaloop spec (Table 1).
 */
export interface FspiopSignatureObject {
  signature: string;
  protectedHeader: string;
}

// ---------------------------------------------------------------------------
// Base64URL helpers (RFC 7515 §2)
// ---------------------------------------------------------------------------

function base64url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlFromBuffer(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(encoded: string): string {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function base64urlToBuffer(encoded: string): Buffer {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

// ---------------------------------------------------------------------------
// Algorithm mapping (JWS alg → Node.js hash)
// ---------------------------------------------------------------------------

const JWS_ALG_TO_NODE_HASH: Record<string, string> = {
  RS256: 'RSA-SHA256',
  RS384: 'RSA-SHA384',
  RS512: 'RSA-SHA512',
};

function resolveNodeHash(alg: string): string {
  const hash = JWS_ALG_TO_NODE_HASH[alg];
  if (!hash) {
    throw new Error(`Unsupported JWS algorithm: ${alg}`);
  }
  return hash;
}

export interface JwsVerifyInput {
  /** The fspiop-signature header value (JSON string with signature + protectedHeader) */
  signatureHeader: string;
  /** The DFSP identifier from fspiop-source header */
  sourceFsp: string;
  /** Expected request URI path (e.g. "/transfers") to prevent cross-endpoint replay attacks */
  uri: string;
  /** Expected HTTP method (e.g. "POST" or "PUT") to prevent method tampering */
  httpMethod: string;
  /** The parsed HTTP request body */
  body: unknown;
  /** Raw unparsed HTTP request body (Buffer or string) preserved from the network socket */
  rawBody?: Buffer | string;
  /** Inbound HTTP Date header (if present) for time-based replay validation */
  date?: string;
  /** Maximum allowable clock skew in seconds (default: 300s / 5 mins) */
  maxClockSkewSeconds?: number;
}

/**
 * Service responsible for creating and verifying FSPIOP JWS signatures
 * as defined in the Mojaloop FSPIOP API Signature specification v1.1.
 *
 * The JWS protected header contains:
 *   { alg, "FSPIOP-URI", "FSPIOP-HTTP-Method", "FSPIOP-Source",
 *     "FSPIOP-Destination" (if known), "Date" (if present) }
 *
 * The JWS payload is the HTTP request body (JSON-serialized).
 *
 * The fspiop-signature header value is a JSON object:
 *   { "signature": "BASE64URL(JWS Signature)", "protectedHeader": "BASE64URL(JWS Protected Header)" }
 */
@Injectable()
export class JwsService {
  private readonly logger = new Logger(JwsService.name);

  constructor(private readonly keystore: KeystoreService) {}

  /**
   * Signs an outbound FSPIOP request and returns the JSON string
   * to be placed in the `fspiop-signature` HTTP header.
   *
   * @returns JSON string: `{"signature":"...","protectedHeader":"..."}`
   */
  sign(input: JwsSigningInput): string {
    const algorithm = this.keystore.getJwsAlgorithm();

    // 1. Build the FSPIOP JWS Protected Header (required fields)
    const protectedHeaderObject: Record<string, string> = {
      alg: algorithm,
      'FSPIOP-URI': input.uri,
      'FSPIOP-HTTP-Method': input.httpMethod.toUpperCase(),
      'FSPIOP-Source': input.sourceFsp,
    };

    // Conditional fields per spec: include only if known/present
    if (input.destinationFsp) {
      protectedHeaderObject['FSPIOP-Destination'] = input.destinationFsp;
    }
    if (input.date) {
      protectedHeaderObject['Date'] = input.date;
    }

    // 2. Base64URL-encode header and payload
    const encodedHeader = base64url(JSON.stringify(protectedHeaderObject));
    const encodedPayload = base64url(JSON.stringify(input.body));

    // 3. Compute RSA signature over "encodedHeader.encodedPayload"
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signer = createSign(resolveNodeHash(algorithm));
    signer.update(signingInput);
    const signatureBuffer = signer.sign(this.keystore.getJwsPrivateKey());
    const encodedSignature = base64urlFromBuffer(signatureBuffer);

    this.logger.debug(
      `JWS signed: ${input.httpMethod.toUpperCase()} ${input.uri} (Source: ${input.sourceFsp})`,
    );

    // 4. Return as Mojaloop JSON format: { signature, protectedHeader }
    const signatureObject: FspiopSignatureObject = {
      signature: encodedSignature,
      protectedHeader: encodedHeader,
    };

    return JSON.stringify(signatureObject);
  }

  /**
   * Verifies an inbound FSPIOP request's JWS signature against the sending
   * DFSP's registered public key.
   *
   * Replay Protection & Strict Claim Validation:
   * - FSPIOP-Source in protected header MUST match `sourceFsp`
   * - FSPIOP-URI in protected header MUST match `uri` (cross-endpoint replay prevention)
   * - FSPIOP-HTTP-Method in protected header MUST match `httpMethod` (method tampering prevention)
   * - Date (if provided) in protected header MUST match HTTP Date and not be expired
   *
   * @param input JwsVerifyInput object or signatureHeader string (for overloaded invocation)
   * @returns `true` if the signature and claims are valid, `false` otherwise
   */
  verify(input: JwsVerifyInput): boolean;
  verify(
    signatureHeader: string,
    sourceFsp: string,
    uri: string,
    httpMethod: string,
    body: unknown,
    options?: { date?: string; maxClockSkewSeconds?: number; rawBody?: Buffer | string },
  ): boolean;
  verify(
    inputOrSignature: JwsVerifyInput | string,
    sourceFsp?: string,
    uriOrBody?: string | unknown,
    httpMethod?: string,
    legacyBody?: unknown,
    options?: { date?: string; maxClockSkewSeconds?: number; rawBody?: Buffer | string },
  ): boolean {
    let input: JwsVerifyInput;
    if (typeof inputOrSignature === 'string') {
      if (typeof uriOrBody === 'string' && httpMethod) {
        input = {
          signatureHeader: inputOrSignature,
          sourceFsp: sourceFsp!,
          uri: uriOrBody,
          httpMethod,
          body: legacyBody,
          rawBody: options?.rawBody,
          date: options?.date,
          maxClockSkewSeconds: options?.maxClockSkewSeconds,
        };
      } else {
        input = {
          signatureHeader: inputOrSignature,
          sourceFsp: sourceFsp!,
          uri: '',
          httpMethod: '',
          body: uriOrBody,
        };
      }
    } else {
      input = inputOrSignature;
    }

    // 1. Validate required fields in input
    if (
      !input.signatureHeader ||
      !input.sourceFsp ||
      !input.uri ||
      !input.httpMethod
    ) {
      this.logger.warn(
        `JWS verification failed: Missing required verification parameters (signatureHeader, sourceFsp, uri, or httpMethod)`,
      );
      return false;
    }

    // 2. Parse the fspiop-signature JSON object
    let signatureObject: FspiopSignatureObject;
    try {
      signatureObject = JSON.parse(input.signatureHeader);
    } catch {
      this.logger.warn('Failed to parse fspiop-signature header as JSON');
      return false;
    }

    if (!signatureObject.signature || !signatureObject.protectedHeader) {
      this.logger.warn(
        'fspiop-signature header missing "signature" or "protectedHeader" field',
      );
      return false;
    }

    const { signature: encodedSignature, protectedHeader: encodedHeader } =
      signatureObject;

    // 3. Look up the peer DFSP's public key
    const peerPublicKey = this.keystore.getPeerJwsPublicKey(input.sourceFsp);
    if (!peerPublicKey) {
      this.logger.warn(
        `No JWS public key registered for DFSP: ${input.sourceFsp}. Verification cannot proceed.`,
      );
      return false;
    }

    // 4. Parse the protected header to extract claims
    let header: {
      alg: string;
      'FSPIOP-URI'?: string;
      'FSPIOP-HTTP-Method'?: string;
      'FSPIOP-Source'?: string;
      'FSPIOP-Destination'?: string;
      Date?: string;
    };
    try {
      header = JSON.parse(base64urlDecode(encodedHeader));
    } catch {
      this.logger.warn('Failed to parse JWS protected header');
      return false;
    }

    // 5. Replay Protection: Validate Protected Header claims against request context

    // 5a. FSPIOP-Source MUST be present and match sourceFsp
    if (
      !header['FSPIOP-Source'] ||
      header['FSPIOP-Source'] !== input.sourceFsp
    ) {
      this.logger.warn(
        `JWS verification failed: FSPIOP-Source mismatch. ProtectedHeader=${header['FSPIOP-Source']}, Expected=${input.sourceFsp}`,
      );
      return false;
    }

    // 5b. FSPIOP-URI MUST be present and match request URI (cross-endpoint replay prevention)
    const normalizeUri = (u: string) => u.replace(/\/+$/, '') || '/';
    if (
      !header['FSPIOP-URI'] ||
      normalizeUri(header['FSPIOP-URI']) !== normalizeUri(input.uri)
    ) {
      this.logger.warn(
        `JWS verification failed: FSPIOP-URI mismatch (cross-endpoint replay detected). ProtectedHeader=${header['FSPIOP-URI']}, RequestURI=${input.uri}`,
      );
      return false;
    }

    // 5c. FSPIOP-HTTP-Method MUST be present and match request method (method tampering prevention)
    if (
      !header['FSPIOP-HTTP-Method'] ||
      header['FSPIOP-HTTP-Method'].toUpperCase() !==
        input.httpMethod.toUpperCase()
    ) {
      this.logger.warn(
        `JWS verification failed: FSPIOP-HTTP-Method mismatch. ProtectedHeader=${header['FSPIOP-HTTP-Method']}, RequestMethod=${input.httpMethod}`,
      );
      return false;
    }

    // 5d. Date / Temporal Replay Protection
    // If HTTP Date was provided, protected header MUST contain Date and match
    if (input.date) {
      if (!header['Date']) {
        this.logger.warn(
          `JWS verification failed: HTTP Date header present ('${input.date}') but protected header missing 'Date'`,
        );
        return false;
      }
      if (header['Date'] !== input.date) {
        this.logger.warn(
          `JWS verification failed: Date mismatch between HTTP header ('${input.date}') and protected header ('${header['Date']}')`,
        );
        return false;
      }
    }

    // If protected header has Date, validate expiration / clock skew
    if (header['Date']) {
      const headerTimestamp = Date.parse(header['Date']);
      if (isNaN(headerTimestamp)) {
        this.logger.warn(
          `JWS verification failed: Invalid Date format in protected header: '${header['Date']}'`,
        );
        return false;
      }
      const maxSkewMs = (input.maxClockSkewSeconds ?? 300) * 1000;
      const diffMs = Math.abs(Date.now() - headerTimestamp);
      if (diffMs > maxSkewMs) {
        this.logger.warn(
          `JWS verification failed: Message expired or clock skew exceeded. HeaderDate=${header['Date']}, DiffSeconds=${Math.round(diffMs / 1000)}s, AllowedMax=${input.maxClockSkewSeconds ?? 300}s`,
        );
        return false;
      }
    }

    // 6. Encode the received body as the JWS payload
    // If raw wire bytes are provided, use them to preserve exact formatting/key-order
    let encodedPayload: string;
    if (input.rawBody) {
      encodedPayload = Buffer.isBuffer(input.rawBody)
        ? base64urlFromBuffer(input.rawBody)
        : base64url(input.rawBody);
    } else {
      encodedPayload = base64url(JSON.stringify(input.body));
    }
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    // 7. Verify cryptographic signature
    try {
      const verifier = createVerify(resolveNodeHash(header.alg));
      verifier.update(signingInput);
      const isValid = verifier.verify(
        peerPublicKey,
        base64urlToBuffer(encodedSignature),
      );

      if (!isValid) {
        this.logger.warn(
          `JWS signature verification FAILED for DFSP: ${input.sourceFsp}`,
        );
      }

      return isValid;
    } catch (err: any) {
      this.logger.error(
        `JWS verification error for DFSP ${input.sourceFsp}: ${err.message}`,
        err.stack,
      );
      return false;
    }
  }
}
