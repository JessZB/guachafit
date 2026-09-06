import { z } from 'zod';
import {
  Rol,
  TipoDocumento,
  EstadoAlumno,
  Modalidad,
  SemaforoNutricional,
  TipoComida,
  AnguloFoto,
  Moneda,
  MetodoPago,
  PlataformaDispositivo,
  TemaUi,
} from '../enums';

// Regex para formatos universales
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DECIMAL_STRING_REGEX = /^\d+(\.\d{1,2})?$/;
export const TASA_STRING_REGEX = /^\d+(\.\d{1,4})?$/;

// =============================================================================
// IAM & ONBOARDING SCHEMAS
// =============================================================================
export const EstablecerPasswordConTokenSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(8).max(100),
});

export const AltaManualAlumnoSchema = z.object({
  nombres: z.string().min(2).max(100),
  apellidos: z.string().min(2).max(100),
  email: z.string().email(),
  tipoDocumento: z.nativeEnum(TipoDocumento),
  numeroDocumento: z.string().min(5).max(30),
  fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  telefonoWhatsapp: z.string().min(8).max(30),
  modalidad: z.nativeEnum(Modalidad),
  tasaFijadaOverride: z.string().regex(TASA_STRING_REGEX).optional(),
  fichaSaludPrivada: z.string().max(2000).optional(),
});

export const RegistroPublicoAlumnoSchema = z.object({
  coachCode: z.string().min(4).max(15),
  nombres: z.string().min(2).max(100),
  apellidos: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  tipoDocumento: z.nativeEnum(TipoDocumento),
  numeroDocumento: z.string().min(5).max(30),
  fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  telefonoWhatsapp: z.string().min(8).max(30),
  modalidad: z.nativeEnum(Modalidad),
});

export const CambioEstadoAlumnoSchema = z.object({
  nuevoEstado: z.nativeEnum(EstadoAlumno),
  motivo: z.string().max(500).optional(),
});

// =============================================================================
// ENTRENAMIENTO & NUTRICIÓN SCHEMAS
// =============================================================================
export const IniciarSesionSchema = z.object({
  timezoneCliente: z.string().min(2).max(64),
});

export const RegistrarSerieSchema = z.object({
  serieId: z.string().uuid(),
  repsLogradas: z.number().int().min(0).max(200),
  pesoKg: z.string().regex(DECIMAL_STRING_REGEX),
  rpe: z.string().regex(/^\d+(\.\d)?$/).optional(),
  completada: z.boolean(),
  timestampCompletadaUtc: z.string().datetime().optional(),
});

export const SincronizarSeriesBatchSchema = z.object({
  series: z.array(RegistrarSerieSchema).min(1),
});

export const FinalizarSesionSchema = z.object({
  notasAlumno: z.string().max(1000).optional(),
});

export const CheckinNutricionalSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  semaforo: z.nativeEnum(SemaforoNutricional),
  aguaLitros: z.string().regex(DECIMAL_STRING_REGEX).optional(),
  caloriasReportadas: z.number().int().min(0).max(15000).optional(),
  proteinaGramosReportada: z.number().int().min(0).max(1000).optional(),
  notasAlumno: z.string().max(280).optional(),
  fotosPlatos: z
    .array(
      z.object({
        tipoComida: z.nativeEnum(TipoComida),
        storageKey: z.string().min(5),
      })
    )
    .max(4)
    .optional(),
});

// =============================================================================
// ANTROPOMETRÍA SCHEMAS
// =============================================================================
export const PresignedUploadUrlSchema = z.object({
  modulo: z.enum(['antropometria', 'comidas', 'comprobantes']),
  alumnoId: z.string().uuid(),
  angulo: z.nativeEnum(AnguloFoto).optional(),
  mimeType: z.enum(['image/webp', 'image/jpeg']),
});

export const CheckinAntropometricoSchema = z.object({
  alumnoId: z.string().uuid(),
  fechaEvaluacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pesoKg: z.string().regex(DECIMAL_STRING_REGEX),
  alturaCm: z.string().regex(DECIMAL_STRING_REGEX).optional(),
  porcentajeGrasa: z.string().regex(DECIMAL_STRING_REGEX).optional(),
  perimetros: z
    .object({
      cuelloCm: z.string().regex(DECIMAL_STRING_REGEX).optional(),
      pechoCm: z.string().regex(DECIMAL_STRING_REGEX).optional(),
      cinturaCm: z.string().regex(DECIMAL_STRING_REGEX).optional(),
      caderaCm: z.string().regex(DECIMAL_STRING_REGEX).optional(),
      brazoCm: z.string().regex(DECIMAL_STRING_REGEX).optional(),
      musloCm: z.string().regex(DECIMAL_STRING_REGEX).optional(),
    })
    .optional(),
  fotos: z
    .array(
      z.object({
        angulo: z.nativeEnum(AnguloFoto),
        storageKey: z.string().min(5),
      })
    )
    .max(3)
    .optional(),
});

export const ConciliarAntropometriaSchema = z.object({
  accion: z.enum(['aprobar', 'rechazar']),
  observacionesCoach: z.string().max(1000).optional(),
  motivoRechazo: z.string().max(1000).optional(),
});

// =============================================================================
// FINANZAS & LEDGER SCHEMAS
// =============================================================================
export const ReportarPagoSchema = z.object({
  montoOriginal: z.string().regex(DECIMAL_STRING_REGEX),
  monedaOriginal: z.nativeEnum(Moneda),
  metodoPago: z.nativeEnum(MetodoPago),
  referenciaBancaria: z.string().min(4).max(64).optional(),
  fechaOperacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comprobanteStorageKey: z.string().min(5).optional(),
});

export const CobroDirectoSchema = z.object({
  montoOriginal: z.string().regex(DECIMAL_STRING_REGEX),
  monedaOriginal: z.nativeEnum(Moneda),
  metodoPago: z.nativeEnum(MetodoPago),
  fechaOperacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notas: z.string().max(500).optional(),
});

export const ConciliarTransaccionSchema = z.object({
  accion: z.enum(['aprobar', 'rechazar']),
  motivoRechazo: z.string().max(500).optional(),
});

// =============================================================================
// NOTIFICACIONES & PREFERENCIAS SCHEMAS
// =============================================================================
export const PreferenciasNotificacionSchema = z.object({
  notifyPaymentsPush: z.boolean(),
  notifyPaymentsEmail: z.boolean(),
  notifyWorkoutsPush: z.boolean(),
  notifyWorkoutsEmail: z.boolean(),
  notifyCheckinsPush: z.boolean(),
  notifyCheckinsEmail: z.boolean(),
  digestWeeklyEmail: z.boolean(),
});

export const RegistrarDispositivoSchema = z.object({
  deviceToken: z.string().min(10).max(255),
  platform: z.nativeEnum(PlataformaDispositivo),
});

export const ActualizarTemaUiSchema = z.object({
  temaUi: z.nativeEnum(TemaUi),
});
