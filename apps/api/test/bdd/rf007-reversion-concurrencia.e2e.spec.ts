import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { EstadoConciliacion, EstadoCuota, MetodoPago, Moneda, Rol } from '@guachafit/shared';

/**
 * RF-007 · Reversión de un pago aprobado (contrato 15 del prompt 01 + validación 07): concurrencia
 * REAL contra PostgreSQL y liberación real de referencias.
 *
 * La producción revierte un pago aprobado leyendo y quitando el excedente del saldo a favor del
 * alumno con la fila bloqueada (`FOR UPDATE`), y la emisión de la cuota siguiente consume ese saldo
 * con la MISMA fila bloqueada. Este spec verifica sobre el Postgres de Docker que la carrera
 * "reversión vs emisión que consumiría el saldo" acaba de una de dos formas coherentes:
 * 1. la reversión gana: la cuota vuelve a deber su total, la transacción queda `revertido` con su
 *    motivo y la emisión nace sin saldo que aplicar; o
 * 2. la emisión consume el saldo primero: la reversión responde 409 (el excedente ya se aplicó a
 *    otra cuota) y nada queda a medias.
 *
 * Nunca hay saldo a favor negativo ni deadlock (`40P01`).
 *
 * Higiene (validación 07, risk W3 / reliability W3): la emisión se acota al fixture con
 * `asignarSuscripcion` (emisión de UN solo alumno) en lugar del barrido global
 * `emitirCuotasProgramadas`, que con una fecha futura emitiría cuotas de todos los alumnos activos
 * de la BD de desarrollo. El spec no emite nada fuera de sus fixtures y limpia todo lo que crea.
 *
 * También cubre con PostgreSQL real: la liberación de la referencia de un pago revertido (índice
 * parcial recreado por la migración 0021) y la doble reversión concurrente (una 200 y una 409).
 *
 * GATE: sin `E2E_DATABASE_URL` el spec se salta limpio (patrón de
 * `rf006-saldo-favor-concurrencia.e2e.spec.ts`), así la suite unitaria nunca depende de Docker.
 * Ejecución local (credenciales dev del compose; las migraciones `0020` y `0021` deben estar
 * aplicadas para que existan `motivo_reversion`/`fecha_reversion_utc` y el índice excluya
 * `revertido`):
 *   $env:E2E_DATABASE_URL='postgres://postgres:postgres@localhost:5432/guachafit'
 *   pnpm --filter @guachafit/api exec vitest run test/bdd/rf007-reversion-concurrencia.e2e.spec.ts
 */

interface Fixtures {
  coach: string;
  alumno: string;
  perfil: string;
  plan: string;
  transacciones: string[];
}

let sql: any;
let servicio: any;
let f: Fixtures;

async function insertarUsuario(rol: Rol, prefijo: string): Promise<string> {
  const id = randomUUID();
  await sql.unsafe('INSERT INTO usuarios (id, email, rol) VALUES ($1, $2, $3)', [
    id,
    `${prefijo}-${id}@e2e-rf007-rev.local`,
    rol,
  ]);
  return id;
}

async function insertarPerfilAlumno(usuarioId: string, entrenadorId: string): Promise<string> {
  const id = randomUUID();
  await sql.unsafe(
    `INSERT INTO perfiles_alumno
       (id, usuario_id, entrenador_id, numero_documento, nombres, apellidos, fecha_nacimiento, telefono_whatsapp)
     VALUES ($1, $2, $3, $4, 'Alumno', 'E2E RF-007 reversión', '1990-01-01', '+584120000000')`,
    [id, usuarioId, entrenadorId, `E2E-${id.slice(0, 8)}`]
  );
  return id;
}

