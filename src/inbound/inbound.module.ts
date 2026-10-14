import { Module } from '@nestjs/common';
import { CbsModule } from '../cbs/cbs.module.js';
import { InboundController } from './inbound.controller.js';
import { InboundService } from './inbound.service.js';

@Module({
  imports: [CbsModule],
  controllers: [InboundController],
  providers: [InboundService],
  exports: [InboundService],
})
export class InboundModule {}
