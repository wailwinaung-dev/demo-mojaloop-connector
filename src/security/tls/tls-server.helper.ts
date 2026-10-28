import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { HttpsOptions } from '@nestjs/common/interfaces/external/https-options.interface.js';

/**
 * Creates Node.js HTTPS server options for inbound mTLS verification.
 * Used during bootstrap in main.ts before NestJS application initialization.
 */
export function createHttpsServerOptions(): HttpsOptions | undefined {
  const isTlsEnabled = process.env.TLS_ENABLED === 'true';
  if (!isTlsEnabled) {
    return undefined;
  }

  const keyPath =
    process.env.TLS_SERVER_KEY_PATH || './certs/tls/server/server.key';
  const certPath =
    process.env.TLS_SERVER_CERT_PATH || './certs/tls/server/server.crt';
  const caPath =
    process.env.TLS_SERVER_CA_PATH || './certs/tls/server/dfsp_ca.crt';

  const resolvePath = (p: string) =>
    isAbsolute(p) ? p : resolve(process.cwd(), p);
  const resolvedKey = resolvePath(keyPath);
  const resolvedCert = resolvePath(certPath);
  const resolvedCa = resolvePath(caPath);

  if (
    !existsSync(resolvedKey) ||
    !existsSync(resolvedCert) ||
    !existsSync(resolvedCa)
  ) {
    throw new Error(
      `[TLS Error] Inbound mTLS enabled but certificate files not found: key=${resolvedKey}, cert=${resolvedCert}, ca=${resolvedCa}`,
    );
  }

  return {
    key: readFileSync(resolvedKey),
    cert: readFileSync(resolvedCert),
    ca: readFileSync(resolvedCa),
    requestCert: true,
    rejectUnauthorized: true,
  };
}
