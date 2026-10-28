import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHttpsServerOptions } from './tls-server.helper.js';

describe('createHttpsServerOptions', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should return undefined when TLS_ENABLED is not true', () => {
    process.env.TLS_ENABLED = 'false';
    const options = createHttpsServerOptions();
    expect(options).toBeUndefined();
  });

  it('should return HttpsOptions when TLS_ENABLED is true and files exist', () => {
    process.env.TLS_ENABLED = 'true';
    process.env.TLS_SERVER_KEY_PATH = './certs/tls/server/server.key';
    process.env.TLS_SERVER_CERT_PATH = './certs/tls/server/server.crt';
    process.env.TLS_SERVER_CA_PATH = './certs/tls/server/dfsp_ca.crt';

    const options = createHttpsServerOptions();
    expect(options).toBeDefined();
    expect(options?.requestCert).toBe(true);
    expect(options?.rejectUnauthorized).toBe(true);
    expect(options?.key).toBeDefined();
    expect(options?.cert).toBeDefined();
    expect(options?.ca).toBeDefined();
  });

  it('should throw an error if certificate files are missing', () => {
    process.env.TLS_ENABLED = 'true';
    process.env.TLS_SERVER_KEY_PATH = './certs/tls/server/nonexistent.key';

    expect(() => createHttpsServerOptions()).toThrow('[TLS Error]');
  });
});
