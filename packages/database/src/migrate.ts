import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import path from 'node:path';

const migrationsFolder = path.resolve(__dirname, '../drizzle');

async function runMigrate() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/guachafit';

  console.log('⏳ [Drizzle Migrator] Conectando a PostgreSQL...');
  console.log(`📡 URL objetivo: ${connectionString.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`📁 Directorio de migraciones: ${migrationsFolder}`);

  // Conexión exclusiva para migración (max 1 cliente para evitar bloqueos DDL)
  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);

  try {
    console.log('🚀 [Drizzle Migrator] Aplicando migraciones DDL...');
    await migrate(db, { migrationsFolder });
    console.log('✅ [Drizzle Migrator] Todas las migraciones fueron aplicadas con éxito.');
  } catch (error) {
    console.error('❌ [Drizzle Migrator] Error al aplicar migraciones:', error);
    process.exit(1);
  } finally {
    await migrationClient.end();
  }
}

runMigrate().catch((err) => {
  console.error('❌ [Drizzle Migrator] Error inesperado en ejecución:', err);
  process.exit(1);
});
