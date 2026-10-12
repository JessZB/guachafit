import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { EstadoConciliacion, EstadoCuota, MetodoPago, Moneda, Rol } from '@guachafit/shared';

/**
 * RF-008 · Anulación de cuotas (contratos F1–F2 del prompt 01): concurrencia
 * REAL contra PostgreSQL.
 *
 * - F1: `anularCuota` y `reportarPago` en paralelo sobre la misma cuota sin
 *   pagos (N=10 repeticiones). El estado final es siempre (a) cuota `anulada`
 *   con 0 transacciones, o (b) cuota `pendiente_revision` con 1 transacción
 *   `PENDIENTE` y la anulación respondiendo 409
 *   `MENSAJE_ANULACION_PAGO_EN_REVISION`. Nunca `anulada` con `PENDIENTE`.
 * - F2: `anularCuota` dos veces en paralelo → exactamente una responde 200 y
 *   la otra 409 `MENSAJE_CUOTA_YA_ANULADA`; el saldo a favor se devuelve una
 *   sola vez.
 * - E5b-idx: el índice parcial `uq_cuota_cliente_plan_periodo` (migración 0022)
 *   deja convivir una cuota `anulada` y otra vigente del mismo alumno, plan y
 *   periodo, y rechaza dos vigentes (decisión del dueño 2026-10-12).
 *
 * La producción debe bloquear la cuota en las tres rutas (anulación, reporte y
 * conciliación): ninguna puede dejar una cuota anulada con un pago en revisión
 * o aprobado.
 *
 * Higiene: fixtures acotados al test (periodos 2030+, sin barrido global) y
 * limpieza de todo lo creado en `afterAll`, como en
 * `rf007-reversion-concurrencia.e2e.spec.ts`.
 *
 * GATE: sin `E2E_DATABASE_URL` el spec se salta limpio (mismo patrón que
 * `rf007-reversion-concurrencia.e2e.spec.ts`), así la suite unitaria nunca
 * depende de Docker. Ejecución local:
 *   $env:E2E_DATABASE_URL='postgres://postgres:postgres@localhost:5432/guachafit'
 *   pnpm --filter @guachafit/api exec vitest run test/bdd/rf008-anulacion-cuota-concurrencia.e2e.spec.ts
 */

interface Fixtures {
  coach: string;
  alumno: string;
  perfil: string;
  plan: string;
  cuotas: string[];
  transacciones: string[];
}

let sql: any;
let servicio: any;
let f: Fixtures;

const MENSAJE_EN_REVISION = 'Primero aprueba o rechaza el pago en revisión de esta cuota.';
const MENSAJE_YA_ANULADA = 'Esta cuota ya está anulada.';

async function insertarUsuario(rol: Rol, prefijo: string): Promise<string> {
  const id = randomUUID();
  await sql.unsafe('INSERT INTO usuarios (id, email, rol) VALUES ($1, $2, $3)', [
    id,
    `${prefijo}-${id}@e2e-rf008-anul.local`,
    rol,
  ]);
  return id;
}

async function insertarPerfilAlumno(usuarioId: string, entrenadorId: string): Promise<string> {
  const id = randomUUID();
  await sql.unsafe(
    `INSERT INTO perfiles_alumno
       (id, usuario_id, entrenador_id, numero_documento, nombres, apellidos, fecha_nacimiento, telefono_whatsapp)
     VALUES ($1, $2, $3, $4, 'Alumno', 'E2E RF-008 anulación', '1990-01-01', '+584120000000')`,
    [id, usuarioId, entrenadorId, `E2E-${id.slice(0, 8)}`]
  );
  return id;
}

async function insertarPlan(entrenadorId: string): Promise<string> {
  const id = randomUUID();
  await sql.unsafe(
    `INSERT INTO planes_membresia (id, entrenador_id, nombre, precio_base_usd)
     VALUES ($1, $2, 'Plan E2E RF-008 anulación', '40.00')`,
    [id, entrenadorId]
  );
  return id;
}

async function insertarCuota(
  clienteId: string,
  entrenadorId: string,
  planId: string,
  periodo: string
): Promise<string> {
  const id = randomUUID();
  await sql.unsafe(
    `INSERT INTO cuotas_membresia
       (id, cliente_id, entrenador_id, plan_id, periodo, monto_total_usd, saldo_pendiente_usd,
        fecha_emision_utc, fecha_corte_utc)
     VALUES ($1, $2, $3, $4, $5, '40.00', '40.00', now(), now() + interval '30 days')`,
    [id, clienteId, entrenadorId, planId, periodo]
  );
  return id;
}

