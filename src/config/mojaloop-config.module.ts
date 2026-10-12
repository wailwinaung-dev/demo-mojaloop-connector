import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './env.validation.js';
import { mojaloopConfig } from './mojaloop.config.js';
import { MojaloopConfigService } from './mojaloop-config.service.js';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [mojaloopConfig],
      validate,
      envFilePath: ['.env'],
    }),
  ],
  providers: [MojaloopConfigService],
  exports: [MojaloopConfigService],
})
export class MojaloopConfigModule {}
