import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  ConciliarTransaccionDTO,
  CuotaDetalleDTO,
  EstadoConciliacion,
  EstadoCuota,
  MENSAJE_CONCILIACION_CUOTA_ANULADA,
  TransaccionPagoDetalleDTO,
} from '@guachafit/shared';
import {
  and,
  cuotasMembresia,
  eq,
  ne,
  sql,
  transaccionesPago,
} from '@guachafit/database';
import {
  addDecimals,
  assertBalanceInvariant,
  estadoCuotaTrasRetirarAbono,
  mensajePagoAprobado,
  repartirAbono,
  subtractDecimals,
  toCents,
  MENSAJE_PAGO_NO_ENCONTRADO,
} from './finanzas-reglas';
import { acreditarSaldoAFavorCaso } from './emision-ciclo';
import { cancelarRecordatoriosDeCuotaCaso } from './recordatorios-cuota';
import { mapearCuotaDTOCaso, mapearTransaccionDTOCaso } from './mapeo-dto-finanzas';
import {
  PagoAprobadoEvent,
  PagoRechazadoEvent,
} from '../../notificaciones/events/eventos-notificacion';
import type { ContextoFinanzas } from './contexto-finanzas';

// ===========================================================================
// 7. CONCILIACIÓN CON BLOQUEO PESIMISTA (SELECT ... FOR UPDATE) (RNF-002)
// ===========================================================================

