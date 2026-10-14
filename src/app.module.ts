import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CbsModule } from './cbs/cbs.module.js';
import { MojaloopConfigModule } from './config/mojaloop-config.module.js';
import { FspiopModule } from './fspiop/fspiop.module.js';
import { InboundModule } from './inbound/inbound.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    MojaloopConfigModule,
    CbsModule,
    FspiopModule,
    InboundModule,
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'mojaloop-connector',
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