async function insertarPlan(entrenadorId: string): Promise<string> {
  const id = randomUUID();
  await sql.unsafe(
    `INSERT INTO planes_membresia (id, entrenador_id, nombre, precio_base_usd)
     VALUES ($1, $2, 'Plan E2E RF-007 reversión', '40.00')`,
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

async function insertarTransaccionPendiente(opciones: {
  cuotaId: string;
  clienteId: string;
  entrenadorId: string;
  montoEquivalenteUsd: string;
  /** Referencia bancaria concreta (p. ej. `REF-7788`); por defecto una única por corrida. */
  referencia?: string;
  fechaOperacion?: string;
}): Promise<string> {
  const id = randomUUID();
  await sql.unsafe(
    `INSERT INTO transacciones_pago
       (id, cuota_id, cliente_id, entrenador_id, registrado_por, monto_original,
        moneda_original, tasa_cambio_fijada, monto_equivalente_usd, metodo_pago,
        referencia_bancaria, fecha_operacion, estado_conciliacion)
     VALUES ($1, $2, $3, $4, $3, $5, $6, '1.0000', $5, $7, $8, $9, $10)`,
    [
      id,
      opciones.cuotaId,
      opciones.clienteId,
      opciones.entrenadorId,
      opciones.montoEquivalenteUsd,
      Moneda.USD,
      MetodoPago.PAGO_MOVIL,
      opciones.referencia ?? `REF-${randomUUID()}`,
      opciones.fechaOperacion ?? '2026-10-09',
      EstadoConciliacion.PENDIENTE,
    ]
  );
  return id;
}

describe.runIf(Boolean(process.env.E2E_DATABASE_URL))(
  'RF-007 E2E: la reversión de un pago con excedente no deja saldo negativo ni deadlock (PostgreSQL real)',
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

      f = { coach, alumno, perfil, plan, transacciones: [] };
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
        // Por cliente+plan: incluye las cuotas emitidas por el barrido en las repeticiones.
        await sql.unsafe('DELETE FROM cuotas_membresia WHERE cliente_id = $1 AND plan_id = $2', [
          f.alumno,
          f.plan,
        ]);
        await sql.unsafe('DELETE FROM perfiles_alumno WHERE id = $1', [f.perfil]);
        await sql.unsafe('DELETE FROM planes_membresia WHERE id = $1', [f.plan]);
        await sql.unsafe('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [[f.coach, f.alumno]]);
      } catch (error) {
        // La limpieza best-effort jamás debe enmascarar el resultado de los tests.
        console.warn('[RF-007 reversión E2E] limpieza de fixtures falló:', error);
      } finally {
        await sql.end({ timeout: 5 }).catch(() => {});
      }
    });

    for (let repeticion = 1; repeticion <= 3; repeticion++) {
      const mes = String(repeticion).padStart(2, '0');
      const periodoPago = `2030-${mes}`;
      const corteEmision = `2031-${mes}-10`;
      const periodoEmision = `2031-${mes}`;
      const ahoraEmision = new Date(`2031-${mes}-05T12:00:00.000Z`);

      it(`repetición ${repeticion}: reversión vs emisión — estado coherente y sin 40P01`, async () => {
        // Estado base determinista de la repetición: el perfil del fixture arranca sin saldo a
        // favor ni plan suscrito (una repetición anterior pudo dejarlos).
        await sql.unsafe(
          `UPDATE perfiles_alumno
              SET saldo_a_favor_usd = '0.00', plan_suscrito_id = NULL, ciclo_ancla = NULL,
                  proximo_corte = NULL
            WHERE id = $1`,
          [f.perfil]
        );

        // Fixtures de la repetición: cuota a pagar ($40) + pago de $50 aprobado de verdad.
        const cuotaPago = await insertarCuota(f.alumno, f.coach, f.plan, periodoPago);
        const txPago = await insertarTransaccionPendiente({
          cuotaId: cuotaPago,
          clienteId: f.alumno,
          entrenadorId: f.coach,
          montoEquivalenteUsd: '50.00',
        });
        f.transacciones.push(txPago);

        // La aprobación (producción ya existente) deja $10 de saldo a favor del alumno.
        const aprobacion = await servicio.conciliarTransaccion(txPago, f.coach, {
          accion: 'aprobar',
        });
        expect(aprobacion.transaccion.excedenteUsd).toBe('10.00');
        const [perfilTrasAprobacion] = await sql.unsafe(
          'SELECT saldo_a_favor_usd FROM perfiles_alumno WHERE id = $1',
          [f.perfil]
        );
        expect(Number(perfilTrasAprobacion.saldo_a_favor_usd)).toBe(10);

        // LA carrera: reversión (quita el excedente) vs emisión ACOTADA AL FIXTURE
        // (`asignarSuscripcion` emite la cuota del único alumno del test; el barrido global
        // `emitirCuotasProgramadas` queda fuera para no emitir cuotas de otros alumnos).
        const [resReversion, resAsignacion] = await Promise.allSettled([
          servicio.revertirTransaccion(
            txPago,
            f.coach,
            { motivo: 'Fondos no recibidos' },
            ahoraEmision
          ),
          servicio.asignarSuscripcion(
            f.coach,
            f.alumno,
            { planId: f.plan, fechaInicio: corteEmision },
            ahoraEmision
          ),
        ]);

        for (const resultado of [resReversion, resAsignacion]) {
          if (resultado.status === 'rejected') {
            const mensaje = String(resultado.reason?.message ?? resultado.reason);
            if (mensaje.includes('40P01') || /deadlock/i.test(mensaje)) {
              throw new Error(
                `DEADLOCK (40P01) en la carrera reversión↔emisión (repetición ${repeticion}): ${mensaje}`
              );
            }
          }
        }

        expect(resAsignacion.status).toBe('fulfilled');
        const asignacion = (resAsignacion as PromiseFulfilledResult<any>).value;
        // La emisión del fixture ocurrió de verdad: creó la cuota del ciclo 2031-XX (si quedara
        // una de una corrida anterior, `cuotaEmitidaId` sería null y este assert lo delata).
        expect(asignacion.cuotaEmitidaId).toBeTruthy();

        // Estado final en la base: transacción, cuota pagada, cuota emitida y perfil.
        const [txFinal] = await sql.unsafe(
          `SELECT estado_conciliacion, motivo_reversion, fecha_reversion_utc
             FROM transacciones_pago WHERE id = $1`,
          [txPago]
        );
        const [cuotaPagoFinal] = await sql.unsafe(
          `SELECT monto_abonado_usd, saldo_pendiente_usd, estado
             FROM cuotas_membresia WHERE id = $1`,
          [cuotaPago]
        );
        const [cuotaEmitida] = await sql.unsafe(
          `SELECT saldo_a_favor_aplicado_usd, saldo_pendiente_usd, estado
             FROM cuotas_membresia
            WHERE cliente_id = $1 AND plan_id = $2 AND periodo = $3`,
          [f.alumno, f.plan, periodoEmision]
        );
        const [perfilFinal] = await sql.unsafe(
          'SELECT saldo_a_favor_usd FROM perfiles_alumno WHERE id = $1',
          [f.perfil]
        );

        expect(cuotaEmitida).toBeDefined();
        const saldoFinal = Number(perfilFinal.saldo_a_favor_usd);
        // Invariante transversal: el saldo a favor jamás queda negativo.
        expect(saldoFinal).toBeGreaterThanOrEqual(0);

        if (resReversion.status === 'fulfilled') {
          // La reversión ganó: la cuota pagada vuelve a deber su total y la transacción queda
          // revertida con su motivo y fecha; la emisión nace sin saldo que aplicar.
          const reversion = resReversion.value;
          expect(reversion.transaccion.estadoConciliacion).toBe(EstadoConciliacion.REVERTIDO);
          expect(txFinal.estado_conciliacion).toBe('revertido');
          expect(txFinal.motivo_reversion).toBe('Fondos no recibidos');
          expect(txFinal.fecha_reversion_utc).toBeTruthy();
          expect(Number(cuotaPagoFinal.monto_abonado_usd)).toBe(0);
          expect(Number(cuotaPagoFinal.saldo_pendiente_usd)).toBe(40);
          expect(Number(cuotaEmitida.saldo_a_favor_aplicado_usd)).toBe(0);
          expect(Number(cuotaEmitida.saldo_pendiente_usd)).toBe(40);
          expect(saldoFinal).toBe(0);
        } else {
          // La emisión consumió el saldo primero: 409 con el mensaje acordado y estado intacto.
          const mensaje = String(resReversion.reason?.message ?? resReversion.reason);
          expect(mensaje).toContain(
            'No se puede revertir este pago: el saldo a favor que generó ya se aplicó a otra cuota.'
          );
          expect(txFinal.estado_conciliacion).toBe('aprobado');
          expect(txFinal.motivo_reversion).toBeNull();
          expect(Number(cuotaPagoFinal.monto_abonado_usd)).toBe(40);
          expect(Number(cuotaPagoFinal.saldo_pendiente_usd)).toBe(0);
          expect(Number(cuotaEmitida.saldo_a_favor_aplicado_usd)).toBe(10);
          expect(Number(cuotaEmitida.saldo_pendiente_usd)).toBe(30);
          expect(saldoFinal).toBe(0);
        }
      });
    }

    it('la referencia de un pago revertido se libera: el alumno reenvía REF-7788 y el entrenador la aprueba de nuevo', async () => {
      const cuota = await insertarCuota(f.alumno, f.coach, f.plan, '2032-01');
      const txOriginal = await insertarTransaccionPendiente({
        cuotaId: cuota,
        clienteId: f.alumno,
        entrenadorId: f.coach,
        montoEquivalenteUsd: '40.00',
        referencia: 'REF-7788',
        fechaOperacion: '2026-10-05',
      });
      f.transacciones.push(txOriginal);

      // El pago se aprueba: la referencia queda ocupada por el índice parcial de la 0018.
      const aprobacion = await servicio.conciliarTransaccion(txOriginal, f.coach, {
        accion: 'aprobar',
      });
      expect(aprobacion.transaccion.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);

      // Se revierte por error: la 0021 debe liberar la referencia de la tupla.
      const reversion = await servicio.revertirTransaccion(txOriginal, f.coach, {
        motivo: 'Aprobado por error',
      });
      expect(reversion.transaccion.estadoConciliacion).toBe(EstadoConciliacion.REVERTIDO);

      // El alumno reenvía el MISMO comprobante (referencia, método y fecha): pre-chequeo +
      // índice real lo permiten (sin la 0021, el INSERT chocaba con 23505 → 409).
      const reenvio = await servicio.reportarPago(cuota, f.alumno, {
        montoOriginal: '40.00',
        monedaOriginal: Moneda.USD,
        metodoPago: MetodoPago.PAGO_MOVIL,
        referenciaBancaria: 'REF-7788',
        fechaOperacion: '2026-10-05',
      });
      f.transacciones.push(reenvio.transaccion.id);
      expect(reenvio.transaccion.id).not.toBe(txOriginal);
      expect(reenvio.transaccion.estadoConciliacion).toBe(EstadoConciliacion.PENDIENTE);

      // Y el entrenador la aprueba de nuevo: la cuota vuelve a quedar al día.
      const reaprobacion = await servicio.conciliarTransaccion(reenvio.transaccion.id, f.coach, {
        accion: 'aprobar',
      });
      expect(reaprobacion.transaccion.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
      expect(reaprobacion.cuota.estado).toBe(EstadoCuota.AL_DIA);

      // En la base: la referencia vive ahora en el pago nuevo aprobado y el viejo sigue revertido.
      const filas = await sql.unsafe(
        `SELECT estado_conciliacion FROM transacciones_pago
          WHERE entrenador_id = $1 AND referencia_bancaria = 'REF-7788'`,
        [f.coach]
      );
      expect(filas).toHaveLength(2);
      expect(filas.map((fila: any) => fila.estado_conciliacion).sort()).toEqual([
        'aprobado',
        'revertido',
      ]);
    });

    it('doble reversión concurrente del mismo pago: una 200 y una 409, sin efectos dobles', async () => {
      const cuota = await insertarCuota(f.alumno, f.coach, f.plan, '2032-02');
      const tx = await insertarTransaccionPendiente({
        cuotaId: cuota,
        clienteId: f.alumno,
        entrenadorId: f.coach,
        montoEquivalenteUsd: '50.00',
      });
      f.transacciones.push(tx);

      const aprobacion = await servicio.conciliarTransaccion(tx, f.coach, { accion: 'aprobar' });
      expect(aprobacion.transaccion.excedenteUsd).toBe('10.00');

      const [a, b] = await Promise.allSettled([
        servicio.revertirTransaccion(tx, f.coach, { motivo: 'Fondos no recibidos' }),
        servicio.revertirTransaccion(tx, f.coach, { motivo: 'Fondos no recibidos' }),
      ]);

      const cumplidas = [a, b].filter((resultado) => resultado.status === 'fulfilled');
      const rechazadas = [a, b].filter((resultado) => resultado.status === 'rejected');
      expect(cumplidas).toHaveLength(1);
      expect(rechazadas).toHaveLength(1);
      expect(String((rechazadas[0] as PromiseRejectedResult).reason?.message ?? '')).toContain(
        'Solo se puede revertir un pago aprobado.'
      );

      // Estado final: revertido UNA sola vez; el excedente no se retira dos veces.
      const [txFinal] = await sql.unsafe(
        'SELECT estado_conciliacion, motivo_reversion FROM transacciones_pago WHERE id = $1',
        [tx]
      );
      const [cuotaFinal] = await sql.unsafe(
        'SELECT monto_abonado_usd, saldo_pendiente_usd FROM cuotas_membresia WHERE id = $1',
        [cuota]
      );
      const [perfilFinal] = await sql.unsafe(
        'SELECT saldo_a_favor_usd FROM perfiles_alumno WHERE id = $1',
        [f.perfil]
      );
      expect(txFinal.estado_conciliacion).toBe('revertido');
      expect(txFinal.motivo_reversion).toBe('Fondos no recibidos');
      expect(Number(cuotaFinal.monto_abonado_usd)).toBe(0);
      expect(Number(cuotaFinal.saldo_pendiente_usd)).toBe(40);
      expect(Number(perfilFinal.saldo_a_favor_usd)).toBe(0);
    });
  }
);
