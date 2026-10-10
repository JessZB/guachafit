import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MetodoPago, Moneda, EstadoConciliacion, Rol } from '@guachafit/shared';

/**
 * M5-L1 §H (RF-007 §6 / RNF-002 §4): E2E real contra PostgreSQL del índice único de
 * referencias bancarias por entrenador.
 *
 * Verifica la migración 0018 contra la BD real con las migraciones aplicadas:
 * - `uq_transaccion_idempotencia` (global) deja de existir;
 * - `uq_transaccion_referencia_entrenador` es PARCIAL: solo aplica a métodos NO efectivo con
 *   `referencia_bancaria IS NOT NULL` y excluye las transacciones `rechazado`.
 *
 * GATE: sin `E2E_DATABASE_URL` el spec se salta limpio (patrón de `rnf001-r2-delete-minio.e2e.spec.ts`),
 * así la suite unitaria nunca depende de Docker. Ejecución local (credenciales dev del compose):
 *   $env:E2E_DATABASE_URL='postgres://postgres:postgres@localhost:5432/guachafit'
 *   pnpm --filter @guachafit/api exec vitest run test/bdd/rf007-indice-referencias.e2e.spec.ts
 *
 * En fase roja (sin la migración 0018 aplicada) los casos 3, 4 y 5 FALLAN: la segunda inserción
 * choca contra el índice global viejo o el nombre del constraint no coincide.
 */

interface Fixtures {
  coachA: string;
  coachB: string;
  alumnoA: string;
  alumnoB: string;
  perfilA: string;
  perfilB: string;
  planA: string;
  planB: string;
  cuotaA: string;
  cuotaB: string;
  transacciones: string[];
}

let sql: any;
let f: Fixtures;

async function insertarUsuario(rol: Rol, prefijo: string): Promise<string> {
  const id = randomUUID();
  await sql.unsafe('INSERT INTO usuarios (id, email, rol) VALUES ($1, $2, $3)', [
    id,
    `${prefijo}-${id}@e2e-m5l1.local`,
    rol,
  ]);
  return id;
}

async function insertarPerfilAlumno(usuarioId: string, entrenadorId: string): Promise<string> {
  const id = randomUUID();
  await sql.unsafe(
    `INSERT INTO perfiles_alumno
       (id, usuario_id, entrenador_id, numero_documento, nombres, apellidos, fecha_nacimiento, telefono_whatsapp)
     VALUES ($1, $2, $3, $4, 'Alumno', 'E2E M5L1', '1990-01-01', '+584120000000')`,
    [id, usuarioId, entrenadorId, `E2E-${id.slice(0, 8)}`]
  );
  return id;
}

async function insertarPlan(entrenadorId: string): Promise<string> {
  const id = randomUUID();
  await sql.unsafe(
    `INSERT INTO planes_membresia (id, entrenador_id, nombre, precio_base_usd)
     VALUES ($1, $2, 'Plan E2E M5L1', '40.00')`,
    [id, entrenadorId]
  );
  return id;
}

async function insertarCuota(
  clienteId: string,
  entrenadorId: string,
  planId: string
): Promise<string> {
  const id = randomUUID();
  await sql.unsafe(
    `INSERT INTO cuotas_membresia
       (id, cliente_id, entrenador_id, plan_id, periodo, monto_total_usd, saldo_pendiente_usd,
        fecha_emision_utc, fecha_corte_utc)
     VALUES ($1, $2, $3, $4, '2026-10', '40.00', '40.00', now(), now() + interval '30 days')`,
    [id, clienteId, entrenadorId, planId]
  );
  return id;
}

