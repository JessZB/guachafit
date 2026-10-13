import { z } from 'zod';
import {
  TipoDocumento,
  EstadoAlumno,
  Modalidad,
  PeriodicidadAntropometria,
} from '../enums';
import {
  TASA_STRING_REGEX,
  FECHA_CALENDARIO_REGEX,
  MENSAJE_ZONA_HORARIA_INVALIDA,
  MAX_CARACTERES_ZONA_HORARIA,
  esZonaHorariaIanaValida,
} from './comunes';

const zonaHorariaSchema = z
  .string({ required_error: MENSAJE_ZONA_HORARIA_INVALIDA, invalid_type_error: MENSAJE_ZONA_HORARIA_INVALIDA })
  .refine(esZonaHorariaIanaValida, MENSAJE_ZONA_HORARIA_INVALIDA);

/** LOTE API-N2: el alumno cambia su propia zona horaria (`PATCH /alumnos/me/zona-horaria`). */
export const ActualizarZonaHorariaAlumnoSchema = z.object({
  zonaHoraria: zonaHorariaSchema,
});

export const AltaManualAlumnoSchema = z.object({
  nombres: z.string().min(2).max(100),
  apellidos: z.string().min(2).max(100),
  email: z.string().email(),
  tipoDocumento: z.nativeEnum(TipoDocumento),
  numeroDocumento: z.string().min(5).max(30),
  fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida. Usa el formato año-mes-día (por ejemplo, 2026-01-31)'),
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

export const ActualizarPerfilAlumnoSchema = z.object({
  nombres: z.string().min(2).max(100).optional(),
  apellidos: z.string().min(2).max(100).optional(),
  tipoDocumento: z.nativeEnum(TipoDocumento).optional(),
  numeroDocumento: z.string().min(5).max(30).optional(),
  fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida. Usa el formato año-mes-día (por ejemplo, 2026-01-31)').optional(),
  telefonoWhatsapp: z.string().min(8).max(30).optional(),
  modalidad: z.nativeEnum(Modalidad).optional(),
  tasaFijadaOverride: z.string().regex(TASA_STRING_REGEX).optional().nullable(),
  fichaSaludPrivada: z.string().max(2000).optional().nullable(),
  /**
   * RF-003 RN-01 (precondición 2): periodicidad configurable del control antropométrico del alumno.
   * `null` la desactiva (sin calendario ni recordatorio de las 06:00). `antropometriaInicio` es el
   * ancla del calendario (YYYY-MM-DD en el día local del alumno): sin ella la periodicidad no
   * produce fechas programadas y la ventana remota de RN-04 no se aplica.
   */
  periodicidadAntropometria: z.nativeEnum(PeriodicidadAntropometria).optional().nullable(),
  antropometriaInicio: z
    .string()
    .regex(FECHA_CALENDARIO_REGEX, 'La fecha no es válida. Usa el formato año-mes-día (por ejemplo, 2026-01-31)')
    .optional()
    .nullable(),
  /** LOTE API-N2: zona horaria del alumno (IANA). Omitida = no se cambia. */
  zonaHoraria: zonaHorariaSchema.optional(),
});

/**
 * WU19: página por defecto del directorio de alumnos.
 *
 * El endpoint `GET /alumnos` entrega el directorio paginado; 100 es además el techo duro
 * aceptado por `limit` (el máximo que la UI puede pedir en un solo salto).
 */
export const LIMITE_DIRECTORIO_ALUMNOS_POR_DEFECTO = 100;

export const FiltroDirectorioAlumnosSchema = z.object({
  /**
   * WU24: término de búsqueda server-side canónico. Se resuelve con ILIKE (case-insensitive)
   * sobre nombre/apellido/correo/documento, escapando `%`, `_` y `\` para tratarlo como literal.
   */
  q: z.string().max(200, 'El término de búsqueda no puede exceder 200 caracteres').optional(),
  /**
   * Alias legado de `q` (WU19). Se mantiene aceptado para no romper consumidores previos; si
   * llegan ambos, el servicio prioriza `q`.
   */
  busqueda: z.string().max(200, 'El término de búsqueda no puede exceder 200 caracteres').optional(),
  estado: z.nativeEnum(EstadoAlumno, {
    errorMap: () => ({ message: 'El estado del alumno no es válido' }),
  }).optional(),
  modalidad: z.nativeEnum(Modalidad, {
    errorMap: () => ({ message: 'La modalidad especificada no es válida' }),
  }).optional(),
  /**
   * `true` = devuelve la cartera completa (activos + archivados); `false` (default) = solo
   * alumnos vigentes. El resumen del directorio siempre cuenta la cartera completa.
   */
  incluirArchivados: z
    .union([
      z.boolean(),
      z.enum(['true', 'false', '1', '0']).transform((val) => val === 'true' || val === '1'),
    ])
    .optional()
    .default(false),
  /**
   * WU25a: `true` = SOLO alumnos dados de baja lógica (pestaña "Archivados", RF-012 RN-05).
   * Tiene prioridad sobre `incluirArchivados`; el resumen no se altera.
   */
  soloArchivados: z
    .union([
      z.boolean(),
      z.enum(['true', 'false', '1', '0']).transform((val) => val === 'true' || val === '1'),
    ])
    .optional()
    .default(false),
  /**
   * WU25a: filtra por semáforo de pago calculado en el servidor con la MISMA regla de
   * `resumen.morosos` (`condicionCuotaEnMora`). `por_vencer` no se acepta porque el servidor
   * nunca lo produce (la hidratación por fila solo emite al_dia/moroso/sin_cuota).
   */
  semaforoPago: z.enum(['moroso', 'al_dia', 'sin_cuota']).optional(),
  limit: z
    .coerce
    .number()
    .int('El límite debe ser un número entero')
    .min(1, 'El límite debe ser al menos 1')
    .max(LIMITE_DIRECTORIO_ALUMNOS_POR_DEFECTO, 'El límite no puede exceder 100')
    .optional()
    .default(LIMITE_DIRECTORIO_ALUMNOS_POR_DEFECTO),
  offset: z
    .coerce
    .number()
    .int('La posición de inicio debe ser un número entero')
    .min(0, 'La posición de inicio no puede ser negativa')
    .optional()
    .default(0),
});

export const RestaurarAlumnoSchema = z.object({
  motivo: z.string().trim().max(500, 'El motivo no puede exceder 500 caracteres').optional(),
});
