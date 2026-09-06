import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/guachafit';

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
