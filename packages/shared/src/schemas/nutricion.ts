import { z } from 'zod';
import { TipoComida, SemaforoNutricional } from '../enums';
import {
  DECIMAL_STRING_REGEX,
  FECHA_CALENDARIO_REGEX,
  MENSAJE_FECHA_CALENDARIO,
  esFechaCalendarioReal,
  fechaCalendarioAMsUtc,
} from './comunes';
import { fechaCalendarioRealSchema } from './campos-internos';

// =============================================================================
// NUTRICIÓN SCHEMAS (Módulo 3: Check-ins Nutricionales)
// =============================================================================

/**
 * LOTE API-N1: mensaje único cuando la foto de un plato no se puede asociar al reporte (clave
 * vacía, demasiado larga, de otro módulo o de otro alumno). El API valida además que la clave sea
 * del alumno autenticado (`comidas/{alumnoId}/…`); este contrato solo acota la forma.
 */
export const MENSAJE_FOTO_COMIDA_NO_ASOCIABLE = 'No pudimos asociar la foto. Vuelve a subirla.';

export const FotoComidaInputSchema = z.object({
  tipoComida: z.nativeEnum(TipoComida),
  storageKey: z
    .string()
    .min(5, MENSAJE_FOTO_COMIDA_NO_ASOCIABLE)
    .max(255, MENSAJE_FOTO_COMIDA_NO_ASOCIABLE),
});

/** LOTE API-N1: tope razonable de agua (litros por día) para el reporte y la meta del coach. */
export const AGUA_LITROS_MAXIMO = 20;
export const MENSAJE_AGUA_LITROS = `Escribe el agua en litros, entre 0 y ${AGUA_LITROS_MAXIMO}, con hasta 2 decimales (ej. 2.5).`;

/** RF-002 RN-03: máximo de fotos de platos por reporte diario (contrato, API y web). */
export const MAX_FOTOS_PLATOS_DIA = 4;
export const MENSAJE_MAX_FOTOS_PLATOS_DIA = `Puedes subir hasta ${MAX_FOTOS_PLATOS_DIA} fotos por día.`;

/** RF-002: largo máximo de las notas del alumno en el reporte diario. */
export const MAX_CARACTERES_NOTAS_ALUMNO = 280;
export const MENSAJE_NOTAS_ALUMNO_MAXIMO = `Tus notas pueden tener hasta ${MAX_CARACTERES_NOTAS_ALUMNO} caracteres.`;

/** Litros de agua como texto decimal (hasta 2 decimales) entre 0 y `AGUA_LITROS_MAXIMO`. */
const aguaLitrosSchema = z
  .string()
  .regex(DECIMAL_STRING_REGEX, MENSAJE_AGUA_LITROS)
  .refine((valor) => Number(valor) <= AGUA_LITROS_MAXIMO, MENSAJE_AGUA_LITROS);

/**
 * RF-002 RN-02: ventana local del check-in 1-Tap (18:00–23:59, hora del alumno).
 * Fuera de esta ventana el día ya quedó cerrado: no se admite el reporte.
 */
export const HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL = 18;
export const HORA_FIN_VENTANA_CHECKIN_NUTRICIONAL = 23;
/**
 * LOTE API-N2: hora local (zona del perfil) del día SIGUIENTE a `fecha` hasta la que el servidor
 * todavía recibe un reporte capturado a tiempo (captura offline tardía). Inclusiva: 12:00:00.
 */
export const HORA_LIMITE_RECEPCION_CHECKIN_DIA_SIGUIENTE = 12;
/**
 * LOTE API-N2: máximo de `segundosDesdeCaptura` (48 h). Un reporte guardado hace más tiempo ya
 * venció de todas formas (el plazo cierra 18 h después del inicio de su ventana).
 */
export const MAX_SEGUNDOS_DESDE_CAPTURA_CHECKIN = 48 * 60 * 60;
export const MENSAJE_SEGUNDOS_DESDE_CAPTURA_INVALIDO =
  'No pudimos saber cuándo guardaste el reporte. Actualiza la pantalla e inténtalo de nuevo.';
/** RF-002 Escenario 3: margen de tolerancia (±%) de los totales reportados contra las metas. */
export const TOLERANCIA_TOTALES_NUTRICIONAL_PCT = 10.0;

export const CheckinNutricionalSchema = z.object({
  alumnoId: z.string().uuid('No encontramos ese alumno. Actualiza la pantalla e inténtalo de nuevo.').optional(),
  fecha: fechaCalendarioRealSchema,
  semaforo: z.nativeEnum(SemaforoNutricional),
  aguaLitros: aguaLitrosSchema.optional(),
  caloriasReportadas: z.number().int().min(0).max(15000).optional(),
  proteinaGramosReportada: z.number().int().min(0).max(1000).optional(),
  notasAlumno: z
    .string()
    .max(MAX_CARACTERES_NOTAS_ALUMNO, MENSAJE_NOTAS_ALUMNO_MAXIMO)
    .optional(),
  fotosPlatos: z
    .array(FotoComidaInputSchema)
    .max(MAX_FOTOS_PLATOS_DIA, MENSAJE_MAX_FOTOS_PLATOS_DIA)
    .optional(),
  /**
   * @deprecated LOTE API-N2: sin efecto. La ventana y el plazo usan la zona del perfil del alumno;
   * se acepta solo porque la web publicada lo envía y se retirará cuando deje de hacerlo.
   */
  timezoneCliente: z.string().min(2).max(64).optional(),
  /**
   * LOTE API-N2: segundos transcurridos entre el toque en Guardar y el envío, medidos por el
   * teléfono. El servidor calcula la hora de captura como SU hora de recepción menos estos
   * segundos, así un reloj del teléfono desajustado no cambia el resultado. Sin el campo, cuenta
   * la hora del servidor.
   */
  segundosDesdeCaptura: z
    .number({ invalid_type_error: MENSAJE_SEGUNDOS_DESDE_CAPTURA_INVALIDO })
    .int(MENSAJE_SEGUNDOS_DESDE_CAPTURA_INVALIDO)
    .min(0, MENSAJE_SEGUNDOS_DESDE_CAPTURA_INVALIDO)
    .max(MAX_SEGUNDOS_DESDE_CAPTURA_CHECKIN, MENSAJE_SEGUNDOS_DESDE_CAPTURA_INVALIDO)
    .optional(),
});

