import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CobroDirectoDTO,
  CuotaDetalleDTO,
  EstadoConciliacion,
  EstadoCuota,
  MENSAJE_FECHA_PAGO_FUTURA,
  MENSAJE_COBRO_CUOTA_ANULADA,
  MetodoPago,
  Moneda,
  TransaccionPagoDetalleDTO,
} from '@guachafit/shared';
import {
  and,
  cuotasMembresia,
  eq,
  sql,
  transaccionesPago,
} from '@guachafit/database';
import {
  addDecimals,
  assertBalanceInvariant,
  esFechaPagoFutura,
  mensajeCobroConExcedente,
  repartirAbono,
  subtractDecimals,
  toCents,
  toIsoSafe,
  MENSAJE_CUOTA_NO_ENCONTRADA,
} from './finanzas-reglas';
import {
  calcularContravalorUSDCaso,
  obtenerTasaVigenteCaso,
  proyectarVESCaso,
} from './tasas-conversion';
import { acreditarSaldoAFavorCaso } from './emision-ciclo';
import { cancelarRecordatoriosDeCuotaCaso } from './recordatorios-cuota';
import { CobroDirectoRegistradoEvent } from '../../notificaciones/events/eventos-notificacion';
import type { ContextoFinanzas } from './contexto-finanzas';

// ===========================================================================
// 6. COBRO DIRECTO EN SALA POR EL COACH (RF-007)
// ===========================================================================

