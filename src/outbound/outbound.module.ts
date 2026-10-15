import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CbsModule } from '../cbs/cbs.module.js';
import { CallbackWaiterService } from './waiter/callback-waiter.service.js';
import { OutboundService } from './outbound.service.js';
import { OutboundController } from './outbound.controller.js';

@Module({
  imports: [HttpModule, CbsModule],
  controllers: [OutboundController],
  providers: [CallbackWaiterService, OutboundService],
  exports: [CallbackWaiterService, OutboundService],
})
export class OutboundModule {}
