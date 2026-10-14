import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CuotaDetalleDTO,
  EstadoConciliacion,
  EstadoCuota,
  Moneda,
  MENSAJE_FECHA_PAGO_FUTURA,
  MENSAJE_REPORTE_CUOTA_ANULADA,
  ReportarPagoDTO,
  Rol,
  TransaccionPagoDetalleDTO,
} from '@guachafit/shared';
import {
  and,
  cuotasMembresia,
  eq,
  notInArray,
  transaccionesPago,
} from '@guachafit/database';
import { esViolacionUnicidad } from '../../../common/violacion-unicidad.util';
import {
  esFechaPagoFutura,
  esMetodoEfectivo,
  INDICE_REFERENCIA_POR_ENTRENADOR,
  MENSAJE_CUOTA_NO_ENCONTRADA,
  MENSAJE_REFERENCIA_DUPLICADA,
  toCents,
} from './finanzas-reglas';
import {
  calcularContravalorUSDCaso,
  obtenerTasaVigenteCaso,
} from './tasas-conversion';
import { obtenerCuotaPorIdCaso } from './cuotas-lectura';
import { resolverComprobanteUrlCaso } from './comprobantes';
import { PagoReportadoEvent } from '../../notificaciones/events/eventos-notificacion';
import type { ContextoFinanzas } from './contexto-finanzas';

// ===========================================================================
// 5. REPORTE DE PAGO POR ALUMNO & IDEMPOTENCIA (RF-007, RNF-002)
// ===========================================================================

export async function reportarPagoCaso(
  ctx: ContextoFinanzas,
  cuotaId: string,
  alumnoUserId: string,
  dto: ReportarPagoDTO,
  idempotencyHeader?: string
): Promise<{
  transaccion: TransaccionPagoDetalleDTO;
  cuota: CuotaDetalleDTO;
  esDuplicadoIdempotente: boolean;
  mensaje: string;
}> {
  const idempotencyKey = idempotencyHeader || dto.idempotencyKey;
  // RNF-002 §4 + aislamiento de tenant: la caché se indexa por solicitante para que una key
  // repetida jamás devuelva la respuesta de otro alumno, aunque la consulta de caché ocurra
  // antes del control de titularidad.
  const cacheKey = idempotencyKey ? `${alumnoUserId}:${idempotencyKey}` : undefined;

  // 1. Idempotencia en memoria (lag de red / reintento exacto): una respuesta guardada o una
  //    ejecución en curso con la misma clave se reutiliza en vez de registrar otro pago.
  let ejecutadoAhora = false;
  // La guarda de fecha futura va dentro de la ejecución: un reintento con la misma clave pasada
  // la medianoche devuelve el pago ya registrado en vez de rechazarlo (los fallos no se guardan).
  const { transaccion, cuota } = await ctx.idempotencia.ejecutar(cacheKey, async () => {
    ejecutadoAhora = true;
    if (esFechaPagoFutura(dto.fechaOperacion, new Date())) {
      throw new BadRequestException(MENSAJE_FECHA_PAGO_FUTURA);
    }
    return registrarReportePagoCaso(ctx, cuotaId, alumnoUserId, dto);
  });

  if (!ejecutadoAhora) {
    return {
      transaccion,
      cuota,
      esDuplicadoIdempotente: true,
      mensaje: 'Pago ya reportado previamente (respuesta idempotente).',
    };
  }

  return {
    transaccion,
    cuota,
    esDuplicadoIdempotente: false,
    mensaje: 'Pago reportado con éxito. Tu entrenador lo revisará pronto.',
  };
}

