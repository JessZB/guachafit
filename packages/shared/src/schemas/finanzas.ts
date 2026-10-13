import { z } from 'zod';
import { Moneda, MetodoPago } from '../enums';
import {
  DECIMAL_STRING_REGEX,
  TASA_STRING_REGEX,
  FECHA_CALENDARIO_REGEX,
  MENSAJE_FECHA_CALENDARIO,
  esFechaCalendarioReal,
} from './comunes';
import { fechaCalendarioRealSchema } from './campos-internos';

// =============================================================================
// FINANZAS & LEDGER SCHEMAS (Módulo 2: Finanzas & Deuda Maestra Bimonetaria)
// =============================================================================

/** WU24b: página por defecto y techo duro de `GET /finanzas/conciliacion/bandeja` (FIFO). */
export const LIMITE_BANDEJA_CONCILIACION_POR_DEFECTO = 25;
export const LIMITE_BANDEJA_CONCILIACION_MAXIMO = 100;

/**
 * WU24b: techo duro de `txLimit` en `GET /finanzas/clientes/:clienteId/historial`.
 * Sin `txLimit`/`txOffset` el endpoint devuelve TODAS las transacciones (comportamiento histórico).
 */
export const LIMITE_TRANSACCIONES_HISTORIAL_MAXIMO = 100;

export const CrearPlanMembresiaSchema = z.object({
  nombre: z.string().min(3).max(60),
  descripcion: z.string().max(1000).optional(),
  beneficios: z.array(z.string().min(1)).min(1, 'Debe incluir al menos un beneficio'),
  // RF-005 RN-01: el precio base del catálogo es un monto numérico MAYOR a 0.00 con 2 decimales.
  // El precio cero NO es una vía válida para becados: eso se expresa con un override individual
  // (RN-02/§6), no con un plan estándar de $0.
  precioBaseUsd: z
    .string()
    .regex(DECIMAL_STRING_REGEX, 'El precio base debe ser un número con hasta 2 decimales')
    .refine((val) => Number(val) > 0, 'El precio base debe ser mayor a 0.00'),
  duracionMeses: z.number().int().min(1).max(36).default(1),
  activo: z.boolean().default(true).optional(),
  entrenadorId: z.string().uuid().optional(),
});

export const ActualizarPlanMembresiaSchema = z.object({
  nombre: z.string().min(3).max(60).optional(),
  descripcion: z.string().max(1000).optional(),
  beneficios: z.array(z.string().min(1)).min(1).optional(),
  // RF-005 RN-01: si se define, el precio base del catálogo debe ser mayor a 0.00.
  precioBaseUsd: z
    .string()
    .regex(DECIMAL_STRING_REGEX, 'El precio base debe ser un número con hasta 2 decimales')
    .refine((val) => Number(val) > 0, 'El precio base debe ser mayor a 0.00')
    .optional(),
  duracionMeses: z.number().int().min(1).max(36).optional(),
  activo: z.boolean().optional(),
});

export const CrearOverridePlanSchema = z.object({
  planId: z.string().uuid(),
  clienteId: z.string().uuid(),
  /**
   * RF-005 RN-02: `null` explícito limpia el precio acordado (el alumno vuelve a heredar el
   * precio base del plan); `undefined` conserva el valor existente en el upsert.
   * El precio 0.00 es legítimo y queda reservado a becados/intercambio (RF-005 §6).
   */
  precioAcordadoUsd: z
    .string()
    .regex(DECIMAL_STRING_REGEX, 'El precio acordado debe tener hasta 2 decimales')
    .refine((val) => Number(val) >= 0, 'El precio acordado debe ser mayor o igual a 0.00')
    .nullable()
    .optional(),
  /** `null` explícito quita la tasa especial del alumno (vuelve a la tasa global, ADR-003 §3.2). */
  tasaFijadaOverride: z
    .string()
    .regex(TASA_STRING_REGEX, 'La tasa del precio especial debe tener hasta 4 decimales')
    .refine((val) => Number(val) > 0, 'La tasa del precio especial debe ser mayor a 0')
    .nullable()
    .optional(),
  beneficiosPersonalizados: z.array(z.string().min(1)).nullable().optional(),
  motivoOverride: z.string().max(500).nullable().optional(),
});

