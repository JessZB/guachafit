import { Global, Module } from '@nestjs/common';
import { CryptoService } from './services/crypto.service';
import { RolesGuard } from './guards/roles.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

// NOTA (WU7 / RNF-003 / ADR-009): aquí vivía `TenantRlsInterceptor`. Se retiró porque
// su diseño era inviable e inseguro:
//   1. Ejecutaba `SET LOCAL app.*` como consultas sueltas del pool (fuera de una
//      transacción); PostgreSQL ignora `SET LOCAL` fuera de un bloque transaccional,
//      y cada consulta del servicio usa una conexión distinta del pool.
//   2. Nunca estuvo registrado como APP_INTERCEPTOR (solo como provider), por lo que
//      no se ejecutaba.
//   3. Su `catch {}` vacío habría ocultado fallos de contexto (bypass silencioso).
// El contexto RLS ahora se aplica POR CONSULTA con `withTenant()` (@guachafit/database),
// inyectado vía DatabaseModule (token WITH_TENANT), y es obligatorio para toda tabla
// con RLS habilitado.
@Global()
@Module({
  providers: [CryptoService, RolesGuard, JwtAuthGuard],
  exports: [CryptoService, RolesGuard, JwtAuthGuard],
})
export class CommonModule {}
