import { registerAs } from '@nestjs/config';

export interface MojaloopConfig {
  dfspId: string;
  defaultCurrency: string;
  hubBaseUrl: string;
  callbackTimeoutMs: number;
  quoteExpirySeconds: number;
}

export const mojaloopConfig = registerAs('mojaloop', (): MojaloopConfig => ({
  dfspId: process.env.FSPIOP_DFSP_ID || 'dfsp-b',
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD',
  hubBaseUrl: process.env.HUB_BASE_URL || 'http://localhost:4040',
  callbackTimeoutMs: parseInt(process.env.CALLBACK_TIMEOUT_MS || '5000', 10),
  quoteExpirySeconds: parseInt(process.env.QUOTE_EXPIRY_SECONDS || '60', 10),
}));
