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

/** Drizzle transaction handle: all statements run on the SAME pooled connection. */
export type TenantTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Session context for the PostgreSQL RLS policies (RNF-003 / ADR-009).
 * Every field maps 1:1 to a session GUC consumed by the policies:
 * - `entrenadorId` -> `app.current_entrenador_id` (tenant owner).
 * - `usuarioId`    -> `app.current_usuario_id` (self access: alumno/cliente).
 * - `isSuperadmin` -> `app.is_superadmin` (explicit system/superadmin bypass).
 */
export interface TenantRlsContext {
  entrenadorId?: string | null;
  usuarioId?: string | null;
  isSuperadmin?: boolean;
}

export type WithTenantFn = <T>(
  context: TenantRlsContext,
  fn: (tx: TenantTransaction) => Promise<T>
) => Promise<T>;

/**
 * Applies the tenant session GUCs to an OPEN transaction.
 *
 * `set_config(name, value, is_local => true)` is the transaction-scoped equivalent of
 * `SET LOCAL`, and — unlike `SET LOCAL app.x = $1` — it accepts bound parameters:
 * PostgreSQL's SET grammar only accepts literals/identifiers/numbers, so a
 * parameterized SET LOCAL fails to parse, and a SET LOCAL issued outside a
 * transaction block has no effect (it is scoped to the single implicit statement).
 */
export async function setTenantSession(
  tx: TenantTransaction,
  context: TenantRlsContext
): Promise<void> {
  if (!context.entrenadorId && !context.usuarioId && !context.isSuperadmin) {
    throw new Error(
      'withTenant/setTenantSession requiere al menos un campo de contexto RLS ' +
        '(entrenadorId, usuarioId o isSuperadmin).'
    );
  }

  if (context.entrenadorId) {
    await tx.execute(
      sql`SELECT set_config('app.current_entrenador_id', ${context.entrenadorId}, true)`
    );
  }
  if (context.usuarioId) {
    await tx.execute(sql`SELECT set_config('app.current_usuario_id', ${context.usuarioId}, true)`);
  }
  if (context.isSuperadmin) {
    await tx.execute(sql`SELECT set_config('app.is_superadmin', 'true', true)`);
  }
}

/**
 * Executes a callback within a transaction that has the tenant RLS context applied.
 *
 * Use it for EVERY query against a table with RLS enabled (RNF-003): queries that do
 * not run inside this wrapper will hit PostgreSQL's deny-by-default RLS behavior.
 * `database` is injectable only to keep the helper unit-testable without a live DB.
 */
export async function withTenant<T>(
  context: TenantRlsContext,
  fn: (tx: TenantTransaction) => Promise<T>,
  database: Pick<Database, 'transaction'> = db
): Promise<T> {
  return await database.transaction(async (tx) => {
    await setTenantSession(tx, context);
    return await fn(tx);
  });
}
