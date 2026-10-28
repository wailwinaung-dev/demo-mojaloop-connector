import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TlsService } from './tls.service.js';

@Module({
  imports: [HttpModule],
  providers: [TlsService],
  exports: [TlsService],
})
export class TlsModule {}