/** Inserta una transacción y devuelve el resultado: el caso E2E necesita capturar el error real. */
async function insertarTransaccion(opciones: {
  cuotaId: string;
  clienteId: string;
  entrenadorId: string;
  metodoPago: MetodoPago;
  referencia: string | null;
  fechaOperacion: string;
  estado: EstadoConciliacion;
}): Promise<{ ok: true } | { ok: false; error: any }> {
  const id = randomUUID();
  try {
    await sql.unsafe(
      `INSERT INTO transacciones_pago
         (id, cuota_id, cliente_id, entrenador_id, registrado_por, monto_original,
          moneda_original, tasa_cambio_fijada, monto_equivalente_usd, metodo_pago,
          referencia_bancaria, fecha_operacion, estado_conciliacion)
       VALUES ($1, $2, $3, $4, $4, '40.00', $5, '1.0000', '40.00', $6, $7, $8, $9)`,
      [
        id,
        opciones.cuotaId,
        opciones.clienteId,
        opciones.entrenadorId,
        Moneda.USD,
        opciones.metodoPago,
        opciones.referencia,
        opciones.fechaOperacion,
        opciones.estado,
      ]
    );
    f.transacciones.push(id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

describe.runIf(Boolean(process.env.E2E_DATABASE_URL))(
  'M5-L1 §H E2E: índice único de referencias por entrenador (PostgreSQL real)',
  () => {
    beforeAll(async () => {
      // El cliente de `@guachafit/database` lee DATABASE_URL al importarse: se apunta al E2E.
      process.env.DATABASE_URL = process.env.E2E_DATABASE_URL as string;
      const database = await import('@guachafit/database');
      sql = (database as any).queryClient;

      const coachA = await insertarUsuario(Rol.ENTRENADOR, 'coach-a');
      const coachB = await insertarUsuario(Rol.ENTRENADOR, 'coach-b');
      const alumnoA = await insertarUsuario(Rol.ALUMNO, 'alumno-a');
      const alumnoB = await insertarUsuario(Rol.ALUMNO, 'alumno-b');
      const perfilA = await insertarPerfilAlumno(alumnoA, coachA);
      const perfilB = await insertarPerfilAlumno(alumnoB, coachB);
      const planA = await insertarPlan(coachA);
      const planB = await insertarPlan(coachB);
      const cuotaA = await insertarCuota(alumnoA, coachA, planA);
      const cuotaB = await insertarCuota(alumnoB, coachB, planB);

      f = { coachA, coachB, alumnoA, alumnoB, perfilA, perfilB, planA, planB, cuotaA, cuotaB, transacciones: [] };
    });

    afterAll(async () => {
      if (!sql || !f) return;
      try {
        if (f.transacciones.length > 0) {
          await sql.unsafe('DELETE FROM transacciones_pago WHERE id = ANY($1::uuid[])', [f.transacciones]);
        }
        await sql.unsafe('DELETE FROM cuotas_membresia WHERE id = ANY($1::uuid[])', [
          [f.cuotaA, f.cuotaB],
        ]);
        await sql.unsafe('DELETE FROM perfiles_alumno WHERE id = ANY($1::uuid[])', [
          [f.perfilA, f.perfilB],
        ]);
        await sql.unsafe('DELETE FROM planes_membresia WHERE id = ANY($1::uuid[])', [
          [f.planA, f.planB],
        ]);
        await sql.unsafe('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [
          [f.coachA, f.coachB, f.alumnoA, f.alumnoB],
        ]);
      } catch (error) {
        // La limpieza best-effort jamás debe enmascarar el resultado de los tests.
        console.warn('[M5-L1 §H E2E] limpieza de fixtures falló:', error);
      } finally {
        await sql.end({ timeout: 5 }).catch(() => {});
      }
    });

    it('dos efectivo_usd sin referencia, misma fecha y coaches distintos → ambas OK', async () => {
      const fecha = '2026-10-09';
      const primera = await insertarTransaccion({
        cuotaId: f.cuotaA,
        clienteId: f.alumnoA,
        entrenadorId: f.coachA,
        metodoPago: MetodoPago.EFECTIVO_USD,
        referencia: null,
        fechaOperacion: fecha,
        estado: EstadoConciliacion.APROBADO,
      });
      const segunda = await insertarTransaccion({
        cuotaId: f.cuotaB,
        clienteId: f.alumnoB,
        entrenadorId: f.coachB,
        metodoPago: MetodoPago.EFECTIVO_USD,
        referencia: null,
        fechaOperacion: fecha,
        estado: EstadoConciliacion.APROBADO,
      });

      expect(primera.ok).toBe(true);
      expect(segunda.ok).toBe(true);
    });

    it('dos efectivo_usd sin referencia, mismo coach y misma fecha → ambas OK (nunca COBRO_DIRECTO_SALA)', async () => {
      const fecha = '2026-10-09';
      const primera = await insertarTransaccion({
        cuotaId: f.cuotaA,
        clienteId: f.alumnoA,
        entrenadorId: f.coachA,
        metodoPago: MetodoPago.EFECTIVO_USD,
        referencia: null,
        fechaOperacion: fecha,
        estado: EstadoConciliacion.APROBADO,
      });
      const segunda = await insertarTransaccion({
        cuotaId: f.cuotaA,
        clienteId: f.alumnoA,
        entrenadorId: f.coachA,
        metodoPago: MetodoPago.EFECTIVO_USD,
        referencia: null,
        fechaOperacion: fecha,
        estado: EstadoConciliacion.APROBADO,
      });

      expect(primera.ok).toBe(true);
      expect(segunda.ok).toBe(true);
    });

    it('dos pago_movil con la misma referencia y fecha, mismo coach → 23505 en uq_transaccion_referencia_entrenador', async () => {
      const referencia = `REF-${randomUUID()}`;
      const fecha = '2026-10-08';
      const primera = await insertarTransaccion({
        cuotaId: f.cuotaA,
        clienteId: f.alumnoA,
        entrenadorId: f.coachA,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referencia,
        fechaOperacion: fecha,
        estado: EstadoConciliacion.PENDIENTE,
      });
      const segunda = await insertarTransaccion({
        cuotaId: f.cuotaA,
        clienteId: f.alumnoA,
        entrenadorId: f.coachA,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referencia,
        fechaOperacion: fecha,
        estado: EstadoConciliacion.PENDIENTE,
      });

      expect(primera.ok).toBe(true);
      expect(segunda.ok).toBe(false);
      const error = (segunda as { ok: false; error: any }).error;
      expect(error.code).toBe('23505');
      expect(error.constraint_name ?? error.constraint).toBe('uq_transaccion_referencia_entrenador');
    });

    it('la misma referencia en coaches distintos → ambas OK (el índice es por entrenador)', async () => {
      const referencia = `REF-${randomUUID()}`;
      const fecha = '2026-10-07';
      const primera = await insertarTransaccion({
        cuotaId: f.cuotaA,
        clienteId: f.alumnoA,
        entrenadorId: f.coachA,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referencia,
        fechaOperacion: fecha,
        estado: EstadoConciliacion.PENDIENTE,
      });
      const segunda = await insertarTransaccion({
        cuotaId: f.cuotaB,
        clienteId: f.alumnoB,
        entrenadorId: f.coachB,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referencia,
        fechaOperacion: fecha,
        estado: EstadoConciliacion.PENDIENTE,
      });

      expect(primera.ok).toBe(true);
      expect(segunda.ok).toBe(true);
    });

    it('una referencia rechazada puede reenviarse con la misma fecha (rechazado → pendiente)', async () => {
      const referencia = `REF-${randomUUID()}`;
      const fecha = '2026-10-06';
      const rechazada = await insertarTransaccion({
        cuotaId: f.cuotaA,
        clienteId: f.alumnoA,
        entrenadorId: f.coachA,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referencia,
        fechaOperacion: fecha,
        estado: EstadoConciliacion.RECHAZADO,
      });
      const reenvio = await insertarTransaccion({
        cuotaId: f.cuotaA,
        clienteId: f.alumnoA,
        entrenadorId: f.coachA,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referencia,
        fechaOperacion: fecha,
        estado: EstadoConciliacion.PENDIENTE,
      });

      expect(rechazada.ok).toBe(true);
      expect(reenvio.ok).toBe(true);
    });
  }
);
