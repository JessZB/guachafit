import { ConflictException, NotFoundException } from '@nestjs/common';
import { EstadoCuota, MENSAJE_REVERSION_SALDO_USADO } from '@guachafit/shared';
import {
  and,
  cuotasMembresia,
  eq,
  ne,
  perfilesAlumno,
  type TenantTransaction,
} from '@guachafit/database';
import {
  MENSAJE_ALUMNO_NO_ENCONTRADO,
} from '../../../common/mensajes-acceso';
import { obtenerFechaLocalYyyyMmDd } from '../../../common/adherencia.util';
import {
  addDecimals,
  aplicarSaldoAFavorACuota,
  assertBalanceInvariant,
  subtractDecimals,
  toCents,
  zonaDelAlumno,
  type CuotaFila,
  type EmisionCiclo,
  type PerfilAlumnoFila,
  type PlanFila,
} from './finanzas-reglas';
import {
  calcularSiguienteCorte,
  corteVigente,
  debeEmitirCuota,
  instanteCorteUtc,
  periodoDeCorte,
} from '../suscripcion-ciclo';
import { resolverMontoCuotaCaso } from './monto-cuota';

// ===========================================================================
// 4c. EMISIÓN POR CICLO Y SALDO A FAVOR (RF-005 / RF-006 / RF-008)
// ===========================================================================

/** Emite la cuota del ciclo en curso si ya está dentro de la ventana de 5 días; si no, `null`. */
export async function emitirCuotaDeSuscripcionSiCorrespondeCaso(
  tx: TenantTransaction,
  perfil: PerfilAlumnoFila,
  plan: PlanFila,
  ahora: Date
): Promise<EmisionCiclo | null> {
  if (!perfil.cicloAncla || !perfil.proximoCorte) return null;

  const hoyLocal = obtenerFechaLocalYyyyMmDd(ahora, zonaDelAlumno(perfil));
  if (!debeEmitirCuota(perfil.proximoCorte, hoyLocal)) return null;

  const corte = corteVigente(perfil.cicloAncla, perfil.proximoCorte, plan.duracionMeses, hoyLocal);
  return emitirCuotaDeCicloEnTxCaso(tx, perfil, plan, corte, ahora);
}

/**
 * RF-006 RN-05: suma `excedenteUsd` al saldo a favor del alumno, con su fila bloqueada para que
 * una emisión o una aprobación concurrentes no pierdan el incremento. Sin excedente no hace nada.
 * El perfil se busca en el entrenador DUEÑO de la cuota (supuesto: el perfil del alumno es del
 * mismo entrenador que sus cuotas).
 *
 * ORDEN DE BLOQUEOS (evita deadlocks): aprobar o cobrar bloquea la cuota y DESPUÉS el perfil.
 * Por eso ninguna ruta que bloquee el perfil del alumno (asignar o quitar el plan, la emisión, el
 * cobro inteligente) puede bloquear ni actualizar después una cuota EXISTENTE: solo insertar
 * cuotas nuevas. Si una ruta futura lo necesita, debe bloquear la cuota antes que el perfil.
 */
export async function acreditarSaldoAFavorCaso(
  tx: TenantTransaction,
  clienteUsuarioId: string,
  entrenadorId: string,
  excedenteUsd: string,
  ahora: Date
): Promise<void> {
  if (toCents(excedenteUsd) <= 0) return;
  const [perfil] = await tx
    .select({ id: perfilesAlumno.id, saldoAFavorUsd: perfilesAlumno.saldoAFavorUsd })
    .from(perfilesAlumno)
    .where(
      and(
        eq(perfilesAlumno.usuarioId, clienteUsuarioId),
        eq(perfilesAlumno.entrenadorId, entrenadorId)
      )
    )
    .for('update');
  if (!perfil) {
    // Sin perfil no hay dónde acreditar: se revierte la operación entera (nunca se pierde dinero).
    throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }
  await tx
    .update(perfilesAlumno)
    .set({ saldoAFavorUsd: addDecimals(perfil.saldoAFavorUsd, excedenteUsd), updatedAtUtc: ahora })
    .where(eq(perfilesAlumno.id, perfil.id));
}

/**
 * RF-007: resta `excedenteUsd` del saldo a favor del alumno al revertir el pago que lo generó
 * (simétrica a `acreditarSaldoAFavor`, mismo orden de bloqueos). Si el saldo actual no alcanza,
 * ese excedente ya se aplicó a otra cuota: 409 y la transacción entera se deshace.
 */
