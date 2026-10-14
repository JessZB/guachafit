import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  CuotaDetalleDTO,
  EstadoConciliacion,
  EstadoCuota,
  MENSAJE_REVERSION_SOLO_APROBADOS,
  MENSAJE_REVERSION_CUOTA_ANULADA,
  RevertirPagoDTO,
  RevertirPagoSchema,
  TransaccionPagoDetalleDTO,
} from '@guachafit/shared';
import {
  and,
  cuotasMembresia,
  eq,
  perfilesAlumno,
  sql,
  transaccionesPago,
} from '@guachafit/database';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import {
  assertBalanceInvariant,
  estadoCuotaTrasRetirarAbono,
  fromCents,
  subtractDecimals,
  toCents,
  zonaDelAlumno,
  MENSAJE_PAGO_NO_ENCONTRADO,
} from './finanzas-reglas';
import { retirarSaldoAFavorCaso } from './emision-ciclo';
import { mapearCuotaDTOCaso, mapearTransaccionDTOCaso } from './mapeo-dto-finanzas';
import { PagoRevertidoEvent } from '../../notificaciones/events/eventos-notificacion';
import type { ContextoFinanzas } from './contexto-finanzas';

// ===========================================================================
// 8. REVERSIÓN DE PAGO APROBADO (RF-007, RNF-002)
// ===========================================================================

/**
 * RF-007 (decisión del dueño 2026-10-11): revierte un pago APROBADO por error (de la bandeja o un
 * cobro en sala). Solo el entrenador dueño, con motivo obligatorio, en cualquier momento.
 *
 * Deshace exactamente la aprobación: devuelve a la cuota lo aplicado y quita del saldo a favor el
 * excedente que generó el pago (RF-006 RN-05). Si ese excedente ya se aplicó a otra cuota (el
 * saldo a favor actual no alcanza), responde 409 y no cambia nada: nunca queda saldo negativo.
 * El pago queda `revertido` con su motivo; no se borra.
 *
 * Bloqueos en el MISMO orden que la aprobación: transacción → cuota → perfil (ver
 * `acreditarSaldoAFavor`). Si la cuota vuelve a tener deuda, sus recordatorios se agendan en el
 * acto (best-effort; BullMQ descarta los repetidos por `jobId`).
 */
