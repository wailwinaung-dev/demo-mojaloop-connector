import { registerAs } from '@nestjs/config';

export interface MojaloopConfig {
  dfspId: string;
  defaultCurrency: string;
  hubBaseUrl: string;
  callbackTimeoutMs: number;
  quoteExpirySeconds: number;
  jwsPrivateKeyPath: string;
  jwsPublicKeyPath: string;
  jwsAlgorithm: string;
  tlsEnabled: boolean;
  tlsServerKeyPath: string;
  tlsServerCertPath: string;
  tlsServerCaPath: string;
  tlsClientKeyPath: string;
  tlsClientCertPath: string;
  tlsClientCaPath: string;
  hubTlsRejectUnauthorized: boolean;
}

export const mojaloopConfig = registerAs('mojaloop', (): MojaloopConfig => {
  const hubTlsReject =
    String(process.env.HUB_TLS_REJECT_UNAUTHORIZED).toLowerCase() === 'true';
  return {
    dfspId: process.env.FSPIOP_DFSP_ID || 'dfsp-b',
    defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD',
    hubBaseUrl: process.env.HUB_BASE_URL || 'http://localhost:4040',
    callbackTimeoutMs: parseInt(process.env.CALLBACK_TIMEOUT_MS || '5000', 10),
    quoteExpirySeconds: parseInt(process.env.QUOTE_EXPIRY_SECONDS || '60', 10),
    jwsPrivateKeyPath:
      process.env.FSPIOP_JWS_PRIVATE_KEY_PATH ||
      './certs/jws/dfsp-jws-private.pem',
    jwsPublicKeyPath:
      process.env.FSPIOP_JWS_PUBLIC_KEY_PATH || './certs/jws/dfsp-jws-public.pem',
    jwsAlgorithm: process.env.FSPIOP_JWS_ALGORITHM || 'RS256',
    tlsEnabled: process.env.TLS_ENABLED === 'true',
    tlsServerKeyPath:
      process.env.TLS_SERVER_KEY_PATH || './certs/tls/server/server.key',
    tlsServerCertPath:
      process.env.TLS_SERVER_CERT_PATH || './certs/tls/server/server.crt',
    tlsServerCaPath:
      process.env.TLS_SERVER_CA_PATH || './certs/tls/server/dfsp_ca.crt',
    tlsClientKeyPath:
      process.env.TLS_CLIENT_KEY_PATH || './certs/tls/client/client.key',
    tlsClientCertPath:
      process.env.TLS_CLIENT_CERT_PATH || './certs/tls/client/client.crt',
    tlsClientCaPath:
      process.env.TLS_CLIENT_CA_PATH || './certs/tls/client/ca.crt',
    hubTlsRejectUnauthorized: hubTlsReject,
  };
});
