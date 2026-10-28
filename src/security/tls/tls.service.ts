import https from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { MojaloopConfigService } from '../../config/mojaloop-config.service.js';

@Injectable()
export class TlsService implements OnModuleInit {
  private readonly logger = new Logger(TlsService.name);
  private httpsAgent?: https.Agent;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: MojaloopConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.tlsEnabled) {
      this.logger.log('Outbound mTLS is disabled (TLS_ENABLED is false)');
      return;
    }

    this.initClientAgent();
  }

  private resolvePath(filePath: string): string {
    const trimmed = filePath.trim();
    return isAbsolute(trimmed) ? trimmed : resolve(process.cwd(), trimmed);
  }

  /**
   * Initializes the HTTPS client agent configured with the DFSP's client certificate,
   * private key, and trusted Hub Root CA for outbound mutual TLS.
   */
  public initClientAgent(): void {
    const keyPath = this.resolvePath(this.config.tlsClientKeyPath);
    const certPath = this.resolvePath(this.config.tlsClientCertPath);
    const caPath = this.resolvePath(this.config.tlsClientCaPath);

    if (!existsSync(keyPath) || !existsSync(certPath) || !existsSync(caPath)) {
      throw new Error(
        `[mTLS Error] Client certificate files missing: key=${keyPath}, cert=${certPath}, ca=${caPath}`,
      );
    }

    this.httpsAgent = new https.Agent({
      key: readFileSync(keyPath),
      cert: readFileSync(certPath),
      ca: readFileSync(caPath),
      rejectUnauthorized: this.config.hubTlsRejectUnauthorized,
      keepAlive: true,
    });

    this.httpService.axiosRef.defaults.httpsAgent = this.httpsAgent;
    this.logger.log(
      `Outbound mTLS agent registered on HttpService (rejectUnauthorized: ${this.config.hubTlsRejectUnauthorized})`,
    );
  }

  public getHttpsAgent(): https.Agent | undefined {
    return this.httpsAgent;
  }

  public isTlsEnabled(): boolean {
    return this.config.tlsEnabled;
  }
}
