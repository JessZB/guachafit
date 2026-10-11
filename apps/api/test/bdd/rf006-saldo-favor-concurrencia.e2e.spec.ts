import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { EstadoConciliacion, EstadoCuota, MetodoPago, Moneda, Rol } from '@guachafit/shared';

/**
 * RF-006 RN-05 (contratos 14c y 14 del prompt 07): concurrencia REAL del saldo a favor contra
 * PostgreSQL.
 *
 * La producción acredita el excedente leyendo la fila del perfil con `FOR UPDATE` y escribiendo el
 * valor calculado; la emisión consume el saldo leyendo también con `FOR UPDATE` dentro de su
 * transacción. El mock en memoria de `rf006-saldo-favor.spec.ts` no bloquea filas, así que este
 * spec verifica dos garantías sobre el Postgres de Docker:
 * 1. Dos aprobaciones con excedente de $10 que acreditan el MISMO perfil a la vez deben dejar el
 *    saldo correcto (suma de ambos, $20), sin perder ningún incremento.
 * 2. La carrera que importa (crédito vs consumo): una aprobación con excedente en paralelo con la
 *    emisión de la cuota siguiente conserva el valor (`saldo final + aplicado en la emisión =
 *    saldo inicial + excedente`) y no produce deadlock (40P01).
 *
 * GATE: sin `E2E_DATABASE_URL` el spec se salta limpio (patrón de
 * `rf007-indice-referencias.e2e.spec.ts`), así la suite unitaria nunca depende de Docker.
 * Ejecución local (credenciales dev del compose, con la migración 0019 aplicada; 127.0.0.1 por el
 * IPv6 de Windows):
 *   $env:E2E_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/guachafit'
 *   pnpm --filter @guachafit/api exec vitest run test/bdd/rf006-saldo-favor-concurrencia.e2e.spec.ts
 */

interface Fixtures {
  coach: string;
  alumno: string;
  perfil: string;
  plan: string;
  cuotaA: string;
  cuotaB: string;
  transacciones: string[];
}

let sql: any;
let servicio: any;
let f: Fixtures;

async function insertarUsuario(rol: Rol, prefijo: string): Promise<string> {
  const id = randomUUID();
  await sql.unsafe('INSERT INTO usuarios (id, email, rol) VALUES ($1, $2, $3)', [
    id,
    `${prefijo}-${id}@e2e-rf006.local`,
    rol,
  ]);
  return id;
}

async function insertarPerfilAlumno(usuarioId: string, entrenadorId: string): Promise<string> {
  const id = randomUUID();
  await sql.unsafe(
    `INSERT INTO perfiles_alumno
       (id, usuario_id, entrenador_id, numero_documento, nombres, apellidos, fecha_nacimiento, telefono_whatsapp)
     VALUES ($1, $2, $3, $4, 'Alumno', 'E2E RF-006', '1990-01-01', '+584120000000')`,
    [id, usuarioId, entrenadorId, `E2E-${id.slice(0, 8)}`]
  );
  return id;
}

async function insertarPlan(entrenadorId: string): Promise<string> {
  const id = randomUUID();
  await sql.unsafe(
    `INSERT INTO planes_membresia (id, entrenador_id, nombre, precio_base_usd)
     VALUES ($1, $2, 'Plan E2E RF-006', '40.00')`,
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
}): Promise<string> {
  const id = randomUUID();
  await sql.unsafe(
    `INSERT INTO transacciones_pago
       (id, cuota_id, cliente_id, entrenador_id, registrado_por, monto_original,
        moneda_original, tasa_cambio_fijada, monto_equivalente_usd, metodo_pago,
        referencia_bancaria, fecha_operacion, estado_conciliacion)
     VALUES ($1, $2, $3, $4, $3, $5, $6, '1.0000', $5, $7, $8, '2026-10-09', $9)`,
    [
      id,
      opciones.cuotaId,
      opciones.clienteId,
      opciones.entrenadorId,
      opciones.montoEquivalenteUsd,
      Moneda.USD,
      MetodoPago.PAGO_MOVIL,
      `REF-${randomUUID()}`,
      EstadoConciliacion.PENDIENTE,
    ]
  );
  return id;
}

