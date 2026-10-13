import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FspiopCallbackClient } from './fspiop-callback.client.js';

@Global()
@Module({
  imports: [HttpModule],
  providers: [FspiopCallbackClient],
  exports: [FspiopCallbackClient, HttpModule],
})
export class FspiopModule {}
