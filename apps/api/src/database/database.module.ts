import { Global, Module } from '@nestjs/common';
import { db, withTenant, Database } from '@guachafit/database';

export const DRIZZLE_DB = 'DRIZZLE_DB';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_DB,
      useValue: db,
    },
    {
      provide: 'WITH_TENANT',
      useValue: withTenant,
    },
  ],
  exports: [DRIZZLE_DB, 'WITH_TENANT'],
})
export class DatabaseModule {}
