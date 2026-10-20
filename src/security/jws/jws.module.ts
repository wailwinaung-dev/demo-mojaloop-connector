import { Module } from '@nestjs/common';
import { KeystoreModule } from '../keystore/keystore.module.js';
import { JwsService } from './jws.service.js';
import { JwsSigningInterceptor } from './jws-signing.interceptor.js';
import { JwsVerificationGuard } from './jws-verification.guard.js';

@Module({
  imports: [KeystoreModule],
  providers: [JwsService, JwsSigningInterceptor, JwsVerificationGuard],
  exports: [JwsService, JwsVerificationGuard],
})
export class JwsModule {}
