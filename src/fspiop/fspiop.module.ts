import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FspiopCallbackClient } from './client/fspiop-callback.client.js';
import { IlpService } from './ilp/ilp.service.js';
import { PreimageStoreService } from './ilp/preimage-store.service.js';

@Global()
@Module({
  imports: [HttpModule],
  providers: [FspiopCallbackClient, IlpService, PreimageStoreService],
  exports: [
    FspiopCallbackClient,
    IlpService,
    PreimageStoreService,
    HttpModule,
  ],
})
export class FspiopModule {}