/**
 * M5-L1 (RF-005 / RF-008): asignación del plan de un alumno. Las cuotas se emiten solas a partir
 * de esta suscripción. `fechaInicio` (día local del alumno) solo se envía al asignar el primer
 * plan: fija el día de vencimiento de todos los ciclos; en un cambio de plan se omite.
 */
export const AsignarSuscripcionSchema = z.object({
  planId: z.string().uuid('Elige un plan de tu catálogo.'),
  fechaInicio: fechaCalendarioRealSchema.optional(),
});

export const ActualizarTasaCambioSchema = z.object({
  entrenadorId: z.string().uuid().optional(),
  tasaOficialBcv: z
    .string()
    .regex(TASA_STRING_REGEX, 'La tasa oficial BCV debe ser un número con hasta 4 decimales')
    .refine((val) => Number(val) > 0, 'La tasa oficial BCV debe ser mayor a 0'),
  tasaParalelo: z
    .string()
    .regex(TASA_STRING_REGEX, 'La tasa paralelo debe ser un número con hasta 4 decimales')
    .refine((val) => Number(val) > 0, 'La tasa paralelo debe ser mayor a 0')
    .optional(),
  tasaActivaEntrenador: z
    .string()
    .regex(TASA_STRING_REGEX, 'La tasa activa del entrenador debe ser un número con hasta 4 decimales')
    .refine((val) => Number(val) > 0, 'La tasa activa del entrenador debe ser mayor a 0'),
  fuente: z.string().max(50).optional().default('manual'),
});

export const CalcularConversionSchema = z.object({
  monto: z.string().regex(DECIMAL_STRING_REGEX, 'El monto debe tener hasta 2 decimales'),
  monedaOrigen: z.nativeEnum(Moneda),
  monedaDestino: z.nativeEnum(Moneda),
  clienteId: z.string().uuid().optional(),
});

export const ReportarPagoSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(128).optional(),
    cuotaId: z.string().uuid().optional(),
    montoOriginal: z
      .string()
      .regex(DECIMAL_STRING_REGEX, 'El monto original debe ser un número con hasta 2 decimales'),
    monedaOriginal: z.nativeEnum(Moneda),
    metodoPago: z.nativeEnum(MetodoPago),
    referenciaBancaria: z.string().min(4).max(64).optional(),
    fechaOperacion: z.string().regex(FECHA_CALENDARIO_REGEX, 'La fecha del pago no es válida. Usa el formato año-mes-día (por ejemplo, 2026-01-31)'),
    comprobanteStorageKey: z.string().min(5).optional(),
  })
  .superRefine((data, ctx) => {
    if (Number(data.montoOriginal) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['montoOriginal'],
        message: 'El monto original debe ser mayor a 0.00',
      });
    }

    const esEfectivo =
      data.metodoPago === MetodoPago.EFECTIVO_USD ||
      data.metodoPago === MetodoPago.EFECTIVO_VES;

    if (!esEfectivo && (!data.referenciaBancaria || data.referenciaBancaria.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referenciaBancaria'],
        message: 'La referencia bancaria es obligatoria para métodos de pago distintos de efectivo',
      });
    }
  });

export const CobroDirectoSchema = z
  .object({
    cuotaId: z.string().uuid().optional(),
    clienteId: z.string().uuid().optional(),
    montoOriginal: z
      .string()
      .regex(DECIMAL_STRING_REGEX, 'El monto original debe ser un número con hasta 2 decimales')
      .refine((val) => Number(val) > 0, 'El monto original debe ser mayor a 0.00')
      .refine((val) => Number(val) <= 100000, 'El monto original no puede exceder 100,000.00'),
    monedaOriginal: z.nativeEnum(Moneda, {
      errorMap: () => ({ message: 'La moneda original debe ser válida (USD o VES)' }),
    }),
    metodoPago: z.nativeEnum(MetodoPago, {
      errorMap: () => ({ message: 'El método de pago no es válido' }),
    }).default(MetodoPago.EFECTIVO_USD),
    fechaOperacion: z.string().regex(FECHA_CALENDARIO_REGEX, 'La fecha del pago no es válida. Usa el formato año-mes-día (por ejemplo, 2026-01-31)'),
    referenciaBancaria: z.string().max(64).optional(),
    notas: z.string().max(500).optional(),
  });

