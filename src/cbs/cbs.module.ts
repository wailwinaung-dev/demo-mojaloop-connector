import { Module } from '@nestjs/common';
import { CbsService } from './cbs.service.js';

@Module({
  providers: [CbsService],
  exports: [CbsService],
})
export class CbsModule {}
