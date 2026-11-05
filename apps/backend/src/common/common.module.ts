import { Global, Module } from '@nestjs/common';
import { Ed25519SignatureGuard } from './guards/ed25519-signature.guard';

@Global()
@Module({
  providers: [Ed25519SignatureGuard],
  exports: [Ed25519SignatureGuard],
})
export class CommonModule {}