export const CobroDirectoInteligenteSchema = z.object({
  montoOriginal: z
    .string({ required_error: 'El monto original es obligatorio' })
    .regex(DECIMAL_STRING_REGEX, 'El monto original debe ser un número con hasta 2 decimales')
    .refine((val) => Number(val) > 0, 'El monto original debe ser mayor a 0.00')
    .refine((val) => Number(val) <= 100000, 'El monto original no puede exceder 100,000.00'),
  monedaOriginal: z.nativeEnum(Moneda, {
    errorMap: () => ({ message: 'La moneda original debe ser válida (USD o VES)' }),
  }),
  metodoPago: z.nativeEnum(MetodoPago, {
    errorMap: () => ({ message: 'El método de pago no es válido' }),
  }).default(MetodoPago.EFECTIVO_USD),
  fechaOperacion: z
    .string()
    .regex(FECHA_CALENDARIO_REGEX, 'La fecha del pago no es válida. Usa el formato año-mes-día (por ejemplo, 2026-01-31)')
    // Sin fecha, la API usa el día LOCAL del alumno (el día UTC desplazaría la tarde al día siguiente).
    .optional(),
  referenciaBancaria: z.string().max(64, 'La referencia bancaria no puede exceder 64 caracteres').optional(),
  notas: z.string().max(500, 'Las notas no pueden exceder 500 caracteres').optional(),
});

export const ConciliarTransaccionSchema = z
  .object({
    accion: z.enum(['aprobar', 'rechazar']),
    motivoRechazo: z.string().min(5, 'Debe especificar un motivo de rechazo descriptivo').max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.accion === 'rechazar' && (!data.motivoRechazo || data.motivoRechazo.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['motivoRechazo'],
        message: 'El motivo de rechazo es obligatorio al rechazar una transacción',
      });
    }
  });

/** RF-007/RF-009: un pago (cobro en sala o reporte del alumno) no puede tener fecha futura. */
export const MENSAJE_FECHA_PAGO_FUTURA = 'La fecha del pago no puede ser posterior a hoy.';

/** RF-007: reversión de un pago aprobado por error (solo el entrenador dueño, con motivo). */
export const MENSAJE_MOTIVO_REVERSION_OBLIGATORIO = 'Escribe el motivo de la reversión.';
export const MENSAJE_REVERSION_SOLO_APROBADOS = 'Solo se puede revertir un pago aprobado.';
export const MENSAJE_REVERSION_SALDO_USADO =
  'No se puede revertir este pago: el saldo a favor que generó ya se aplicó a otra cuota.';

export const RevertirPagoSchema = z.object({
  motivo: z.string().trim().min(1, MENSAJE_MOTIVO_REVERSION_OBLIGATORIO).max(500),
});

/** RF-008: anulación de una cuota sin pagos (solo el entrenador dueño, con motivo). */
export const MENSAJE_MOTIVO_ANULACION_OBLIGATORIO = 'Escribe el motivo de la anulación.';
export const MENSAJE_ANULACION_PAGO_EN_REVISION =
  'Primero aprueba o rechaza el pago en revisión de esta cuota.';
export const MENSAJE_ANULACION_CON_PAGOS_APROBADOS =
  'No se puede anular una cuota con pagos aprobados.';
export const MENSAJE_CUOTA_YA_ANULADA = 'Esta cuota ya está anulada.';
export const MENSAJE_CONCILIACION_CUOTA_ANULADA =
  'No se puede conciliar un pago de una cuota anulada.';
export const MENSAJE_REPORTE_CUOTA_ANULADA = 'No se pueden reportar pagos sobre una cuota anulada.';
export const MENSAJE_COBRO_CUOTA_ANULADA = 'La cuota se encuentra anulada.';
export const MENSAJE_REVERSION_CUOTA_ANULADA = 'No se puede revertir un pago de una cuota anulada.';

export const AnularCuotaSchema = z.object({
  motivo: z
    .string({ required_error: MENSAJE_MOTIVO_ANULACION_OBLIGATORIO })
    .trim()
    .min(1, MENSAJE_MOTIVO_ANULACION_OBLIGATORIO)
    .max(500),
});