/** Pasos 2-5 del reporte de pago (sin idempotencia): valida, registra, notifica y devuelve. */
async function registrarReportePagoCaso(
  ctx: ContextoFinanzas,
  cuotaId: string,
  alumnoUserId: string,
  dto: ReportarPagoDTO
): Promise<{ transaccion: TransaccionPagoDetalleDTO; cuota: CuotaDetalleDTO }> {
  // 2-5. RNF-003/ADR-011 (etapa 2): el alumno reporta con contexto self (`current_usuario_id`).
  // Validación de titularidad, transacción y transición de la cuota en UNA transacción; las
  // políticas `self_select`/`self_insert`/`self_update` de 0012 cubren exactamente este flujo.
  const nuevaTx = await ctx.withTenant({ usuarioId: alumnoUserId }, async (tx) => {
    // 2. Validar cuota y permisos del alumno titular. RF-008: la cuota se bloquea para que una
    //    anulación en paralelo no deje un pago en revisión sobre una cuota anulada (la anulación
    //    también la bloquea antes de revisar sus pagos).
    const [cuota] = await tx
      .select()
      .from(cuotasMembresia)
      .where(eq(cuotasMembresia.id, cuotaId))
      .for('update');

    if (!cuota) {
      throw new NotFoundException(MENSAJE_CUOTA_NO_ENCONTRADA);
    }

    if (cuota.clienteId !== alumnoUserId) {
      throw new ForbiddenException('No puedes reportar pagos en esta cuota.');
    }

    if (cuota.estado === EstadoCuota.ANULADA) {
      throw new BadRequestException(MENSAJE_REPORTE_CUOTA_ANULADA);
    }

    if (cuota.estado === EstadoCuota.AL_DIA && toCents(cuota.saldoPendienteUsd) === 0) {
      throw new BadRequestException('La cuota ya se encuentra totalmente saldada.');
    }

    // 3. Referencia repetida (RF-007 §6) — mismo alcance que el índice único parcial
    //    `uq_transaccion_referencia_entrenador` (0018): dentro de la cartera del coach, solo
    //    métodos electrónicos y sin contar pagos rechazados (que pueden reenviarse). Bajo RLS el
    //    alumno solo ve sus propios pagos: el choque con los de otro alumno lo detecta el índice
    //    al insertar (23505 -> 409 más abajo).
    if (dto.referenciaBancaria && !esMetodoEfectivo(dto.metodoPago)) {
      const [txDuplicada] = await tx
        .select()
        .from(transaccionesPago)
        .where(
          and(
            eq(transaccionesPago.entrenadorId, cuota.entrenadorId),
            eq(transaccionesPago.metodoPago, dto.metodoPago),
            eq(transaccionesPago.referenciaBancaria, dto.referenciaBancaria),
            eq(transaccionesPago.fechaOperacion, dto.fechaOperacion),
            // RF-007: un pago rechazado o revertido no ocupa su referencia.
            notInArray(transaccionesPago.estadoConciliacion, [
              EstadoConciliacion.RECHAZADO,
              EstadoConciliacion.REVERTIDO,
            ])
          )
        );

      if (txDuplicada) {
        throw new ConflictException(MENSAJE_REFERENCIA_DUPLICADA);
      }
    }

    // 4. Congelar la tasa de cambio vigente (ADR-003 rate snapshot).
    //    Un pago en VES exige tasa real: sin ella no se puede calcular el contravalor USD y
    //    se devuelve un error de negocio claro en vez de inventar un equivalente.
    //    RNF-003/ADR-011 (etapa 3): tasa override leída en la MISMA tx (contexto self del alumno).
    const tasa = await obtenerTasaVigenteCaso(ctx, cuota.entrenadorId, alumnoUserId, tx);
    let tasaCambioFijada = '1.0000';
    let montoEquivalenteUsd = dto.montoOriginal;

    if (dto.monedaOriginal === Moneda.VES) {
      const tasaEfectiva = tasa.tasaEfectiva;
      if (!tasaEfectiva || parseFloat(tasaEfectiva) <= 0) {
        throw new BadRequestException(
          'El entrenador aún no ha configurado la tasa de cambio. No es posible calcular el equivalente en USD de un pago en bolívares.'
        );
      }
      tasaCambioFijada = tasaEfectiva;
      montoEquivalenteUsd = calcularContravalorUSDCaso(dto.montoOriginal, tasaEfectiva);
    }

    const nowUtc = new Date();

    // 5. Inserción de transacción y transición de cuota a 'pendiente_revision'
    let nuevaTx: typeof transaccionesPago.$inferSelect;
    try {
      [nuevaTx] = await tx
        .insert(transaccionesPago)
        .values({
          cuotaId: cuota.id,
          clienteId: alumnoUserId,
          entrenadorId: cuota.entrenadorId,
          registradoPor: alumnoUserId,
          montoOriginal: dto.montoOriginal,
          monedaOriginal: dto.monedaOriginal,
          tasaCambioFijada,
          montoEquivalenteUsd,
          metodoPago: dto.metodoPago,
          referenciaBancaria: dto.referenciaBancaria || null,
          fechaOperacion: dto.fechaOperacion,
          comprobanteStorageKey: dto.comprobanteStorageKey || null,
          estadoConciliacion: EstadoConciliacion.PENDIENTE,
          fechaReporteUtc: nowUtc,
          createdAtUtc: nowUtc,
          updatedAtUtc: nowUtc,
        })
        .returning();
    } catch (error) {
      if (esViolacionUnicidad(error, INDICE_REFERENCIA_POR_ENTRENADOR)) {
        throw new ConflictException(MENSAJE_REFERENCIA_DUPLICADA);
      }
      throw error;
    }

    // Transicionar cuota a PENDIENTE_REVISION
    await tx
      .update(cuotasMembresia)
      .set({
        estado: EstadoCuota.PENDIENTE_REVISION,
        updatedAtUtc: nowUtc,
      })
      .where(eq(cuotasMembresia.id, cuota.id));

    return nuevaTx;
  });

  // Lectura del detalle ya con la transacción confirmada (contexto del entrenador dueño).
  const cuotaDto = await obtenerCuotaPorIdCaso(
    ctx,
    nuevaTx.cuotaId,
    nuevaTx.entrenadorId,
    Rol.ENTRENADOR
  );

  const txDto: TransaccionPagoDetalleDTO = {
    id: nuevaTx.id,
    cuotaId: nuevaTx.cuotaId,
    clienteId: nuevaTx.clienteId,
    entrenadorId: nuevaTx.entrenadorId,
    registradoPor: nuevaTx.registradoPor,
    montoOriginal: nuevaTx.montoOriginal,
    monedaOriginal: nuevaTx.monedaOriginal,
    tasaCambioFijada: nuevaTx.tasaCambioFijada,
    montoEquivalenteUsd: nuevaTx.montoEquivalenteUsd,
    excedenteUsd: nuevaTx.excedenteUsd,
    metodoPago: nuevaTx.metodoPago,
    referenciaBancaria: nuevaTx.referenciaBancaria,
    fechaOperacion: nuevaTx.fechaOperacion,
    comprobanteStorageKey: nuevaTx.comprobanteStorageKey,
    comprobanteUrl: await resolverComprobanteUrlCaso(ctx, nuevaTx.comprobanteStorageKey),
    estadoConciliacion: nuevaTx.estadoConciliacion,
    motivoRechazo: nuevaTx.motivoRechazo,
    fechaReporteUtc: nuevaTx.fechaReporteUtc.toISOString(),
    fechaConciliacionUtc: null,
    createdAtUtc: nuevaTx.createdAtUtc.toISOString(),
    updatedAtUtc: nuevaTx.updatedAtUtc.toISOString(),
  };

  if (ctx.eventEmitter) {
    // RF-014 RN-01: evento de dominio fire-and-forget; un fallo de colas NUNCA tumba el reporte.
    void ctx.eventEmitter
      .emitAsync(
        PagoReportadoEvent.NOMBRE,
        new PagoReportadoEvent({
          tipoEvento: 'PAGO_REPORTADO',
          destinatarioUserId: nuevaTx.entrenadorId,
          entrenadorId: nuevaTx.entrenadorId,
          categoria: 'FINANZAS',
          titulo: 'Nuevo pago por verificar',
          cuerpo: `Se ha reportado un pago de ${nuevaTx.montoOriginal} ${nuevaTx.monedaOriginal} pendiente por conciliar.`,
          linkAccion: '/finanzas/conciliacion',
          datosAdicionales: {
            transaccionId: nuevaTx.id,
            cuotaId: nuevaTx.cuotaId,
            clienteId: nuevaTx.clienteId,
            montoOriginal: nuevaTx.montoOriginal,
            monedaOriginal: nuevaTx.monedaOriginal,
            referenciaBancaria: nuevaTx.referenciaBancaria,
          },
          esCriticoSeguridad: false,
          // RNF-004 §3: ref de origen del jobId determinista.
          referenciaId: nuevaTx.id,
        })
      )
      .catch(() => {});
  }

  return { transaccion: txDto, cuota: cuotaDto };
}