export async function retirarSaldoAFavorCaso(
  tx: TenantTransaction,
  clienteUsuarioId: string,
  entrenadorId: string,
  excedenteUsd: string,
  ahora: Date
): Promise<void> {
  if (toCents(excedenteUsd) <= 0) return;
  const [perfil] = await tx
    .select({ id: perfilesAlumno.id, saldoAFavorUsd: perfilesAlumno.saldoAFavorUsd })
    .from(perfilesAlumno)
    .where(
      and(
        eq(perfilesAlumno.usuarioId, clienteUsuarioId),
        eq(perfilesAlumno.entrenadorId, entrenadorId)
      )
    )
    .for('update');
  if (!perfil) {
    throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }
  if (toCents(perfil.saldoAFavorUsd) < toCents(excedenteUsd)) {
    throw new ConflictException(MENSAJE_REVERSION_SALDO_USADO);
  }
  await tx
    .update(perfilesAlumno)
    .set({ saldoAFavorUsd: subtractDecimals(perfil.saldoAFavorUsd, excedenteUsd), updatedAtUtc: ahora })
    .where(eq(perfilesAlumno.id, perfil.id));
}

/**
 * Emite la cuota que vence en `corte` (día local) y avanza `proximo_corte` al ciclo siguiente,
 * en la MISMA transacción. Si la cuota de ese periodo ya existe no se duplica, pero el ciclo
 * avanza igual (un barrido repetido es idempotente).
 */
export async function emitirCuotaDeCicloEnTxCaso(
  tx: TenantTransaction,
  perfil: PerfilAlumnoFila,
  plan: PlanFila,
  corte: string,
  ahora: Date
): Promise<EmisionCiclo> {
  const periodo = periodoDeCorte(corte);
  const [existente] = await tx
    .select({ id: cuotasMembresia.id })
    .from(cuotasMembresia)
    .where(
      and(
        eq(cuotasMembresia.clienteId, perfil.usuarioId),
        eq(cuotasMembresia.planId, plan.id),
        eq(cuotasMembresia.periodo, periodo),
        // RF-008: una cuota anulada no ocupa su periodo (mismo predicado que el índice único).
        ne(cuotasMembresia.estado, EstadoCuota.ANULADA)
      )
    );

  let cuota: CuotaFila | null = null;
  let esBecado = false;

  // RF-006 RN-05: saldo a favor leído con la fila del alumno bloqueada (una aprobación
  // concurrente que lo incrementa espera a esta transacción, y viceversa).
  let saldoAFavorRestante: string | null = null;

  if (!existente) {
    const monto = await resolverMontoCuotaCaso(tx, plan, perfil.usuarioId);
    esBecado = monto.esBecado;

    let saldoAFavor = '0.00';
    if (!esBecado) {
      const [filaSaldo] = await tx
        .select({ saldoAFavorUsd: perfilesAlumno.saldoAFavorUsd })
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.id, perfil.id))
        .for('update');
      saldoAFavor = filaSaldo?.saldoAFavorUsd ?? '0.00';
    }
    const inicial = aplicarSaldoAFavorACuota(monto.montoTotal, saldoAFavor, esBecado);
    const aplicado = inicial.aplicadoUsd;
    const pendiente = inicial.saldoPendienteUsd;
    const estadoInicial = inicial.estado;
    if (toCents(aplicado) > 0) saldoAFavorRestante = inicial.saldoAFavorRestanteUsd;
    assertBalanceInvariant(monto.montoTotal, aplicado, pendiente);

    [cuota] = await tx
      .insert(cuotasMembresia)
      .values({
        clienteId: perfil.usuarioId,
        entrenadorId: perfil.entrenadorId,
        planId: plan.id,
        periodo,
        montoTotalUsd: monto.montoTotal,
        montoAbonadoUsd: aplicado,
        saldoPendienteUsd: pendiente,
        saldoAFavorAplicadoUsd: aplicado,
        fechaEmisionUtc: ahora,
        fechaCorteUtc: instanteCorteUtc(corte, zonaDelAlumno(perfil)),
        // RF-005 §6: la cuota del becado nace Al Día (no hay deuda que cobrar); también la que
        // el saldo a favor cubre entera.
        estado: estadoInicial,
        notas: null,
        createdAtUtc: ahora,
        updatedAtUtc: ahora,
      })
      .returning();
  }

  const proximoCorte = calcularSiguienteCorte(
    perfil.cicloAncla ?? corte,
    corte,
    Math.max(1, plan.duracionMeses)
  );
  await tx
    .update(perfilesAlumno)
    .set({
      proximoCorte,
      ...(saldoAFavorRestante !== null ? { saldoAFavorUsd: saldoAFavorRestante } : {}),
      updatedAtUtc: ahora,
    })
    .where(eq(perfilesAlumno.id, perfil.id));

  return { cuota, esBecado, proximoCorte };
}
