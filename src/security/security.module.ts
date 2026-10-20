import { Global, Module } from '@nestjs/common';
import { KeystoreModule } from './keystore/keystore.module.js';
import { JwsModule } from './jws/jws.module.js';

@Global()
@Module({
  imports: [KeystoreModule, JwsModule],
  exports: [KeystoreModule, JwsModule],
})
export class SecurityModule {}
