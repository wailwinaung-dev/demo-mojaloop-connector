import { Global, Module } from '@nestjs/common';
import { KeystoreModule } from './keystore/keystore.module.js';
import { JwsModule } from './jws/jws.module.js';
import { TlsModule } from './tls/tls.module.js';

@Global()
@Module({
  imports: [KeystoreModule, JwsModule, TlsModule],
  exports: [KeystoreModule, JwsModule, TlsModule],
})
export class SecurityModule {}
