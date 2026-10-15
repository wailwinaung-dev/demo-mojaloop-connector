import { createSign, createVerify, generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { KeystoreService } from './keystore.service.js';
import type { MojaloopConfigService } from '../../config/mojaloop-config.service.js';

describe('KeystoreService', () => {
  let keystoreService: KeystoreService;
  let mockConfig: {
    jwsAlgorithm: string;
    jwsPrivateKeyPath?: string;
    jwsPublicKeyPath?: string;
  };

  beforeEach(() => {
    mockConfig = {
      jwsAlgorithm: 'RS256',
      jwsPrivateKeyPath: undefined,
      jwsPublicKeyPath: undefined,
    };

    keystoreService = new KeystoreService(
      mockConfig as unknown as MojaloopConfigService,
    );
  });

  describe('Fail-Fast and Key Loading', () => {
    it('should load default key files from certs/jws if present', () => {
      keystoreService.initializeKeys();

      const privateKey = keystoreService.getJwsPrivateKey();
      const publicKey = keystoreService.getJwsPublicKey();

      expect(privateKey).toContain('-----BEGIN PRIVATE KEY-----');
      expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(keystoreService.getJwsAlgorithm()).toBe('RS256');

      // Verify that the key pair is cryptographically functional
      const testData = 'Mojaloop Interoperability Test Payload';
      const signer = createSign('RSA-SHA256');
      signer.update(testData);
      const signature = signer.sign(privateKey, 'base64');

      const verifier = createVerify('RSA-SHA256');
      verifier.update(testData);
      const isValid = verifier.verify(publicKey, signature, 'base64');

      expect(isValid).toBe(true);
    });

    it('should throw an error immediately if key path does not exist (Fail-Fast)', () => {
      mockConfig.jwsPrivateKeyPath = './certs/non-existent-key.pem';
      mockConfig.jwsPublicKeyPath = './certs/non-existent-pub.pem';

      expect(() => keystoreService.initializeKeys()).toThrow(
        /JWS private key file not found/,
      );
    });
  });

  describe('Manual Key Updates and Path Configuration', () => {
    it('should allow manually updating own keys via setOwnJwsKeys', () => {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      keystoreService.setOwnJwsKeys(privateKey, publicKey);

      expect(keystoreService.getJwsPrivateKey()).toBe(privateKey.trim());
      expect(keystoreService.getJwsPublicKey()).toBe(publicKey.trim());
    });

    it('should load keys from file paths when configured', async () => {
      const { writeFileSync, unlinkSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');

      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const privPath = join(tmpdir(), `test-priv-${Date.now()}.pem`);
      const pubPath = join(tmpdir(), `test-pub-${Date.now()}.pem`);

      writeFileSync(privPath, privateKey);
      writeFileSync(pubPath, publicKey);

      try {
        mockConfig.jwsPrivateKeyPath = privPath;
        mockConfig.jwsPublicKeyPath = pubPath;

        keystoreService.initializeKeys();

        expect(keystoreService.getJwsPrivateKey()).toBe(privateKey.trim());
        expect(keystoreService.getJwsPublicKey()).toBe(publicKey.trim());
      } finally {
        unlinkSync(privPath);
        unlinkSync(pubPath);
      }
    });

    it('should throw an error if key file path does not exist', () => {
      mockConfig.jwsPrivateKeyPath = './non-existent-key.pem';
      mockConfig.jwsPublicKeyPath = './non-existent-pub.pem';

      expect(() => keystoreService.initializeKeys()).toThrow(
        /JWS private key file not found/,
      );
    });
  });

  describe('Peer Public Key Registry', () => {
    it('should register and retrieve peer JWS public keys', () => {
      const { publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      keystoreService.registerPeerJwsPublicKey(
        'testingtoolkitdfsp',
        publicKey,
      );

      expect(keystoreService.hasPeerJwsPublicKey('testingtoolkitdfsp')).toBe(
        true,
      );
      expect(keystoreService.getPeerJwsPublicKey('testingtoolkitdfsp')).toBe(
        publicKey.trim(),
      );
      expect(keystoreService.hasPeerJwsPublicKey('unknown-dfsp')).toBe(false);
      expect(
        keystoreService.getPeerJwsPublicKey('unknown-dfsp'),
      ).toBeUndefined();
    });

    it('should clear registered peer JWS keys', () => {
      keystoreService.registerPeerJwsPublicKey('dfsp-c', 'sample-pem-key');
      expect(keystoreService.hasPeerJwsPublicKey('dfsp-c')).toBe(true);

      keystoreService.clearPeerJwsKeys();
      expect(keystoreService.hasPeerJwsPublicKey('dfsp-c')).toBe(false);
    });
  });
});