describe.runIf(Boolean(process.env.E2E_DATABASE_URL))(
  'RF-006 RN-05 E2E: el saldo a favor no pierde incrementos concurrentes (PostgreSQL real)',
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
      const cuotaA = await insertarCuota(alumno, coach, plan, '2026-10');
      const cuotaB = await insertarCuota(alumno, coach, plan, '2026-11');

      // Dos pagos de $50 (USD) que exceden en $10 cada uno la deuda de $40 de sus cuotas.
      const txA = await insertarTransaccionPendiente({
        cuotaId: cuotaA,
        clienteId: alumno,
        entrenadorId: coach,
        montoEquivalenteUsd: '50.00',
      });
      const txB = await insertarTransaccionPendiente({
        cuotaId: cuotaB,
        clienteId: alumno,
        entrenadorId: coach,
        montoEquivalenteUsd: '50.00',
      });

      f = { coach, alumno, perfil, plan, cuotaA, cuotaB, transacciones: [txA, txB] };
      servicio = new FinanzasService((database as any).db);
    });

    afterAll(async () => {
      if (!sql || !f) return;
      try {
        await sql.unsafe('DELETE FROM transacciones_pago WHERE id = ANY($1::uuid[])', [
          f.transacciones,
        ]);
        // Por cliente+plan: incluye las cuotas emitidas por el barrido en las repeticiones
        // (además de cuotaA/cuotaB). El cliente es un fixture exclusivo de este spec.
        await sql.unsafe('DELETE FROM cuotas_membresia WHERE cliente_id = $1 AND plan_id = $2', [
          f.alumno,
          f.plan,
        ]);
        await sql.unsafe('DELETE FROM perfiles_alumno WHERE id = $1', [f.perfil]);
        await sql.unsafe('DELETE FROM planes_membresia WHERE id = $1', [f.plan]);
        await sql.unsafe('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [[f.coach, f.alumno]]);
      } catch (error) {
        // La limpieza best-effort jamás debe enmascarar el resultado de los tests.
        console.warn('[RF-006 E2E] limpieza de fixtures falló:', error);
      } finally {
        await sql.end({ timeout: 5 }).catch(() => {});
      }
    });

    it('dos aprobaciones con excedente a la vez dejan el saldo a favor completo (10 + 10 = 20)', async () => {
      const [resA, resB] = await Promise.all([
        servicio.conciliarTransaccion(f.transacciones[0], f.coach, { accion: 'aprobar' }),
        servicio.conciliarTransaccion(f.transacciones[1], f.coach, { accion: 'aprobar' }),
      ]);

      // Cada cuota recibió solo su deuda; cada transacción registró su excedente.
      for (const res of [resA, resB]) {
        expect(res.transaccion.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
        expect(res.transaccion.excedenteUsd).toBe('10.00');
        expect(res.cuota.montoAbonadoUsd).toBe('40.00');
        expect(res.cuota.saldoPendienteUsd).toBe('0.00');
        expect(res.cuota.estado).toBe(EstadoCuota.AL_DIA);
      }

      // El saldo a favor del perfil es la suma de ambos incrementos: ningún FOR UPDATE lo perdió.
      const [perfil] = await sql.unsafe(
        'SELECT saldo_a_favor_usd FROM perfiles_alumno WHERE id = $1',
        [f.perfil]
      );
      expect(Number(perfil.saldo_a_favor_usd)).toBe(20);

      // Y en la base quedó todo consistente (cuotas liquidadas, transacciones aprobadas).
      const cuotas = await sql.unsafe(
        'SELECT saldo_pendiente_usd, estado FROM cuotas_membresia WHERE id = ANY($1::uuid[])',
        [[f.cuotaA, f.cuotaB]]
      );
      expect(cuotas).toHaveLength(2);
      for (const cuota of cuotas) {
        expect(Number(cuota.saldo_pendiente_usd)).toBe(0);
        expect(cuota.estado).toBe('al_dia');
      }
      const txs = await sql.unsafe(
        'SELECT estado_conciliacion, excedente_usd FROM transacciones_pago WHERE id = ANY($1::uuid[])',
        [f.transacciones]
      );
      expect(txs).toHaveLength(2);
      for (const tx of txs) {
        expect(tx.estado_conciliacion).toBe('aprobado');
        expect(Number(tx.excedente_usd)).toBe(10);
      }
    });

    // -------------------------------------------------------------------------
    // Carrera crédito (aprobación con excedente) vs consumo (emisión de la cuota siguiente),
    // repetida 5 veces con fixtures propios por repetición (prompt 07, tarea 14).
    // `emitirCuotasProgramadas` recorre TODOS los alumnos activos con plan suscrito: las
    // aserciones se limitan a los fixtures de la repetición.
    // -------------------------------------------------------------------------
    for (let repeticion = 1; repeticion <= 5; repeticion++) {
      const mes = String(repeticion).padStart(2, '0');
      const periodoPago = `2030-${mes}`;
      const corteEmision = `2031-${mes}-10`;
      const periodoEmision = `2031-${mes}`;
      const ahoraEmision = new Date(`2031-${mes}-05T12:00:00.000Z`);

      it(`repetición ${repeticion}: aprobación con excedente en paralelo con la emisión conserva el valor y no hay deadlock`, async () => {
        // Fixtures de la repetición: cuota a pagar ($40) + pago reportado de $50 (excedente $10).
        const cuotaPago = await insertarCuota(f.alumno, f.coach, f.plan, periodoPago);
        const txPago = await insertarTransaccionPendiente({
          cuotaId: cuotaPago,
          clienteId: f.alumno,
          entrenadorId: f.coach,
          montoEquivalenteUsd: '50.00',
        });
        f.transacciones.push(txPago);

        // El alumno entra en ventana de emisión para el ciclo de esta repetición.
        await sql.unsafe(
          `UPDATE perfiles_alumno
              SET plan_suscrito_id = $1, ciclo_ancla = $2, proximo_corte = $2
            WHERE id = $3`,
          [f.plan, corteEmision, f.perfil]
        );

        const [saldoInicialFila] = await sql.unsafe(
          'SELECT saldo_a_favor_usd FROM perfiles_alumno WHERE id = $1',
          [f.perfil]
        );
        const saldoInicial = Number(saldoInicialFila.saldo_a_favor_usd);

        // LA carrera: crédito (aprobar con excedente) vs consumo (emitir la cuota siguiente).
        // `emitirCuotasProgramadas` atrapa los errores por alumno en `omitidas`, así que un
        // deadlock del lado de la emisión no rechaza la promesa: se verifica `omitidas === 0`.
        let resultados: [any, any];
        try {
          resultados = await Promise.all([
            servicio.conciliarTransaccion(txPago, f.coach, { accion: 'aprobar' }),
            servicio.emitirCuotasProgramadas(ahoraEmision),
          ]);
        } catch (error: any) {
          const mensaje = String(error?.message ?? error);
          if (mensaje.includes('40P01') || /deadlock/i.test(mensaje)) {
            throw new Error(
              `DEADLOCK (40P01) en la carrera aprobación↔emisión (repetición ${repeticion}): ${mensaje}`
            );
          }
          throw error;
        }
        const [resAprobacion, resEmision] = resultados;

        expect(resEmision.omitidas).toBe(0);
        expect(resAprobacion.transaccion.estadoConciliacion).toBe(EstadoConciliacion.APROBADO);
        expect(resAprobacion.transaccion.excedenteUsd).toBe('10.00');
        expect(resAprobacion.cuota.estado).toBe(EstadoCuota.AL_DIA);

        // Conservación independiente del orden: lo acreditado menos lo aplicado.
        const [perfilFinal] = await sql.unsafe(
          'SELECT saldo_a_favor_usd FROM perfiles_alumno WHERE id = $1',
          [f.perfil]
        );
        const [cuotaEmitida] = await sql.unsafe(
          `SELECT saldo_a_favor_aplicado_usd, saldo_pendiente_usd
             FROM cuotas_membresia
            WHERE cliente_id = $1 AND plan_id = $2 AND periodo = $3`,
          [f.alumno, f.plan, periodoEmision]
        );
        expect(cuotaEmitida).toBeDefined();
        const aplicado = Number(cuotaEmitida.saldo_a_favor_aplicado_usd);
        const saldoFinal = Number(perfilFinal.saldo_a_favor_usd);
        expect(saldoFinal + aplicado).toBeCloseTo(saldoInicial + 10, 2);
      });
    }
  }
);
