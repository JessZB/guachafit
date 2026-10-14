import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  AnularCuotaDTO,
  AnularCuotaSchema,
  CuotaDetalleDTO,
  EstadoConciliacion,
  EstadoCuota,
  MENSAJE_ANULACION_CON_PAGOS_APROBADOS,
  MENSAJE_ANULACION_PAGO_EN_REVISION,
  MENSAJE_CUOTA_YA_ANULADA,
} from '@guachafit/shared';
import {
  and,
  cuotasMembresia,
  eq,
  inArray,
  sql,
  transaccionesPago,
} from '@guachafit/database';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import {
  fromCents,
  toCents,
  MENSAJE_CUOTA_NO_ENCONTRADA,
} from './finanzas-reglas';
import { acreditarSaldoAFavorCaso } from './emision-ciclo';
import { cancelarRecordatoriosDeCuotaCaso } from './recordatorios-cuota';
import { mapearCuotaDTOCaso } from './mapeo-dto-finanzas';
import { CuotaAnuladaEvent } from '../../notificaciones/events/eventos-notificacion';
import type { ContextoFinanzas } from './contexto-finanzas';

// ===========================================================================
// 9. ANULACIÓN DE CUOTA (RF-008, RNF-002)
// ===========================================================================

/**
 * RF-008: anula una cuota sin pagos (estado terminal). Solo el entrenador dueño, con motivo.
 *
 * - La cuota se bloquea ANTES de revisar sus pagos: un reporte o una conciliación en paralelo
 *   esperan y después ven la cuota anulada, o la anulación ve su pago y responde 409.
 * - Lo que la cuota tomó del saldo a favor al emitirse vuelve al perfil del alumno (cuota →
 *   perfil, el orden de bloqueos de `acreditarSaldoAFavor`).
 * - La cuota anulada queda sin deuda (abonado y pendiente en 0) y conserva su total para el
 *   historial: como estado terminal, queda fuera de la invariante total = abonado + pendiente.
 * - Se puede anular la cuota de un alumno archivado (la búsqueda es por cuota y entrenador).
 */
export async function anularCuotaCaso(
  ctx: ContextoFinanzas,
  cuotaId: string,
  entrenadorId: string,
  dto: AnularCuotaDTO,
  ahora: Date = new Date()
): Promise<{ cuota: CuotaDetalleDTO; saldoAFavorDevueltoUsd: string; mensaje: string }> {
  const validado = parsearContrato(AnularCuotaSchema, dto);

  const resultado = await ctx.db.transaction(async (tx) => {
    // Contexto RLS del coach (mismo patrón que `revertirTransaccion`).
    await tx.execute(
      sql`SELECT set_config('app.current_entrenador_id', ${entrenadorId}, true)`
    );
    const [cuota] = await tx
      .select()
      .from(cuotasMembresia)
      .where(and(eq(cuotasMembresia.id, cuotaId), eq(cuotasMembresia.entrenadorId, entrenadorId)))
      .for('update');
    if (!cuota) {
      throw new NotFoundException(MENSAJE_CUOTA_NO_ENCONTRADA);
    }
    if (cuota.estado === EstadoCuota.ANULADA) {
      throw new ConflictException(MENSAJE_CUOTA_YA_ANULADA);
    }

    // Los pagos rechazados o revertidos no bloquean: quedan en el historial.
    const pagosVigentes = await tx
      .select({ estadoConciliacion: transaccionesPago.estadoConciliacion })
      .from(transaccionesPago)
      .where(
        and(
          eq(transaccionesPago.cuotaId, cuota.id),
          inArray(transaccionesPago.estadoConciliacion, [
            EstadoConciliacion.PENDIENTE,
            EstadoConciliacion.APROBADO,
          ])
        )
      );
    if (pagosVigentes.some((p) => p.estadoConciliacion === EstadoConciliacion.PENDIENTE)) {
      throw new ConflictException(MENSAJE_ANULACION_PAGO_EN_REVISION);
    }
    // Defensa: un abono que no salió del saldo a favor viene de un pago (dato anterior a la 0019).
    if (
      pagosVigentes.length > 0 ||
      toCents(cuota.montoAbonadoUsd) > toCents(cuota.saldoAFavorAplicadoUsd)
    ) {
      throw new ConflictException(MENSAJE_ANULACION_CON_PAGOS_APROBADOS);
    }

    const devuelto = fromCents(toCents(cuota.saldoAFavorAplicadoUsd));
    await acreditarSaldoAFavorCaso(tx, cuota.clienteId, cuota.entrenadorId, devuelto, ahora);

    const [cuotaAnulada] = await tx
      .update(cuotasMembresia)
      .set({
        estado: EstadoCuota.ANULADA,
        montoAbonadoUsd: '0.00',
        saldoPendienteUsd: '0.00',
        saldoAFavorAplicadoUsd: '0.00',
        motivoAnulacion: validado.motivo,
        fechaAnulacionUtc: ahora,
        anuladaPor: entrenadorId,
        updatedAtUtc: ahora,
      })
      .where(eq(cuotasMembresia.id, cuota.id))
      .returning();

    return {
      cuota: mapearCuotaDTOCaso(cuotaAnulada),
      saldoAFavorDevueltoUsd: devuelto,
      mensaje:
        toCents(devuelto) > 0
          ? `Cuota anulada. ${devuelto} USD volvieron al saldo a favor del alumno.`
          : 'Cuota anulada.',
    };
  });

  // Una cuota anulada no tiene deuda: sus recordatorios sobran (el procesador ya los descarta).
  await cancelarRecordatoriosDeCuotaCaso(ctx, resultado.cuota.id);

  if (ctx.eventEmitter) {
    const [anio, mes] = resultado.cuota.periodo.split('-');
    const devolucion =
      toCents(resultado.saldoAFavorDevueltoUsd) > 0
        ? ` ${resultado.saldoAFavorDevueltoUsd} USD volvieron a tu saldo a favor.`
        : '';
    // RF-014: aviso fire-and-forget al alumno; un fallo del bus no revierte la anulación.
    void ctx.eventEmitter
      .emitAsync(
        CuotaAnuladaEvent.NOMBRE,
        new CuotaAnuladaEvent({
          tipoEvento: 'CUOTA_ANULADA',
          destinatarioUserId: resultado.cuota.clienteId,
          entrenadorId,
          categoria: 'FINANZAS',
          titulo: 'Tu entrenador anuló una cuota',
          cuerpo: `Tu entrenador anuló tu cuota de ${mes}/${anio}. Motivo: ${validado.motivo}.${devolucion}`,
          linkAccion: '/app/pagos',
          datosAdicionales: { cuotaId: resultado.cuota.id, motivoAnulacion: validado.motivo },
          esCriticoSeguridad: false,
          // Una sola anulación por cuota (terminal): la referencia no se repite. Sin `:` (BullMQ).
          referenciaId: `${resultado.cuota.id}_anulada`,
        })
      )
      .catch(() => {});
  }

  return resultado;
}