describe.runIf(Boolean(process.env.E2E_DATABASE_URL))(
  'RF-008 E2E: anularCuota vs reporte y doble anulación no dejan estados incoherentes (PostgreSQL real)',
  () => {
    beforeAll(async () => {
      // El cliente de `@guachafit/database` lee DATABASE_URL al importarse: se apunta al E2E.
      process.env.DATABASE_URL = process.env.E2E_DATABASE_URL as string;
      const database = await import('@guachafit/database');
      sql = (database as any).queryClient;
      const { FinanzasService } = await import('../../src/modules/finanzas/finanzas.service');

      const coach = await insertarUsuario(Rol.ENTRENADOR, 'coach');
      const alumno = await insertarUsuario(Rol.ALUMNO, 'alumno');
      const perfil = await insertarPerfilAlumno(alumno, coach);
      const plan = await insertarPlan(coach);

      f = { coach, alumno, perfil, plan, cuotas: [], transacciones: [] };
      servicio = new FinanzasService((database as any).db);
    });

    afterAll(async () => {
      if (!sql || !f) return;
      try {
        if (f.transacciones.length > 0) {
          await sql.unsafe('DELETE FROM transacciones_pago WHERE id = ANY($1::uuid[])', [
            f.transacciones,
          ]);
        }
        if (f.cuotas.length > 0) {
          await sql.unsafe('DELETE FROM cuotas_membresia WHERE id = ANY($1::uuid[])', [f.cuotas]);
        }
        await sql.unsafe('DELETE FROM perfiles_alumno WHERE id = $1', [f.perfil]);
        await sql.unsafe('DELETE FROM planes_membresia WHERE id = $1', [f.plan]);
        await sql.unsafe('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [[f.coach, f.alumno]]);
      } catch (error) {
        // La limpieza best-effort jamás debe enmascarar el resultado de los tests.
        console.warn('[RF-008 anulación E2E] limpieza de fixtures falló:', error);
      } finally {
        await sql.end({ timeout: 5 }).catch(() => {});
      }
    });

    for (let repeticion = 1; repeticion <= 10; repeticion++) {
      const mes = String(repeticion).padStart(2, '0');
      const periodo = `2030-${mes}`;

      it(`F1 repetición ${repeticion}: anular vs reportar en paralelo — final (a) o (b), nunca anulada+PENDIENTE`, async () => {
        const cuotaId = await insertarCuota(f.alumno, f.coach, f.plan, periodo);
        f.cuotas.push(cuotaId);

        // LA carrera: anulación del entrenador vs reporte del alumno, a la vez.
        const [resAnulacion, resReporte] = await Promise.allSettled([
          servicio.anularCuota(cuotaId, f.coach, { motivo: 'Error de emisión' }),
          servicio.reportarPago(cuotaId, f.alumno, {
            montoOriginal: '40.00',
            monedaOriginal: Moneda.USD,
            metodoPago: MetodoPago.EFECTIVO_USD,
            fechaOperacion: '2026-10-09',
          }),
        ]);

        if (resReporte.status === 'fulfilled') {
          f.transacciones.push((resReporte.value as any).transaccion.id);
        }

        for (const resultado of [resAnulacion, resReporte]) {
          if (resultado.status === 'rejected') {
            const mensaje = String(resultado.reason?.message ?? resultado.reason);
            if (mensaje.includes('40P01') || /deadlock/i.test(mensaje)) {
              throw new Error(
                `DEADLOCK (40P01) en la carrera anular↔reportar (repetición ${repeticion}): ${mensaje}`
              );
            }
          }
        }

        const [cuotaFinal] = await sql.unsafe(
          'SELECT estado FROM cuotas_membresia WHERE id = $1',
          [cuotaId]
        );
        const txs = await sql.unsafe(
          'SELECT id, estado_conciliacion FROM transacciones_pago WHERE cuota_id = $1',
          [cuotaId]
        );

        const pendientes = txs.filter((tx: any) => tx.estado_conciliacion === 'pendiente');
        // Invariante transversal: jamás una cuota anulada con un pago en revisión.
        expect(
          !(cuotaFinal.estado === EstadoCuota.ANULADA && pendientes.length > 0)
        ).toBe(true);

        if (resAnulacion.status === 'fulfilled') {
          // (a) La anulación ganó: cuota anulada y 0 transacciones.
          expect(cuotaFinal.estado).toBe(EstadoCuota.ANULADA);
          expect(txs).toHaveLength(0);
        } else {
          // (b) El reporte ganó: pendiente_revision con 1 PENDIENTE y la
          // anulación respondió 409 en-revisión.
          expect(String(resAnulacion.reason?.message ?? '')).toContain(MENSAJE_EN_REVISION);
          expect(cuotaFinal.estado).toBe(EstadoCuota.PENDIENTE_REVISION);
          expect(pendientes).toHaveLength(1);
        }
      });
    }

    it('F2: doble anulación en paralelo — una 200 y una 409, con el saldo devuelto una sola vez', async () => {
      // La cuota nació con 10.00 de saldo a favor aplicados (pendiente 30.00).
      const cuotaId = await insertarCuota(f.alumno, f.coach, f.plan, '2031-01');
      f.cuotas.push(cuotaId);
      await sql.unsafe(
        `UPDATE cuotas_membresia
            SET monto_abonado_usd = '10.00', saldo_pendiente_usd = '30.00',
                saldo_a_favor_aplicado_usd = '10.00', estado = 'abonada_parcial'
          WHERE id = $1`,
        [cuotaId]
      );
      await sql.unsafe(`UPDATE perfiles_alumno SET saldo_a_favor_usd = '0.00' WHERE id = $1`, [
        f.perfil,
      ]);

      const [a, b] = await Promise.allSettled([
        servicio.anularCuota(cuotaId, f.coach, { motivo: 'Error de emisión' }),
        servicio.anularCuota(cuotaId, f.coach, { motivo: 'Error de emisión' }),
      ]);

      const cumplidas = [a, b].filter((resultado) => resultado.status === 'fulfilled');
      const rechazadas = [a, b].filter((resultado) => resultado.status === 'rejected');
      expect(cumplidas).toHaveLength(1);
      expect(rechazadas).toHaveLength(1);
      expect(String((rechazadas[0] as PromiseRejectedResult).reason?.message ?? '')).toContain(
        MENSAJE_YA_ANULADA
      );

      // Estado final: anulada UNA sola vez; el saldo a favor se devolvió una sola vez.
      const [cuotaFinal] = await sql.unsafe(
        `SELECT estado, monto_abonado_usd, saldo_pendiente_usd, saldo_a_favor_aplicado_usd,
                motivo_anulacion
           FROM cuotas_membresia WHERE id = $1`,
        [cuotaId]
      );
      const [perfilFinal] = await sql.unsafe(
        'SELECT saldo_a_favor_usd FROM perfiles_alumno WHERE id = $1',
        [f.perfil]
      );
      expect(cuotaFinal.estado).toBe('anulada');
      expect(Number(cuotaFinal.monto_abonado_usd)).toBe(0);
      expect(Number(cuotaFinal.saldo_pendiente_usd)).toBe(0);
      expect(Number(cuotaFinal.saldo_a_favor_aplicado_usd)).toBe(0);
      expect(cuotaFinal.motivo_anulacion).toBe('Error de emisión');
      expect(Number(perfilFinal.saldo_a_favor_usd)).toBe(10);
    });

    it('E5b-idx: el índice parcial deja convivir anulada+vigente del mismo periodo y bloquea dos vigentes', async () => {
      // Decisión del dueño 2026-10-12 (migración 0022): `uq_cuota_cliente_plan_periodo`
      // es parcial (`WHERE estado <> 'anulada'`). Periodo 2032-01, lejos de los
      // fixtures F1/F2 (2030+/2031-01).
      const periodo = '2032-01';

      // Sanidad: la 0022 está aplicada (el índice existe y es parcial).
      const [indice] = await sql.unsafe(
        `SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_cuota_cliente_plan_periodo'`
      );
      expect(indice?.indexdef ?? '').toContain('WHERE');
      expect(indice?.indexdef ?? '').toContain('anulada');

      // Anulada sembrada directo (el estado basta para el predicado del índice).
      const anuladaId = randomUUID();
      await sql.unsafe(
        `INSERT INTO cuotas_membresia
           (id, cliente_id, entrenador_id, plan_id, periodo, monto_total_usd, saldo_pendiente_usd,
            fecha_emision_utc, fecha_corte_utc, estado, motivo_anulacion, fecha_anulacion_utc, anulada_por)
         VALUES ($1, $2, $3, $4, $5, '40.00', '0.00', now(), now() + interval '30 days',
                 'anulada', 'Error de emisión', now(), $3)`,
        [anuladaId, f.alumno, f.coach, f.plan, periodo]
      );
      f.cuotas.push(anuladaId);

      // Vigente del mismo alumno/plan/periodo: SE ACEPTA (la anulada no ocupa el periodo).
      const vigenteId = await insertarCuota(f.alumno, f.coach, f.plan, periodo);
      f.cuotas.push(vigenteId);

      // Segunda vigente del mismo periodo: viola el índice único parcial.
      await expect(insertarCuota(f.alumno, f.coach, f.plan, periodo)).rejects.toThrow(
        /uq_cuota_cliente_plan_periodo|23505|unique/i
      );
    });
  }
);
