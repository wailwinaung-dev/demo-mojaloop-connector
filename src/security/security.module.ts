import { Module } from '@nestjs/common';
import { KeystoreModule } from './keystore/keystore.module.js';

@Module({
  imports: [KeystoreModule],
  exports: [KeystoreModule],
})
export class SecurityModule {}