/**
 * RF-002 RN-01: recurso educativo adjunto a las metas del coach (PDF de lista de compras,
 * distribución de comidas, etc.).
 *
 * El recurso declara EXACTAMENTE una fuente: un enlace externo validado (`url`) o un archivo
 * subido a la bóveda (`storageKey` con el prefijo `nutricion-recursos/{alumnoId}/…`). El módulo
 * de la API valida además que la clave pertenezca al alumno dueño de las metas (RNF-001).
 */
export const MENSAJE_URL_RECURSO = 'Usa un enlace que empiece por http:// o https://.';

export const RecursoNutricionalSchema = z
  .object({
    titulo: z.string().min(2, 'El título del recurso debe tener al menos 2 caracteres').max(120),
    // LOTE API-N1: solo enlaces web; `javascript:`, `data:`, `file:`… nunca llegan a un enlace.
    url: z
      .string()
      .url(MENSAJE_URL_RECURSO)
      .max(500)
      .refine((valor) => /^https?:\/\//i.test(valor), MENSAJE_URL_RECURSO)
      .optional(),
    storageKey: z
      .string()
      .min(5, 'La clave de almacenamiento no es válida')
      .max(300)
      .regex(
        /^(antropometria|comidas|comprobantes|nutricion-recursos)\//,
        'La clave de almacenamiento no es válida'
      )
      .optional(),
  })
  .refine((valor) => (valor.url ? !valor.storageKey : !!valor.storageKey), {
    message: 'Cada recurso debe indicar una URL externa o un archivo PDF subido (y no ambos).',
  });

/**
 * RF-002 RN-01: metas nutricionales que el coach fija para UN alumno (una fila por alumno).
 *
 * Todos los objetivos son opcionales por separado (el coach puede fijar solo calorías, solo
 * macros o una pauta general con recursos), pero el cuerpo debe declarar al menos un campo.
 * Un campo omitido en el PUT se guarda como nulo (reemplazo completo de la fila).
 */
export const MetasNutricionalesSchema = z
  .object({
    caloriasObjetivo: z.number().int().min(1).max(15000).optional(),
    proteinaGramosObjetivo: z.number().int().min(1).max(1000).optional(),
    carbohidratosGramosObjetivo: z.number().int().min(1).max(1500).optional(),
    grasasGramosObjetivo: z.number().int().min(1).max(1000).optional(),
    aguaLitrosObjetivo: aguaLitrosSchema.optional(),
    recursos: z
      .array(RecursoNutricionalSchema)
      .max(10, 'No se permiten más de 10 recursos educativos por alumno')
      .optional(),
  })
  .refine(
    (valor) => Object.values(valor).some((campo) => campo !== undefined),
    'Debes definir al menos una meta nutricional o recurso educativo.'
  );

/** LOTE API-N1: rango máximo (días, inclusivo) del historial de reportes nutricionales. */
export const RANGO_MAXIMO_DIAS_CHECKINS_NUTRICIONALES = 92;
export const MENSAJE_RANGO_CHECKINS_EXCEDIDO = `Puedes consultar hasta ${RANGO_MAXIMO_DIAS_CHECKINS_NUTRICIONALES} días a la vez. Elige un rango más corto.`;
export const MENSAJE_RANGO_FECHAS_INVERTIDO =
  'La fecha de inicio no puede ser posterior a la fecha de fin.';

const MS_POR_DIA = 86_400_000;

/** Días del rango inclusivo [desde, hasta] (fechas reales AAAA-MM-DD, aritmética UTC). */
function diasDelRangoInclusivo(desde: string, hasta: string): number {
  return Math.round((fechaCalendarioAMsUtc(hasta) - fechaCalendarioAMsUtc(desde)) / MS_POR_DIA) + 1;
}

export const FiltroCheckinsNutricionalesSchema = z
  .object({
    alumnoId: z.string().uuid().optional(),
    desde: fechaCalendarioRealSchema.optional(),
    hasta: fechaCalendarioRealSchema.optional(),
    semaforo: z.nativeEnum(SemaforoNutricional).optional(),
  })
  .superRefine((filtro, ctx) => {
    if (!filtro.desde || !filtro.hasta) return;
    if (filtro.desde > filtro.hasta) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['desde'],
        message: MENSAJE_RANGO_FECHAS_INVERTIDO,
      });
      return;
    }
    if (diasDelRangoInclusivo(filtro.desde, filtro.hasta) > RANGO_MAXIMO_DIAS_CHECKINS_NUTRICIONALES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hasta'],
        message: MENSAJE_RANGO_CHECKINS_EXCEDIDO,
      });
    }
  });

/**
 * LOTE API-N1: consulta del reporte del día (`GET /nutricion/checkin/hoy`). La `fecha` opcional
 * debe existir en el calendario; sin ella el día se resuelve en la zona del alumno.
 */
export const ConsultaCheckinNutricionalHoySchema = z.object({
  fecha: fechaCalendarioRealSchema.optional(),
});
