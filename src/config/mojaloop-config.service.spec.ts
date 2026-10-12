import { describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { MojaloopConfigModule } from './mojaloop-config.module.js';
import { MojaloopConfigService } from './mojaloop-config.service.js';

describe('MojaloopConfigService', () => {
  it('should load default configuration values correctly', async () => {
    process.env.FSPIOP_DFSP_ID = 'test-dfsp';
    process.env.HUB_BASE_URL = 'http://localhost:4040';

    const module: TestingModule = await Test.createTestingModule({
      imports: [MojaloopConfigModule],
    }).compile();

    const configService = module.get<MojaloopConfigService>(MojaloopConfigService);

    expect(configService).toBeDefined();
    expect(configService.dfspId).toBe('test-dfsp');
    expect(configService.hubBaseUrl).toBe('http://localhost:4040');
    expect(configService.defaultCurrency).toBe('USD');
  });
});
