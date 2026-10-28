import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { mojaloopConfig } from './mojaloop.config.js';

@Injectable()
export class MojaloopConfigService {
  constructor(
    @Inject(mojaloopConfig.KEY)
    private readonly config: ConfigType<typeof mojaloopConfig>,
  ) {}

  get dfspId(): string {
    return this.config.dfspId;
  }

  get defaultCurrency(): string {
    return this.config.defaultCurrency;
  }

  get hubBaseUrl(): string {
    return this.config.hubBaseUrl;
  }

  get callbackTimeoutMs(): number {
    return this.config.callbackTimeoutMs;
  }

  get quoteExpirySeconds(): number {
    return this.config.quoteExpirySeconds;
  }

  get jwsPrivateKeyPath(): string {
    return this.config.jwsPrivateKeyPath;
  }

  get jwsPublicKeyPath(): string {
    return this.config.jwsPublicKeyPath;
  }

  get jwsAlgorithm(): string {
    return this.config.jwsAlgorithm;
  }

  get tlsEnabled(): boolean {
    return this.config.tlsEnabled;
  }

  get tlsServerKeyPath(): string {
    return this.config.tlsServerKeyPath;
  }

  get tlsServerCertPath(): string {
    return this.config.tlsServerCertPath;
  }

  get tlsServerCaPath(): string {
    return this.config.tlsServerCaPath;
  }

  get tlsClientKeyPath(): string {
    return this.config.tlsClientKeyPath;
  }

  get tlsClientCertPath(): string {
    return this.config.tlsClientCertPath;
  }

  get tlsClientCaPath(): string {
    return this.config.tlsClientCaPath;
  }

  get hubTlsRejectUnauthorized(): boolean {
    return this.config.hubTlsRejectUnauthorized;
  }
}