export async function revertirTransaccionCaso(
  ctx: ContextoFinanzas,
  transaccionId: string,
  entrenadorId: string,
  dto: RevertirPagoDTO,
  ahora: Date = new Date()
): Promise<{
  transaccion: TransaccionPagoDetalleDTO;
  cuota: CuotaDetalleDTO;
  mensaje: string;
}> {
  const validado = parsearContrato(RevertirPagoSchema, dto);
  let zonaAlumno: string | null = null;

  const resultado = await ctx.db.transaction(async (tx) => {
    // Contexto RLS del coach (mismo patrón que `conciliarTransaccion`).
    await tx.execute(
      sql`SELECT set_config('app.current_entrenador_id', ${entrenadorId}, true)`
    );
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
    if (txRecord.estadoConciliacion !== EstadoConciliacion.APROBADO) {
      throw new ConflictException(MENSAJE_REVERSION_SOLO_APROBADOS);
    }

    await tx.execute(sql`SELECT id FROM cuotas_membresia WHERE id = ${txRecord.cuotaId} FOR UPDATE`);
    const [cuotaLock] = await tx
      .select()
      .from(cuotasMembresia)
      .where(eq(cuotasMembresia.id, txRecord.cuotaId));
    if (!cuotaLock) {
      throw new NotFoundException('Cuota asociada a la transacción no encontrada.');
    }
    if (cuotaLock.estado === EstadoCuota.ANULADA) {
      throw new ConflictException(MENSAJE_REVERSION_CUOTA_ANULADA);
    }

    const excedente = txRecord.excedenteUsd;
    const aplicado = subtractDecimals(txRecord.montoEquivalenteUsd, excedente);

    // El excedente que generó este pago sale del saldo a favor; si ya se gastó, no se revierte.
    await retirarSaldoAFavorCaso(
      tx,
      cuotaLock.clienteId,
      cuotaLock.entrenadorId,
      excedente,
      ahora
    );

    // La cuota recupera lo aplicado. El pendiente se recalcula desde el total (también cubre
    // pagos anteriores a la 0019, cuyo abonado podía superar el total).
    const nuevoAbonadoCents = Math.max(0, toCents(cuotaLock.montoAbonadoUsd) - toCents(aplicado));
    const nuevoAbonado = fromCents(nuevoAbonadoCents);
    const nuevoPendiente = fromCents(
      Math.max(0, toCents(cuotaLock.montoTotalUsd) - nuevoAbonadoCents)
    );
    assertBalanceInvariant(cuotaLock.montoTotalUsd, nuevoAbonado, nuevoPendiente);

    const otrasPendientes = await tx
      .select({ id: transaccionesPago.id })
      .from(transaccionesPago)
      .where(
        and(
          eq(transaccionesPago.cuotaId, cuotaLock.id),
          eq(transaccionesPago.estadoConciliacion, EstadoConciliacion.PENDIENTE)
        )
      );
    const nuevoEstado = estadoCuotaTrasRetirarAbono({
      montoAbonadoUsd: nuevoAbonado,
      saldoPendienteUsd: nuevoPendiente,
      fechaCorteUtc: cuotaLock.fechaCorteUtc,
      hayOtrasPendientes: otrasPendientes.length > 0,
      ahora,
    });

    const [cuotaActualizada] = await tx
      .update(cuotasMembresia)
      .set({
        montoAbonadoUsd: nuevoAbonado,
        saldoPendienteUsd: nuevoPendiente,
        estado: nuevoEstado,
        updatedAtUtc: ahora,
      })
      .where(eq(cuotasMembresia.id, cuotaLock.id))
      .returning();

    const [perfilZona] = await tx
      .select({ zonaHoraria: perfilesAlumno.zonaHoraria })
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.usuarioId, cuotaLock.clienteId),
          eq(perfilesAlumno.entrenadorId, cuotaLock.entrenadorId)
        )
      );
    zonaAlumno = perfilZona ? zonaDelAlumno(perfilZona) : null;

    const [txRevertida] = await tx
      .update(transaccionesPago)
      .set({
        estadoConciliacion: EstadoConciliacion.REVERTIDO,
        motivoReversion: validado.motivo,
        fechaReversionUtc: ahora,
        updatedAtUtc: ahora,
      })
      .where(eq(transaccionesPago.id, transaccionId))
      .returning();

    return {
      transaccion: mapearTransaccionDTOCaso(txRevertida),
      cuota: mapearCuotaDTOCaso(cuotaActualizada),
      mensaje:
        toCents(excedente) > 0
          ? `Pago revertido. La cuota volvió a su saldo anterior y se descontaron ${excedente} USD del saldo a favor del alumno.`
          : 'Pago revertido. La cuota volvió a su saldo anterior.',
    };
  });

  // La cuota vuelve a tener deuda: se agendan sus recordatorios (incluido el del día si toca).
  if (toCents(resultado.cuota.saldoPendienteUsd) > 0 && zonaAlumno && ctx.billingSchedulerService) {
    try {
      await ctx.billingSchedulerService.programarRecordatoriosCuota({
        id: resultado.cuota.id,
        fechaCorteUtc: new Date(resultado.cuota.fechaCorteUtc),
        zonaHoraria: zonaAlumno,
      });
    } catch (error) {
      ctx.logger.error(
        `No se pudieron reagendar los recordatorios de la cuota ${resultado.cuota.id}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (ctx.eventEmitter) {
    // RF-014: aviso fire-and-forget al alumno; un fallo del bus no revierte la reversión.
    void ctx.eventEmitter
      .emitAsync(
        PagoRevertidoEvent.NOMBRE,
        new PagoRevertidoEvent({
          tipoEvento: 'PAGO_REVERTIDO',
          destinatarioUserId: resultado.transaccion.clienteId,
          entrenadorId,
          categoria: 'FINANZAS',
          titulo: 'Tu entrenador revirtió un pago',
          cuerpo: `Tu entrenador revirtió tu pago de ${resultado.transaccion.montoOriginal} ${resultado.transaccion.monedaOriginal}. Motivo: ${validado.motivo}. Ese monto vuelve a figurar como pendiente en tu cuota.`,
          linkAccion: '/app/pagos',
          datosAdicionales: {
            transaccionId: resultado.transaccion.id,
            cuotaId: resultado.cuota.id,
            motivoReversion: validado.motivo,
          },
          esCriticoSeguridad: false,
          // RNF-004 §3: referencia propia, distinta de la del aviso de aprobación del mismo pago.
          // Con `_` y nunca `:` (BullMQ 5 rechaza `:` en los jobId; ver notificaciones.config.ts).
          referenciaId: `${resultado.transaccion.id}_revertido`,
        })
      )
      .catch(() => {});
  }

  return resultado;
}