export async function cobroDirectoCaso(
  ctx: ContextoFinanzas,
  cuotaId: string,
  entrenadorId: string,
  dto: CobroDirectoDTO
): Promise<{
  transaccion: TransaccionPagoDetalleDTO;
  cuota: CuotaDetalleDTO;
  mensaje: string;
}> {
  const esEfectivo =
    dto.metodoPago === MetodoPago.EFECTIVO_USD ||
    dto.metodoPago === MetodoPago.EFECTIVO_VES;

  if (!esEfectivo) {
    throw new BadRequestException(
      'El cobro en sala solo acepta efectivo (dólares o bolívares).'
    );
  }
  if (esFechaPagoFutura(dto.fechaOperacion, new Date())) {
    throw new BadRequestException(MENSAJE_FECHA_PAGO_FUTURA);
  }

  const resultado = await ctx.db.transaction(async (tx) => {
    // Bloqueo Pesimista (SELECT ... FOR UPDATE) con RLS Tenant.
    // set_config(..., true) es la forma VÁLIDA de aplicar un SET LOCAL parametrizado:
    // `SET LOCAL x = $1` no es sintaxis admitida por PostgreSQL (error 42601). Mismo patrón
    // que withTenant() en packages/database (WU7).
    //
    // RNF-003/ADR-011 (etapa 2): se conserva la transacción PROPIA (FOR UPDATE + set_config
    // manual) porque `withTenant` no anida limpio sobre `db.transaction`; es EQUIVALENTE al
    // helper (misma GUC transaccional, mismo alcance). No se duplica contexto.
    await tx.execute(
      sql`SELECT set_config('app.current_entrenador_id', ${entrenadorId}, true)`
    );
    await tx.execute(sql`SELECT id FROM cuotas_membresia WHERE id = ${cuotaId} FOR UPDATE`);

    const [cuotaLock] = await tx
      .select()
      .from(cuotasMembresia)
      .where(
        and(eq(cuotasMembresia.id, cuotaId), eq(cuotasMembresia.entrenadorId, entrenadorId))
      );

    if (!cuotaLock) {
      throw new NotFoundException(MENSAJE_CUOTA_NO_ENCONTRADA);
    }

    if (cuotaLock.estado === EstadoCuota.ANULADA) {
      throw new BadRequestException(MENSAJE_COBRO_CUOTA_ANULADA);
    }

    // Calcular contravalor USD. Un cobro en VES exige tasa real: sin ella se aborta la
    // transacción con error de negocio claro (nunca un contravalor fabricado).
    let tasaCambioFijada = '1.0000';
    let montoEquivalenteUsd = dto.montoOriginal;

    if (dto.monedaOriginal === Moneda.VES) {
      // RNF-003/ADR-011 (etapa 3): la tasa override lee el perfil (RLS) en la MISMA tx manual
      // con el GUC del coach (set_config arriba).
      const tasa = await obtenerTasaVigenteCaso(ctx, entrenadorId, cuotaLock.clienteId, tx);
      if (!tasa.tasaEfectiva || parseFloat(tasa.tasaEfectiva) <= 0) {
        throw new BadRequestException(
          'Aún no has configurado la tasa de cambio. Configura tu tasa activa en Ajustes → Tasas para cobrar en bolívares.'
        );
      }
      tasaCambioFijada = tasa.tasaEfectiva;
      montoEquivalenteUsd = calcularContravalorUSDCaso(dto.montoOriginal, tasaCambioFijada);
    }

    const nowUtc = new Date();
    // RF-006 RN-05: lo que excede el saldo de la cuota pasa al saldo a favor del alumno.
    const reparto = repartirAbono(cuotaLock.saldoPendienteUsd, montoEquivalenteUsd);

    // Transacción auto-aprobada
    const [nuevaTx] = await tx
      .insert(transaccionesPago)
      .values({
        cuotaId: cuotaLock.id,
        clienteId: cuotaLock.clienteId,
        entrenadorId,
        registradoPor: entrenadorId,
        montoOriginal: dto.montoOriginal,
        monedaOriginal: dto.monedaOriginal,
        tasaCambioFijada,
        montoEquivalenteUsd,
        excedenteUsd: reparto.excedenteUsd,
        metodoPago: dto.metodoPago,
        // El cobro en sala es siempre en efectivo, que no lleva referencia bancaria (M5-L1):
        // se descarta cualquiera que envíe el cliente y nunca se usa un centinela compartido.
        referenciaBancaria: null,
        fechaOperacion: dto.fechaOperacion,
        estadoConciliacion: EstadoConciliacion.APROBADO,
        fechaReporteUtc: nowUtc,
        fechaConciliacionUtc: nowUtc,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
      .returning();

    // Descuento inmediato: la cuota recibe solo lo que debía; el excedente va al saldo a favor.
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
      comprobanteStorageKey: null,
      estadoConciliacion: nuevaTx.estadoConciliacion,
      motivoRechazo: null,
      fechaReporteUtc: nuevaTx.fechaReporteUtc.toISOString(),
      fechaConciliacionUtc: nuevaTx.fechaConciliacionUtc?.toISOString() || null,
      createdAtUtc: nuevaTx.createdAtUtc.toISOString(),
      updatedAtUtc: nuevaTx.updatedAtUtc.toISOString(),
    };

    // Proyección informativa en Bs: solo con tasa real (sin tasa, se omite el dato).
    // RNF-003/ADR-011 (etapa 3): misma tx manual con contexto del coach.
    const tasa = await obtenerTasaVigenteCaso(ctx, entrenadorId, cuotaActualizada.clienteId, tx);
    const saldoPendienteVes = tasa.tasaEfectiva
      ? proyectarVESCaso(cuotaActualizada.saldoPendienteUsd, tasa.tasaEfectiva)
      : undefined;

    const cuotaDto: CuotaDetalleDTO = {
      id: cuotaActualizada.id,
      clienteId: cuotaActualizada.clienteId,
      entrenadorId: cuotaActualizada.entrenadorId,
      planId: cuotaActualizada.planId,
      periodo: cuotaActualizada.periodo,
      montoTotalUsd: cuotaActualizada.montoTotalUsd,
      montoAbonadoUsd: cuotaActualizada.montoAbonadoUsd,
      saldoPendienteUsd: cuotaActualizada.saldoPendienteUsd,
      saldoAFavorAplicadoUsd: cuotaActualizada.saldoAFavorAplicadoUsd,
      saldoPendienteVes,
      tasaAplicada: tasa.tasaEfectiva ?? undefined,
      fechaEmisionUtc: toIsoSafe(cuotaActualizada.fechaEmisionUtc),
      fechaCorteUtc: toIsoSafe(cuotaActualizada.fechaCorteUtc),
      estado: cuotaActualizada.estado,
      notas: cuotaActualizada.notas,
      // RF-005 §6: una cuota emitida en 0.00 es de un becado (también en el cobro directo).
      esBecado: toCents(cuotaActualizada.montoTotalUsd) === 0,
      createdAtUtc: toIsoSafe(cuotaActualizada.createdAtUtc),
      updatedAtUtc: toIsoSafe(cuotaActualizada.updatedAtUtc),
    };

    return {
      transaccion: txDto,
      cuota: cuotaDto,
      mensaje: 'Cobro directo en efectivo registrado y auto-aprobado exitosamente.',
    };
  });

  // WU-H (RF-008 / ADR-008 §3.2): un cobro directo que liquida la cuota cancela los
  // recordatorios futuros pendientes.
  if (toCents(resultado.cuota.saldoPendienteUsd) === 0) {
    await cancelarRecordatoriosDeCuotaCaso(ctx, resultado.cuota.id);
  }

  if (ctx.eventEmitter) {
    // RF-014 RN-01: aviso de dominio fire-and-forget al alumno dueño de la cuota; un fallo de
    // colas NUNCA revierte el cobro ya confirmado.
    void ctx.eventEmitter
      .emitAsync(
        CobroDirectoRegistradoEvent.NOMBRE,
        new CobroDirectoRegistradoEvent({
          tipoEvento: 'COBRO_DIRECTO_REGISTRADO',
          destinatarioUserId: resultado.transaccion.clienteId,
          entrenadorId,
          categoria: 'FINANZAS',
          titulo: 'Tu entrenador registró un cobro',
          cuerpo: mensajeCobroConExcedente(
            `Tu entrenador registró un cobro de ${resultado.transaccion.montoEquivalenteUsd} USD`,
            resultado.transaccion.montoEquivalenteUsd,
            resultado.transaccion.excedenteUsd
          ),
          linkAccion: '/app/pagos',
          datosAdicionales: {
            transaccionId: resultado.transaccion.id,
            cuotaId: resultado.cuota.id,
            montoOriginal: resultado.transaccion.montoOriginal,
            monedaOriginal: resultado.transaccion.monedaOriginal,
            montoEquivalenteUsd: resultado.transaccion.montoEquivalenteUsd,
            excedenteUsd: resultado.transaccion.excedenteUsd,
          },
          esCriticoSeguridad: false,
          // RNF-004 §3: ref de origen del jobId determinista.
          referenciaId: resultado.transaccion.id,
        })
      )
      .catch(() => {});
  }

  return resultado;
}
