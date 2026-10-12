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
}
