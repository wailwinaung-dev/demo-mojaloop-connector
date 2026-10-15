import { Module } from '@nestjs/common';
import { KeystoreService } from './keystore.service.js';
import { MojaloopConfigModule } from '../../config/mojaloop-config.module.js';

@Module({
  imports: [MojaloopConfigModule],
  providers: [KeystoreService],
  exports: [KeystoreService],
})
export class KeystoreModule {}
