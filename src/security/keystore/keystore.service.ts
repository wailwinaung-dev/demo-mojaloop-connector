import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, extname, isAbsolute, resolve } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MojaloopConfigService } from '../../config/mojaloop-config.service.js';

@Injectable()
export class KeystoreService implements OnModuleInit {
  private readonly logger = new Logger(KeystoreService.name);

  private ownJwsPrivateKey: string = '';
  private ownJwsPublicKey: string = '';
  private readonly peerJwsPublicKeys = new Map<string, string>();

  constructor(private readonly config: MojaloopConfigService) {}

  public onModuleInit(): void {
    this.initializeKeys();
  }

  /**
   * Loads a key from a file path.
   * Throws an error immediately if the file does not exist (Fail-Fast).
   */
  private loadKeyFromFile(
    filePath: string,
    keyType: 'private' | 'public',
  ): string {
    const trimmedPath = filePath.trim();
    const resolvedPath = isAbsolute(trimmedPath)
      ? trimmedPath
      : resolve(process.cwd(), trimmedPath);

    if (!existsSync(resolvedPath)) {
      throw new Error(
        `JWS ${keyType} key file not found at path: ${resolvedPath}`,
      );
    }

    this.logger.debug(
      `Reading JWS ${keyType} key from file path: ${resolvedPath}`,
    );
    return readFileSync(resolvedPath, 'utf8').trim();
  }

  /**
   * Initializes the connector's cryptographic RSA keys from file paths.
   * Fails fast if key files are missing to prevent running in an unauthenticated state.
   */
  public initializeKeys(): void {
    const privateKeyPath =
      this.config.jwsPrivateKeyPath || './certs/jws/dfsp-jws-private.pem';
    const publicKeyPath =
      this.config.jwsPublicKeyPath || './certs/jws/dfsp-jws-public.pem';

    this.ownJwsPrivateKey = this.loadKeyFromFile(privateKeyPath, 'private');
    this.ownJwsPublicKey = this.loadKeyFromFile(publicKeyPath, 'public');

    this.logger.log(
      `Loaded JWS RSA key pair successfully from file paths. Algorithm: ${this.getJwsAlgorithm()}`,
    );

    this.loadPeerKeys();
  }

  /**
   * Automatically discovers and loads peer DFSP / Switch public keys or certificates
   * from the certs/jws/peers directory.
   */
  public loadPeerKeys(peersDirectory?: string): void {
    const peersPath = peersDirectory || './certs/jws/peers';
    const resolvedPeersPath = isAbsolute(peersPath)
      ? peersPath
      : resolve(process.cwd(), peersPath);

    if (!existsSync(resolvedPeersPath)) {
      this.logger.debug(
        `Peer keys directory does not exist: ${resolvedPeersPath}. Skipping peer key auto-loading.`,
      );
      return;
    }

    const files = readdirSync(resolvedPeersPath);
    for (const file of files) {
      const ext = extname(file).toLowerCase();
      if (['.pem', '.cer', '.crt', '.key'].includes(ext)) {
        const dfspId = basename(file, ext);
        const fullFilePath = resolve(resolvedPeersPath, file);
        try {
          const content = readFileSync(fullFilePath, 'utf8').trim();
          if (content) {
            this.registerPeerJwsPublicKey(dfspId, content);
            this.logger.log(
              `Auto-loaded peer JWS key for DFSP '${dfspId}' from ${file}`,
            );
          }
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Failed to read peer key file ${file}: ${errorMsg}`,
          );
        }
      }
    }
  }

  /**
   * Returns the DFSP's own JWS private key in PEM format.
   */
  public getJwsPrivateKey(): string {
    return this.ownJwsPrivateKey;
  }

  /**
   * Returns the DFSP's own JWS public key in PEM format.
   */
  public getJwsPublicKey(): string {
    return this.ownJwsPublicKey;
  }

  /**
   * Explicitly sets own JWS keys (used for testing or dynamic certificate rotation).
   */
  public setOwnJwsKeys(privateKeyPem: string, publicKeyPem: string): void {
    this.ownJwsPrivateKey = privateKeyPem.trim();
    this.ownJwsPublicKey = publicKeyPem.trim();
  }

  /**
   * Returns the configured JWS signing algorithm (e.g. 'RS256').
   */
  public getJwsAlgorithm(): string {
    return this.config.jwsAlgorithm || 'RS256';
  }

  /**
   * Registers a peer DFSP or Switch's JWS public key in the keystore.
   */
  public registerPeerJwsPublicKey(dfspId: string, publicKeyPem: string): void {
    this.peerJwsPublicKeys.set(dfspId, publicKeyPem.trim());
    this.logger.debug(`Registered peer JWS public key for DFSP: ${dfspId}`);
  }

  /**
   * Retrieves a peer DFSP or Switch's JWS public key by FSP ID.
   */
  public getPeerJwsPublicKey(dfspId: string): string | undefined {
    return this.peerJwsPublicKeys.get(dfspId);
  }

  /**
   * Checks whether a JWS public key is registered for the specified DFSP.
   */
  public hasPeerJwsPublicKey(dfspId: string): boolean {
    return this.peerJwsPublicKeys.has(dfspId);
  }

  /**
   * Clears all registered peer JWS public keys (used primarily for testing).
   */
  public clearPeerJwsKeys(): void {
    this.peerJwsPublicKeys.clear();
  }
}
