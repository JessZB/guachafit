import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema/index';

import path from 'node:path';
import fs from 'node:fs';

// Cargar .env si existe en el entorno local
const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../apps/api/.env'),
];
for (const p of possibleEnvPaths) {
  if (fs.existsSync(p) && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(p);
      break;
    } catch {}
  }
}

const rawUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/guachafit';
// En Windows/Node.js, 'localhost' resuelve a IPv6 [::1], lo cual genera CONNECT_TIMEOUT en Docker WSL2.
const connectionString = rawUrl.replace('@localhost:', '@127.0.0.1:');

// Client for queries
export const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });

export type Database = typeof db;

/**
 * Executes a callback within a transaction setting the current tenant (entrenador_id)
 * for PostgreSQL Row Level Security (RLS) enforcement.
 */
export async function withTenant<T>(
  entrenadorId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return await db.transaction(async (tx) => {
    // Set RLS local context for the current transaction
    await tx.execute(sql`SET LOCAL app.current_entrenador_id = ${entrenadorId}`);
    return await fn(tx);
  });
}