export async function conciliarTransaccionCaso(
  ctx: ContextoFinanzas,
  transaccionId: string,
  entrenadorId: string,
  dto: ConciliarTransaccionDTO
): Promise<{
  transaccion: TransaccionPagoDetalleDTO;
  cuota: CuotaDetalleDTO;
  mensaje: string;
}> {
  if (dto.accion === 'rechazar' && (!dto.motivoRechazo || dto.motivoRechazo.trim().length === 0)) {
    throw new BadRequestException('El motivo de rechazo es obligatorio al rechazar una transacción.');
  }

  const resultado = await ctx.db.transaction(async (tx) => {
    // 1. Contexto RLS (set_config parametrizado = SET LOCAL válido; ver withTenant()).
    //    RNF-003/ADR-011 (etapa 2): transacción propia con FOR UPDATE + GUC manual,
    //    EQUIVALENTE a withTenant (no se anida el helper sobre db.transaction).
    await tx.execute(
      sql`SELECT set_config('app.current_entrenador_id', ${entrenadorId}, true)`
    );

    // 2. Bloqueo Pesimista en la Transacción
    await tx.execute(sql`SELECT id FROM transacciones_pago WHERE id = ${transaccionId} FOR UPDATE`);

    const [txRecord] = await tx
      .select()
      .from(transaccionesPago)
      .where(
        and(
          eq(transaccionesPago.id, transaccionId),
          eq(transaccionesPago.entrenadorId, entrenadorId)
        )
      );

    if (!txRecord) {
      throw new NotFoundException(MENSAJE_PAGO_NO_ENCONTRADO);
    }

    if (txRecord.estadoConciliacion !== EstadoConciliacion.PENDIENTE) {
      throw new ConflictException('Este pago ya fue revisado.');
    }

    // 3. Bloqueo Pesimista en la Cuota asociada
    await tx.execute(sql`SELECT id FROM cuotas_membresia WHERE id = ${txRecord.cuotaId} FOR UPDATE`);

    const [cuotaLock] = await tx
      .select()
      .from(cuotasMembresia)
      .where(eq(cuotasMembresia.id, txRecord.cuotaId));

    if (!cuotaLock) {
      throw new NotFoundException('Cuota asociada a la transacción no encontrada.');
    }
    // RF-008: una cuota anulada es terminal; ningún pago se aprueba ni se rechaza sobre ella.
    if (cuotaLock.estado === EstadoCuota.ANULADA) {
      throw new ConflictException(MENSAJE_CONCILIACION_CUOTA_ANULADA);
    }

    const nowUtc = new Date();

    if (dto.accion === 'aprobar') {
      // Aprobación: liquidar crédito en USD. RF-006 RN-05: lo que excede el saldo de la cuota
      // (p. ej. el mismo pago reportado dos veces) pasa al saldo a favor del alumno.
      const reparto = repartirAbono(cuotaLock.saldoPendienteUsd, txRecord.montoEquivalenteUsd);
      const [txAprobada] = await tx
        .update(transaccionesPago)
        .set({
          estadoConciliacion: EstadoConciliacion.APROBADO,
          excedenteUsd: reparto.excedenteUsd,
          fechaConciliacionUtc: nowUtc,
          updatedAtUtc: nowUtc,
        })
        .where(eq(transaccionesPago.id, transaccionId))
        .returning();

      const nuevoAbonado = addDecimals(cuotaLock.montoAbonadoUsd, reparto.aplicadoUsd);
      const nuevoPendiente = subtractDecimals(cuotaLock.saldoPendienteUsd, reparto.aplicadoUsd);
      await acreditarSaldoAFavorCaso(
        tx,
        cuotaLock.clienteId,
        cuotaLock.entrenadorId,
        reparto.excedenteUsd,
        nowUtc
      );
      const nuevoEstado =
        toCents(nuevoPendiente) === 0 ? EstadoCuota.AL_DIA : EstadoCuota.ABONADA_PARCIAL;

      assertBalanceInvariant(cuotaLock.montoTotalUsd, nuevoAbonado, nuevoPendiente);

      const [cuotaActualizada] = await tx
        .update(cuotasMembresia)
        .set({
          montoAbonadoUsd: nuevoAbonado,
          saldoPendienteUsd: nuevoPendiente,
          estado: nuevoEstado,
          updatedAtUtc: nowUtc,
        })
        .where(eq(cuotasMembresia.id, cuotaLock.id))
        .returning();

      return {
        transaccion: mapearTransaccionDTOCaso(txAprobada),
        cuota: mapearCuotaDTOCaso(cuotaActualizada),
        mensaje: 'Transacción aprobada y saldo de cuota liquidado exitosamente.',
      };
    } else {
      // Rechazo: Exigir motivo y restaurar estado previo de cuota (RN-05)
      const [txRechazada] = await tx
        .update(transaccionesPago)
        .set({
          estadoConciliacion: EstadoConciliacion.RECHAZADO,
          motivoRechazo: dto.motivoRechazo?.trim() || 'Rechazado por el entrenador',
          fechaConciliacionUtc: nowUtc,
          updatedAtUtc: nowUtc,
        })
        .where(eq(transaccionesPago.id, transaccionId))
        .returning();

      // Verificar si existen otras transacciones aún en estado PENDIENTE en esta cuota
      const otrasPendientes = await tx
        .select()
        .from(transaccionesPago)
        .where(
          and(
            eq(transaccionesPago.cuotaId, cuotaLock.id),
            eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.PENDIENTE),
            ne(transaccionesPago.id, transaccionId)
          )
        );

      // Si otro pago ya la saldó, rechazar este no la vuelve parcial.
      const nuevoEstado = estadoCuotaTrasRetirarAbono({
        montoAbonadoUsd: cuotaLock.montoAbonadoUsd,
        saldoPendienteUsd: cuotaLock.saldoPendienteUsd,
        fechaCorteUtc: cuotaLock.fechaCorteUtc,
        hayOtrasPendientes: otrasPendientes.length > 0,
        ahora: nowUtc,
      });

      // Invariante de balance permanece inalterada
      assertBalanceInvariant(
        cuotaLock.montoTotalUsd,
        cuotaLock.montoAbonadoUsd,
        cuotaLock.saldoPendienteUsd
      );

      const [cuotaActualizada] = await tx
        .update(cuotasMembresia)
        .set({
          estado: nuevoEstado,
          updatedAtUtc: nowUtc,
        })
        .where(eq(cuotasMembresia.id, cuotaLock.id))
        .returning();

      return {
        transaccion: mapearTransaccionDTOCaso(txRechazada),
        cuota: mapearCuotaDTOCaso(cuotaActualizada),
        mensaje: 'Transacción rechazada y cuota restaurada exitosamente.',
      };
    }
  });

  // WU-H (RF-008 / ADR-008 §3.2): aprobar el pago que deja la cuota en $0.00 cancela los
  // recordatorios futuros (T-1/T/T+2) para no cobrarle a un cliente que ya está al día.
  if (dto.accion === 'aprobar' && toCents(resultado.cuota.saldoPendienteUsd) === 0) {
    await cancelarRecordatoriosDeCuotaCaso(ctx, resultado.cuota.id);
  }

  if (ctx.eventEmitter) {
    if (dto.accion === 'aprobar') {
      // RF-014 RN-01: evento de dominio fire-and-forget (el recibo crítico lo garantiza Email).
      void ctx.eventEmitter
        .emitAsync(
          PagoAprobadoEvent.NOMBRE,
          new PagoAprobadoEvent({
            tipoEvento: 'PAGO_APROBADO',
            destinatarioUserId: resultado.transaccion.clienteId,
            entrenadorId,
            categoria: 'FINANZAS',
            titulo: '¡Pago verificado y aprobado!',
            cuerpo: mensajePagoAprobado(
              `Tu pago de ${resultado.transaccion.montoOriginal} ${resultado.transaccion.monedaOriginal} fue aprobado con éxito.`,
              resultado.transaccion.excedenteUsd
            ),
            linkAccion: '/finanzas',
            datosAdicionales: {
              transaccionId: resultado.transaccion.id,
              cuotaId: resultado.cuota.id,
              montoEquivalenteUsd: resultado.transaccion.montoEquivalenteUsd,
              excedenteUsd: resultado.transaccion.excedenteUsd,
            },
            esCriticoSeguridad: true, // Recibo financiero / comprobante crítico garantizado por Email (RF-015 RN-03)
            // RNF-004 §3: ref de origen del jobId determinista.
            referenciaId: resultado.transaccion.id,
          })
        )
        .catch(() => {});
    } else {
      void ctx.eventEmitter
        .emitAsync(
          PagoRechazadoEvent.NOMBRE,
          new PagoRechazadoEvent({
            tipoEvento: 'PAGO_RECHAZADO',
            destinatarioUserId: resultado.transaccion.clienteId,
            entrenadorId,
            categoria: 'FINANZAS',
            titulo: 'Pago no verificado',
            cuerpo: `Tu pago fue rechazado. Motivo: ${resultado.transaccion.motivoRechazo || 'Rechazado por el entrenador'}.`,
            linkAccion: '/finanzas',
            datosAdicionales: {
              transaccionId: resultado.transaccion.id,
              cuotaId: resultado.cuota.id,
              motivoRechazo: resultado.transaccion.motivoRechazo,
            },
            esCriticoSeguridad: false,
            // RNF-004 §3: ref de origen del jobId determinista.
            referenciaId: resultado.transaccion.id,
          })
        )
        .catch(() => {});
    }
  }

  return resultado;
}
