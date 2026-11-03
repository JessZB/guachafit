import { z } from 'zod';
import {
  CrearPlanMembresiaSchema,
  ActualizarPlanMembresiaSchema,
  CrearOverridePlanSchema,
  ActualizarTasaCambioSchema,
  CalcularConversionSchema,
  ReportarPagoSchema,
  CobroDirectoSchema,
  CobroDirectoInteligenteSchema,
  ConciliarTransaccionSchema,
  RevertirPagoSchema,
  AnularCuotaSchema,
  AsignarSuscripcionSchema,
} from '../schemas';
import {
  EstadoCuota,
  Moneda,
  MetodoPago,
  EstadoConciliacion,
} from '../enums';
import type { PaginadoDTO } from './comunes';

// Finanzas & Deuda Maestra Bimonetaria DTOs (Módulo 2)
export type CrearPlanMembresiaDTO = z.infer<typeof CrearPlanMembresiaSchema>;
export type ActualizarPlanMembresiaDTO = z.infer<typeof ActualizarPlanMembresiaSchema>;
export type CrearOverridePlanDTO = z.infer<typeof CrearOverridePlanSchema>;
export type ActualizarTasaCambioDTO = z.infer<typeof ActualizarTasaCambioSchema>;
export type CalcularConversionDTO = z.infer<typeof CalcularConversionSchema>;
export type ReportarPagoDTO = z.infer<typeof ReportarPagoSchema>;
export type CobroDirectoDTO = z.infer<typeof CobroDirectoSchema>;
export type CobroDirectoInteligenteDTO = z.infer<typeof CobroDirectoInteligenteSchema>;
export type ConciliarTransaccionDTO = z.infer<typeof ConciliarTransaccionSchema>;
export type RevertirPagoDTO = z.infer<typeof RevertirPagoSchema>;
export type AnularCuotaDTO = z.infer<typeof AnularCuotaSchema>;
export type AsignarSuscripcionDTO = z.infer<typeof AsignarSuscripcionSchema>;

export interface ResumenFinancieroAlumnoDTO {
  alumnoId: string;
  usuarioId: string;
  saldoPendienteTotalUsd: string;
  /** RF-006 RN-05: saldo a favor del alumno (USD); se aplica solo a la próxima cuota. */
  saldoAFavorUsd: string;
  totalPagadoHistoricoUsd: string;
  totalPagadoMesActualUsd: string;
  cuotaMesActual?: {
    id: string;
    periodo: string;
    montoTotalUsd: string;
    montoPagadoUsd: string;
    saldoPendienteUsd: string;
    /** RF-006 RN-05: parte de la cuota cubierta con el saldo a favor al emitirse. */
    saldoAFavorAplicadoUsd?: string;
    estado: string;
    fechaVencimiento: string;
    /** RF-008: solo en cuotas anuladas (aquí siempre `null`: la cuota del mes nunca es anulada). */
    motivoAnulacion?: string | null;
    fechaAnulacionUtc?: string | null;
  } | null;
  /**
   * WU24b: COUNT real de transacciones del alumno (independiente del slice paginado).
   * SIEMPRE presente, también cuando no se envían `txLimit`/`txOffset`.
   */
  transaccionesTotal: number;
  /**
   * WU24b: sin `txLimit`/`txOffset` devuelve TODAS las transacciones (comportamiento histórico);
   * con ellos, el slice paginado en SQL (los agregados del resumen siguen siendo del total).
   */
  transacciones: Array<{
    id: string;
    cuotaId: string;
    montoUsd: string;
    montoBs?: string;
    metodoPago: string;
    referencia?: string;
    estado: string;
    /** RF-007: motivo de la reversión; `null` si el pago no fue revertido. */
    motivoReversion?: string | null;
    /** RF-007: motivo escrito por el entrenador al rechazar el pago; `null` si no fue rechazado. */
    motivoRechazo?: string | null;
    createdAtUtc: string;
  }>;
}

// =============================================================================
// RESPUESTAS TIPADAS - FINANZAS, COBRANZA & CONCILIACIÓN (MÓDULO 2)
// =============================================================================

