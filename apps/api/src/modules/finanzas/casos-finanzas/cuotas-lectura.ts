import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CuotaDetalleDTO, Rol, TransaccionPagoDetalleDTO } from '@guachafit/shared';
import {
  asc,
  cuotasMembresia,
  eq,
  perfilesAlumno,
  planesMembresia,
  transaccionesPago,
} from '@guachafit/database';
import { toCents, toIsoSafe, MENSAJE_CUOTA_NO_ENCONTRADA } from './finanzas-reglas';
import { contextoRlsDeActor } from './acceso-rls-finanzas';
import { resolverComprobanteUrlCaso } from './comprobantes';
import {
  obtenerTasaVigenteCaso,
  proyectarVESCaso,
} from './tasas-conversion';
import type { ContextoFinanzas } from './contexto-finanzas';

// ===========================================================================
// 4d. LECTURA DE CUOTA POR ID (RF-008, RNF-002, RNF-003)
// ===========================================================================

export async function obtenerCuotaPorIdCaso(
  ctx: ContextoFinanzas,
  cuotaId: string,
  actorUserId: string,
  actorRole: Rol,
  actorEntrenadorId?: string
): Promise<CuotaDetalleDTO> {
  // RNF-003/ADR-011 (etapa 2): `cuotas_membresia`, `planes_membresia` y `transacciones_pago`
  // tienen RLS. Contexto según actor:
  // - ALUMNO  -> self-select (`cliente_id = current_usuario_id`).
  // - COACH   -> tenant del entrenador dueño.
  // - SUPERADMIN -> bypass explícito (defensivo; la ruta solo admite coach/alumno).
  const contexto = contextoRlsDeActor(actorUserId, actorRole, actorEntrenadorId);

  return ctx.withTenant(contexto, async (tx) => {
    const [cuota] = await tx
      .select()
      .from(cuotasMembresia)
      .where(eq(cuotasMembresia.id, cuotaId));

    if (!cuota) {
      throw new NotFoundException(MENSAJE_CUOTA_NO_ENCONTRADA);
    }

    // Aislamiento de Tenancy / Autorización
    if (actorRole === Rol.ALUMNO && cuota.clienteId !== actorUserId) {
      throw new ForbiddenException('No tienes acceso a esta cuota.');
    }

    if (
      actorRole === Rol.ENTRENADOR &&
      cuota.entrenadorId !== actorUserId &&
      cuota.entrenadorId !== actorEntrenadorId
    ) {
      throw new ForbiddenException(
        'No tienes acceso a esta cuota.'
      );
    }

    // Cargar información adicional
    const [plan] = await tx
      .select()
      .from(planesMembresia)
      .where(eq(planesMembresia.id, cuota.planId));

    const [alumno] = await tx
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, cuota.clienteId));

    const txRecords = await tx
      .select()
      .from(transaccionesPago)
      .where(eq(transaccionesPago.cuotaId, cuotaId))
      .orderBy(asc(transaccionesPago.fechaReporteUtc));

    const transacciones: TransaccionPagoDetalleDTO[] = await Promise.all(
      txRecords.map(async (t) => ({
        id: t.id,
        cuotaId: t.cuotaId,
        clienteId: t.clienteId,
        entrenadorId: t.entrenadorId,
        registradoPor: t.registradoPor,
        montoOriginal: t.montoOriginal,
        monedaOriginal: t.monedaOriginal,
        tasaCambioFijada: t.tasaCambioFijada,
        montoEquivalenteUsd: t.montoEquivalenteUsd,
        excedenteUsd: t.excedenteUsd,
        metodoPago: t.metodoPago,
        referenciaBancaria: t.referenciaBancaria,
        fechaOperacion: t.fechaOperacion,
        comprobanteStorageKey: t.comprobanteStorageKey,
        comprobanteUrl: await resolverComprobanteUrlCaso(
          ctx,
          t.comprobanteStorageKey,
          t.clienteId
        ),
        estadoConciliacion: t.estadoConciliacion,
        motivoRechazo: t.motivoRechazo,
        fechaReporteUtc: t.fechaReporteUtc.toISOString(),
        fechaConciliacionUtc: t.fechaConciliacionUtc?.toISOString() || null,
        createdAtUtc: t.createdAtUtc.toISOString(),
        updatedAtUtc: t.updatedAtUtc.toISOString(),
      }))
    );

    // Proyección en Bs solo con tasa real (misma regla que la emisión: sin tasa, se omite).
    // RNF-003/ADR-011 (etapa 3): la tasa override se lee en la MISMA transacción con contexto.
    const tasa = await obtenerTasaVigenteCaso(ctx, cuota.entrenadorId, cuota.clienteId, tx);
    const saldoPendienteVes = tasa.tasaEfectiva
      ? proyectarVESCaso(cuota.saldoPendienteUsd, tasa.tasaEfectiva)
      : undefined;

    return {
      id: cuota.id,
      clienteId: cuota.clienteId,
      entrenadorId: cuota.entrenadorId,
      planId: cuota.planId,
      periodo: cuota.periodo,
      montoTotalUsd: cuota.montoTotalUsd,
      montoAbonadoUsd: cuota.montoAbonadoUsd,
      saldoPendienteUsd: cuota.saldoPendienteUsd,
      saldoAFavorAplicadoUsd: cuota.saldoAFavorAplicadoUsd,
      saldoPendienteVes,
      tasaAplicada: tasa.tasaEfectiva ?? undefined,
      fechaEmisionUtc: toIsoSafe(cuota.fechaEmisionUtc),
      fechaCorteUtc: toIsoSafe(cuota.fechaCorteUtc),
      estado: cuota.estado,
      notas: cuota.notas,
      // RF-005 §6: reconocible en cualquier lectura de la cuota (becado = emitida en 0.00).
      esBecado: toCents(cuota.montoTotalUsd) === 0,
      planNombre: plan?.nombre,
      clienteNombre: alumno ? `${alumno.nombres} ${alumno.apellidos}` : undefined,
      transacciones,
      createdAtUtc: toIsoSafe(cuota.createdAtUtc),
      updatedAtUtc: toIsoSafe(cuota.updatedAtUtc),
    };
  });
}
