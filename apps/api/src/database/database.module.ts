import { Global, Module } from '@nestjs/common';
import { db, withTenant, Database } from '@guachafit/database';

export const DRIZZLE_DB = 'DRIZZLE_DB';
/**
 * Token DI del envoltorio transaccional con contexto RLS (RNF-003 / ADR-009).
 * Los servicios lo usan para ejecutar toda consulta de tablas con RLS dentro de
 * una transacción que aplica `set_config` (GUCs de sesión) — ver withTenant().
 */
export const WITH_TENANT = 'WITH_TENANT';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_DB,
      useValue: db,
    },
    {
      provide: WITH_TENANT,
      useValue: withTenant,
    },
  ],
  exports: [DRIZZLE_DB, WITH_TENANT],
})
export class DatabaseModule {}
