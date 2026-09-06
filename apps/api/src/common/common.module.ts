import { Global, Module } from '@nestjs/common';
import { CryptoService } from './services/crypto.service';
import { RolesGuard } from './guards/roles.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TenantRlsInterceptor } from './interceptors/tenant-rls.interceptor';

@Global()
@Module({
  providers: [CryptoService, RolesGuard, JwtAuthGuard, TenantRlsInterceptor],
  exports: [CryptoService, RolesGuard, JwtAuthGuard, TenantRlsInterceptor],
})
export class CommonModule {}
