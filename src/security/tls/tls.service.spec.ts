import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TlsService } from './tls.service.js';
import type { HttpService } from '@nestjs/axios';
import type { MojaloopConfigService } from '../../config/mojaloop-config.service.js';

describe('TlsService', () => {
  let tlsService: TlsService;
  let mockHttpService: {
    axiosRef: {
      defaults: {
        httpsAgent?: unknown;
      };
    };
  };
  let mockConfig: Partial<MojaloopConfigService>;

  beforeEach(() => {
    mockHttpService = {
      axiosRef: {
        defaults: {},
      },
    };

    mockConfig = {
      tlsEnabled: true,
      tlsClientKeyPath: './certs/tls/client/client.key',
      tlsClientCertPath: './certs/tls/client/client.crt',
      tlsClientCaPath: './certs/tls/client/ca.crt',
      hubTlsRejectUnauthorized: false,
    };

    tlsService = new TlsService(
      mockHttpService as unknown as HttpService,
      mockConfig as MojaloopConfigService,
    );
  });

  it('should initialize and register httpsAgent when TLS is enabled', () => {
    tlsService.onModuleInit();

    expect(tlsService.isTlsEnabled()).toBe(true);
    const agent = tlsService.getHttpsAgent();
    expect(agent).toBeDefined();
    expect(mockHttpService.axiosRef.defaults.httpsAgent).toBe(agent);
  });

  it('should not initialize httpsAgent when TLS is disabled', () => {
    (mockConfig as any).tlsEnabled = false;
    tlsService = new TlsService(
      mockHttpService as unknown as HttpService,
      mockConfig as MojaloopConfigService,
    );

    tlsService.onModuleInit();

    expect(tlsService.isTlsEnabled()).toBe(false);
    expect(tlsService.getHttpsAgent()).toBeUndefined();
    expect(mockHttpService.axiosRef.defaults.httpsAgent).toBeUndefined();
  });

  it('should throw error when client certificate files are missing', () => {
    (mockConfig as any).tlsClientKeyPath = './nonexistent.key';
    tlsService = new TlsService(
      mockHttpService as unknown as HttpService,
      mockConfig as MojaloopConfigService,
    );

    expect(() => tlsService.initClientAgent()).toThrow('[mTLS Error]');
  });
});