export interface PlanMembresiaDetalleDTO {
  id: string;
  entrenadorId: string;
  nombre: string;
  descripcion?: string | null;
  beneficios: string[];
  precioBaseUsd: string;
  duracionMeses: number;
  activo: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface OverridePlanDetalleDTO {
  id: string;
  planId: string;
  clienteId: string;
  precioAcordadoUsd?: string | null;
  tasaFijadaOverride?: string | null;
  beneficiosPersonalizados?: string[] | null;
  motivoOverride?: string | null;
  /** RF-005: nombre del plan del catálogo (hidratado para la UI; nunca un nombre inventado). */
  planNombre?: string | null;
  /** RF-005: precio base del plan, útil para comparar contra el precio acordado. */
  planPrecioBaseUsd?: string | null;
  /** RF-005: nombre humano del alumno titular del override. */
  clienteNombre?: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
}

/** Resultado honesto de `DELETE /finanzas/planes/override/:id` (RF-005 RN-02). */
export interface EliminarOverridePlanResultadoDTO {
  id: string;
  eliminado: boolean;
  mensaje: string;
}

/**
 * M5-L1 (RF-005 / RF-008): plan asignado a un alumno y su ciclo de cobro. Las fechas son días
 * locales del alumno (`YYYY-MM-DD`): `fechaInicio` fija el día de vencimiento y `proximoCorte`
 * es el vencimiento de la próxima cuota que se emitirá sola. `cuotaEmitidaId` solo viene en la
 * respuesta de la asignación que emitió una cuota.
 */
export interface SuscripcionAlumnoDTO {
  clienteId: string;
  planId: string;
  planNombre: string;
  duracionMeses: number;
  fechaInicio: string;
  proximoCorte: string;
  cuotaEmitidaId: string | null;
}

export interface TransaccionPagoDetalleDTO {
  id: string;
  cuotaId: string;
  clienteId: string;
  entrenadorId: string;
  registradoPor: string;
  montoOriginal: string;
  monedaOriginal: Moneda;
  tasaCambioFijada: string;
  montoEquivalenteUsd: string;
  /** RF-006 RN-05: parte del pago aprobado que pasó al saldo a favor del alumno. */
  excedenteUsd: string;
  /**
   * Solo en la bandeja de conciliación: saldo actual de la cuota del pago, para avisar antes de
   * aprobar si el pago la excede (el excedente quedará como saldo a favor).
   */
  saldoPendienteCuotaUsd?: string;
  metodoPago: MetodoPago;
  referenciaBancaria?: string | null;
  fechaOperacion: string; // Formato YYYY-MM-DD
  comprobanteStorageKey?: string | null;
  comprobanteUrl?: string | null;
  estadoConciliacion: EstadoConciliacion;
  motivoRechazo?: string | null;
  /** RF-007: motivo y fecha de la reversión de un pago aprobado por error. */
  motivoReversion?: string | null;
  fechaReversionUtc?: string | null;
  fechaReporteUtc: string;
  fechaConciliacionUtc?: string | null;
  clienteNombre?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

/**
 * WU24b: respuesta paginada de `GET /finanzas/conciliacion/bandeja`.
 * `total` es el COUNT real de transacciones PENDIENTES del entrenador (no el tamaño de la página)
 * y el orden FIFO por `fechaReporteUtc` se mantiene con desempate estable por `id`.
 */
export type BandejaConciliacionDTO = PaginadoDTO<TransaccionPagoDetalleDTO>;

export interface CuotaDetalleDTO {
  id: string;
  clienteId: string;
  entrenadorId: string;
  planId: string;
  periodo: string; // Formato YYYY-MM
  montoTotalUsd: string;
  montoAbonadoUsd: string;
  saldoPendienteUsd: string;
  /** RF-006 RN-05: parte de `montoAbonadoUsd` que salió del saldo a favor al emitirse. */
  saldoAFavorAplicadoUsd: string;
  saldoPendienteVes?: string;
  tasaAplicada?: string;
  fechaEmisionUtc: string;
  fechaCorteUtc: string;
  estado: EstadoCuota;
  notas?: string | null;
  /**
   * RF-005 §6: cuota de un alumno becado / acuerdo de intercambio. Se emite con
   * `montoTotalUsd = 0.00` desde un override de precio 0 y queda saldada en el acto
   * (`estado = al_dia`), sin recordatorios de cobro.
   */
  esBecado?: boolean;
  /** RF-008: motivo, fecha (ISO) y autor de la anulación; `null` si la cuota no está anulada. */
  motivoAnulacion?: string | null;
  fechaAnulacionUtc?: string | null;
  anuladaPor?: string | null;
  planNombre?: string;
  clienteNombre?: string;
  transacciones?: TransaccionPagoDetalleDTO[];
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface CalculoConversionDTO {
  montoOriginal: string;
  monedaOriginal: Moneda;
  montoConvertido: string;
  monedaConvertida: Moneda;
  tasaAplicada: string;
  fuenteTasa:
    | 'oficial_bcv'
    | 'paralelo'
    | 'entrenador_activa'
    | 'override_cliente'
    | 'sin_configurar';
  esTasaOverride: boolean;
  fechaCalculoUtc: string;
}

export interface TasaCambioVigenteDTO {
  id?: string;
  entrenadorId: string;
  /**
   * Tasa BCV de referencia. `null` cuando el entrenador no ha configurado ninguna tasa:
   * el vacío es un dato y la UI debe mostrar un estado honesto, nunca un valor inventado.
   */
  tasaOficialBcv: string | null;
  tasaParalelo?: string | null;
  /** Tasa activa del entrenador. `null` cuando no existe configuración de tasa. */
  tasaActivaEntrenador: string | null;
  tasaAcordadaCliente?: string | null;
  /**
   * Tasa efectiva aplicable (override del cliente > tasa activa). `null` cuando no hay
   * ninguna tasa utilizable; los consumidores deben omitir proyecciones o pedir configurarla.
   */
  tasaEfectiva: string | null;
  /** `'sin_configurar'` cuando no existe tasa vigente (nunca se reporta una fuente ficticia). */
  fuente: string;
  /** Fecha de la última actualización real. `null` cuando no hay tasa configurada. */
  fechaActualizacionUtc: string | null;
}
