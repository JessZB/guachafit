import { z } from 'zod';
import {
  Rol,
  TipoDocumento,
  EstadoAlumno,
  Modalidad,
  EstadoSesion,
  SemaforoNutricional,
  TipoComida,
  AnguloFoto,
  EstadoCuota,
  Moneda,
  MetodoPago,
  EstadoConciliacion,
  PlataformaDispositivo,
  TemaUi,
  SemaforoAdherencia,
  TipoCierreSesion,
  NivelObjetivoPlantilla,
  ModoAsignacionPlantilla,
  PeriodicidadAntropometria,
  EstadoLicencia,
} from '../enums';

// Regex para formatos universales
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DECIMAL_STRING_REGEX = /^\d+(\.\d{1,2})?$/;
export const TASA_STRING_REGEX = /^\d+(\.\d{1,4})?$/;
export const PERIODO_MES_REGEX = /^\d{4}-\d{2}$/;
export const FECHA_CALENDARIO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
/**
 * WU-E (RF-011 RN-06): formato compartido del `coach_code` de captación.
 * Se usa al crear entrenadores y al resolver códigos públicos de deep link.
 */
export const COACH_CODE_REGEX = /^[A-Za-z0-9_-]{4,15}$/;

// =============================================================================
// IAM & ONBOARDING SCHEMAS
// =============================================================================
export const LoginUsuarioSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(10),
});

export const CrearEntrenadorSchema = z.object({
  nombres: z.string().min(2).max(100),
  apellidos: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100).optional(),
  nombreComercial: z.string().min(2).max(150).optional(),
  coachCode: z.string().min(4).max(15).regex(/^[A-Za-z0-9_-]+$/, 'El coachCode debe ser alfanumérico'),
  capacidadMaxima: z.number().int().min(1).default(50),
  tasaCambioGlobal: z.string().regex(TASA_STRING_REGEX).default('65.0000'),
  telefonoContacto: z.string().min(8).max(30),
});

export const EstablecerPasswordConTokenSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(8).max(100),
});

/**
 * RF-010 RN-01 (WU Admin): página por defecto y techo duro del listado de entrenadores del panel
 * maestro (`GET /auth/entrenadores`). Mismo envelope paginado que el resto de listados del repo.
 */
export const LIMITE_ENTRENADORES_ADMIN_POR_DEFECTO = 25;
export const LIMITE_ENTRENADORES_ADMIN_MAXIMO = 100;

/** RF-010 RN-01: paginación estándar del listado de entrenadores del Superadmin. */
export const ListarEntrenadoresAdminQuerySchema = z.object({
  limit: z
    .coerce
    .number()
    .int('El límite debe ser un número entero')
    .min(1, 'El límite debe ser al menos 1')
    .max(
      LIMITE_ENTRENADORES_ADMIN_MAXIMO,
      `El límite no puede exceder ${LIMITE_ENTRENADORES_ADMIN_MAXIMO}`
    )
    .optional()
    .default(LIMITE_ENTRENADORES_ADMIN_POR_DEFECTO),
  offset: z
    .coerce
    .number()
    .int('El offset debe ser un número entero')
    .min(0, 'El offset debe ser mayor o igual a 0')
    .optional()
    .default(0),
});

/**
 * RF-010 RN-01 / §6: habilitar o deshabilitar la CUENTA de un entrenador.
 * Idempotente: repetir el mismo estado no escribe y devuelve `cambioAplicado: false`.
 */
export const CambiarEstadoEntrenadorSchema = z.object({
  activo: z.boolean({
    required_error: 'El estado `activo` es obligatorio.',
    invalid_type_error: 'El estado `activo` debe ser booleano.',
  }),
});

/** RF-010 RN-01: activar o suspender la LICENCIA de un entrenador (idempotente). */
export const CambiarLicenciaEntrenadorSchema = z.object({
  estadoLicencia: z.nativeEnum(EstadoLicencia, {
    errorMap: () => ({ message: 'La licencia debe ser `activa` o `suspendida_superadmin`.' }),
  }),
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

export const ActualizarPerfilAlumnoSchema = z.object({
  nombres: z.string().min(2).max(100).optional(),
  apellidos: z.string().min(2).max(100).optional(),
  tipoDocumento: z.nativeEnum(TipoDocumento).optional(),
  numeroDocumento: z.string().min(5).max(30).optional(),
  fechaNacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD').optional(),
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
    .regex(FECHA_CALENDARIO_REGEX, 'El formato de fecha debe ser YYYY-MM-DD')
    .optional()
    .nullable(),
});

/**
 * WU19: página por defecto del directorio de alumnos.
 *
 * El endpoint `GET /alumnos` entrega el directorio paginado; 100 es además el techo duro
 * aceptado por `limit` (el máximo que la UI puede pedir en un solo salto).
 */
export const LIMITE_DIRECTORIO_ALUMNOS_POR_DEFECTO = 100;

/** WU24: página por defecto y techo duro de `GET /sesiones/alumno/:alumnoId/historial`. */
export const LIMITE_HISTORIAL_SESIONES_POR_DEFECTO = 30;
export const LIMITE_HISTORIAL_SESIONES_MAXIMO = 100;

/** WU24: página por defecto y techo duro de `GET /entrenador/monitor-adherencia`. */
export const LIMITE_MONITOR_ADHERENCIA_POR_DEFECTO = 25;
export const LIMITE_MONITOR_ADHERENCIA_MAXIMO = 100;

/**
 * WU25a: semáforo de adherencia aceptado como filtro server-side del monitor.
 *
 * Los valores son los de los chips de la UI (más `sinPendientes`, el 0/0 neutral de D6) y su
 * semántica es EXACTAMENTE la de `resumen`: `rojo` excluye a los alumnos con plan pero sin
 * bloques vencidos todavía.
 */
export const SemaforoFiltroMonitorSchema = z.enum([
  'rojo',
  'amarillo',
  'verde',
  'sinPlan',
  'sinPendientes',
]);

/**
 * WU25a: filtros server-side del monitor de adherencia, aplicados ANTES del slice de página.
 *
 * - `q`: búsqueda por nombre completo, case/acento-insensible y tratada como texto literal.
 * - `semaforo`: recorta la lista al estado elegido (el `resumen` sigue siendo de la cartera
 *   completa).
 * - `orden`: `riesgo` (default, ROJO primero) o `nombre` A–Z. El orden se aplica antes del
 *   slice para que la paginación sea coherente entre páginas.
 */
export const FiltroMonitorAdherenciaSchema = z.object({
  q: z.string().max(200, 'El término de búsqueda no puede exceder 200 caracteres').optional(),
  semaforo: SemaforoFiltroMonitorSchema.optional(),
  orden: z.enum(['riesgo', 'nombre']).optional(),
});

/** WU24b: página por defecto y techo duro de `GET /finanzas/conciliacion/bandeja` (FIFO). */
export const LIMITE_BANDEJA_CONCILIACION_POR_DEFECTO = 25;
export const LIMITE_BANDEJA_CONCILIACION_MAXIMO = 100;

/**
 * WU24b: techo duro de `txLimit` en `GET /finanzas/clientes/:clienteId/historial`.
 * Sin `txLimit`/`txOffset` el endpoint devuelve TODAS las transacciones (comportamiento histórico).
 */
export const LIMITE_TRANSACCIONES_HISTORIAL_MAXIMO = 100;

/**
 * WU-I (RF-009 §4.B): pestañas del tablero de control de cartera del coach.
 *
 * - `mora`: cuotas con corte superado y saldo > 0 (excluye pagos en revisión).
 * - `por_vencer`: cuotas con corte en los próximos ≤ 5 días y saldo > 0.
 * - `revision`: comprobantes reportados esperando conciliación.
 * - `al_dia`: cuotas del ciclo en curso cubiertas al 100%.
 */
export const PestanaCarteraSchema = z.enum(['mora', 'por_vencer', 'revision', 'al_dia']);

/** WU-I: página por defecto y techo duro de `GET /finanzas/cartera`. */
export const LIMITE_CARTERA_POR_DEFECTO = 25;
export const LIMITE_CARTERA_MAXIMO = 100;

/**
 * WU-I (RF-009): filtros server-side del tablero de cartera.
 *
 * `q` busca por nombre/apellido del alumno (case-insensitive, texto literal) y `pestana`
 * selecciona la lista; el `resumen` (KPIs + contadores) siempre describe la cartera completa.
 */
export const FiltroCarteraSchema = z.object({
  q: z.string().max(200, 'El término de búsqueda no puede exceder 200 caracteres').optional(),
  pestana: PestanaCarteraSchema.optional().default('mora'),
  limit: z
    .coerce
    .number()
    .int('El límite debe ser un número entero')
    .min(1, 'El límite debe ser al menos 1')
    .max(LIMITE_CARTERA_MAXIMO, 'El límite no puede exceder 100')
    .optional()
    .default(LIMITE_CARTERA_POR_DEFECTO),
  offset: z
    .coerce
    .number()
    .int('El offset debe ser un número entero')
    .min(0, 'El offset debe ser mayor o igual a 0')
    .optional()
    .default(0),
});

/** WU24b: página por defecto y techo duro de `GET /antropometria/pendientes` (cola del coach). */
export const LIMITE_COLA_ANTROPOMETRIA_POR_DEFECTO = 25;
export const LIMITE_COLA_ANTROPOMETRIA_MAXIMO = 100;

/**
 * WU24b: página por defecto y techo duro del slice opt-in de `GET /antropometria/evolucion/:alumnoId`.
 * La serie completa (sin `controlesLimit`/`controlesOffset`) sigue siendo el default para los charts.
 */
export const LIMITE_CONTROLES_EVOLUCION_POR_DEFECTO = 25;
export const LIMITE_CONTROLES_EVOLUCION_MAXIMO = 100;

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
    .int('El offset debe ser un número entero')
    .min(0, 'El offset debe ser mayor o igual a 0')
    .optional()
    .default(0),
});

export const RestaurarAlumnoSchema = z.object({
  motivo: z.string().trim().max(500, 'El motivo no puede exceder 500 caracteres').optional(),
});

// =============================================================================
// ENTRENAMIENTO & NUTRICIÓN SCHEMAS (Módulo 3: Sesiones de Entrenamiento & Check-ins Nutricionales)
// =============================================================================

export const CrearEjercicioCatalogoSchema = z.object({
  entrenadorId: z.string().uuid('El ID de entrenador debe ser un UUID válido').optional(),
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(120, 'El nombre no puede exceder 120 caracteres'),
  grupoMuscular: z.string().min(2, 'El grupo muscular debe tener al menos 2 caracteres').max(60, 'El grupo muscular no puede exceder 60 caracteres'),
  patronMovimiento: z.string().max(60, 'El patrón de movimiento no puede exceder 60 caracteres').optional(),
  videoUrl: z.string().url('Debe ser una URL válida').max(1000, 'La URL no puede exceder 1000 caracteres').optional(),
});

export const ActualizarEjercicioCatalogoSchema = z.object({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(120).optional(),
  grupoMuscular: z.string().min(2).max(60).optional(),
  patronMovimiento: z.string().max(60).optional(),
  videoUrl: z.string().url('Debe ser una URL válida').max(1000).optional().nullable(),
  activo: z.boolean().optional(),
});

export const SeriePrescritaInputSchema = z.object({
  numeroSerie: z.number().int().min(1).optional(),
  repsObjetivo: z.number().int().min(1, 'Las repeticiones objetivo deben ser al menos 1').max(200),
  /**
   * Peso prescrito por el coach (se persiste en `peso_prescrito_kg`).
   * `pesoSugeridoKg` se mantiene como alias legacy retrocompatible.
   */
  pesoPrescritoKg: z.string().regex(DECIMAL_STRING_REGEX, 'El peso prescrito debe tener formato decimal (ej. 50.00)').optional(),
  pesoSugeridoKg: z.string().regex(DECIMAL_STRING_REGEX, 'El peso sugerido debe tener formato decimal (ej. 50.00)').optional(),
  rpeObjetivo: z.string().regex(/^\d+(\.\d)?$/, 'El RPE objetivo debe tener formato decimal (ej. 8 o 8.5)').optional(),
});

export const EjercicioPrescritoInputSchema = z.object({
  ejercicioId: z.string().uuid('El ID del ejercicio debe ser un UUID válido'),
  orden: z.number().int().min(1).default(1),
  notasCoach: z.string().max(1000, 'Las notas no pueden exceder 1000 caracteres').optional(),
  descansoSegundos: z.number().int().min(5).max(1800).optional().default(90),
  series: z.array(SeriePrescritaInputSchema).min(1, 'Debe incluir al menos una serie prescrita'),
});

export const CrearSesionEntrenamientoSchema = z.object({
  alumnoId: z.string().uuid('El ID del alumno debe ser un UUID válido'),
  rutinaId: z.string().uuid('El ID de la rutina debe ser un UUID válido').optional(),
  fechaProgramada: z.string().regex(FECHA_CALENDARIO_REGEX, 'El formato de fecha debe ser YYYY-MM-DD'),
  timezoneCliente: z.string().min(2).max(64).default('America/Caracas'),
  ejercicios: z.array(EjercicioPrescritoInputSchema).min(1, 'Debe incluir al menos un ejercicio en la sesión'),
});

export const BloqueDiaRutinaSchema = z.object({
  diaId: z.string().min(1),
  titulo: z.string().min(2, 'El título debe tener al menos 2 caracteres').max(120),
  enfoque: z.string().max(200).optional(),
  diaSugerido: z.number().int().min(1).max(7).optional(),
  ejercicios: z
    .array(
      z.object({
        id: z.string().optional(),
        ejercicioId: z.string().uuid().optional(),
        nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(120),
        series: z.number().int().min(1).max(50),
        reps: z.string().min(1).max(30),
        /**
         * Carga prescrita como texto libre (ej. '60 kg', '60.5', 'Corporal').
         * Vacío es válido (prescripción cualitativa): la API persiste `peso_prescrito_kg = null`
         * y conserva el texto en notas, sin materializar '0.00'.
         */
        peso: z.string().max(30, 'La carga prescrita no puede exceder 30 caracteres').optional().default(''),
        rpe: z.string().max(10).optional(),
        descansoSegundos: z.number().int().min(5).max(1800).optional(),
        /** RF-017 RN-01: notas técnicas del coach para el ejercicio (aditivo, opcional). */
        notas: z.string().max(500, 'Las notas técnicas no pueden exceder 500 caracteres').optional(),
      })
    )
    .min(1, 'Cada día debe tener al menos un ejercicio'),
});

export const GuardarRutinaSemanalSchema = z.object({
  alumnoId: z.string().uuid('El ID del alumno debe ser un UUID válido'),
  nombreRutina: z.string().max(120).optional(),
  bloques: z
    .array(BloqueDiaRutinaSchema)
    .min(1, 'Debe definir al menos un bloque de día de entrenamiento')
    .max(7, 'Una planificación semanal no puede exceder 7 bloques de entrenamiento'),
});

// =============================================================================
// RF-017: BANCO DE PLANTILLAS DE RUTINA Y PRESCRIPCIÓN REUTILIZABLE
// =============================================================================

/**
 * RF-017 RN-01: plantilla reutilizable del coach. Reutiliza BloqueDiaRutinaSchema
 * para la estructura de días/ejercicios (series, reps, peso prescrito, RPE, notas).
 */
export const CrearPlantillaRutinaSchema = z.object({
  nombre: z
    .string()
    .min(3, 'El nombre de la plantilla debe tener al menos 3 caracteres')
    .max(120, 'El nombre de la plantilla no puede exceder 120 caracteres'),
  nivelObjetivo: z.nativeEnum(NivelObjetivoPlantilla, {
    errorMap: () => ({
      message: 'El nivel objetivo no es válido (principiante, intermedio, avanzado)',
    }),
  }),
  bloques: z
    .array(BloqueDiaRutinaSchema)
    .min(1, 'La plantilla debe definir al menos un bloque de día de entrenamiento')
    .max(7, 'Una plantilla no puede exceder 7 bloques de entrenamiento'),
  activa: z.boolean().optional(),
});

export const ActualizarPlantillaRutinaSchema = z.object({
  nombre: z.string().min(3, 'El nombre de la plantilla debe tener al menos 3 caracteres').max(120).optional(),
  nivelObjetivo: z.nativeEnum(NivelObjetivoPlantilla).optional(),
  bloques: z
    .array(BloqueDiaRutinaSchema)
    .min(1, 'La plantilla debe definir al menos un bloque de día de entrenamiento')
    .max(7, 'Una plantilla no puede exceder 7 bloques de entrenamiento')
    .optional(),
  activa: z.boolean().optional(),
});

/**
 * RF-017 Escenario 2: ajuste puntual de cargas/series/reps antes de confirmar la
 * asignación. Se localiza por `diaId` + (`ejercicioId` o `nombre` del ejercicio).
 */
export const AjusteEjercicioPlantillaSchema = z
  .object({
    diaId: z.string().min(1, 'El día del ajuste es obligatorio'),
    ejercicioId: z.string().uuid('El ID del ejercicio debe ser un UUID válido').optional(),
    nombre: z.string().min(2).max(120, 'El nombre del ejercicio no puede exceder 120 caracteres').optional(),
    pesoPrescritoKg: z
      .string()
      .regex(DECIMAL_STRING_REGEX, 'El peso prescrito debe tener formato decimal (ej. 60.00)')
      .optional(),
    series: z.number().int().min(1).max(50).optional(),
    reps: z.string().min(1).max(30).optional(),
    rpe: z.string().regex(/^\d+(\.\d)?$/, 'El RPE debe tener formato decimal (ej. 8 o 8.5)').optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.ejercicioId && !data.nombre) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ejercicioId'],
        message: 'El ajuste debe indicar ejercicioId o el nombre del ejercicio',
      });
    }
    const sinCambios =
      data.pesoPrescritoKg === undefined &&
      data.series === undefined &&
      data.reps === undefined &&
      data.rpe === undefined;
    if (sinCambios) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['series'],
        message: 'El ajuste debe modificar al menos pesoPrescritoKg, series, reps o rpe',
      });
    }
  });

/**
 * RF-017 RN-03: asignación (individual o masiva) de una plantilla a uno o más alumnos.
 * `ajustes` aplica overrides de carga/series/reps antes de confirmar la prescripción.
 */
export const AsignarPlantillaSchema = z.object({
  alumnoIds: z
    .array(z.string().uuid('Cada ID de alumno debe ser un UUID válido'))
    .min(1, 'Debe indicar al menos un alumno')
    .max(50, 'No se pueden asignar más de 50 alumnos en una sola solicitud'),
  modo: z.nativeEnum(ModoAsignacionPlantilla, {
    errorMap: () => ({ message: 'El modo de asignación debe ser REEMPLAZAR o FUSIONAR' }),
  }),
  ajustes: z
    .array(AjusteEjercicioPlantillaSchema)
    .max(100, 'No se pueden aplicar más de 100 ajustes por asignación')
    .optional(),
});

export const IniciarSesionSchema = z.object({
  timezoneCliente: z.string().min(2).max(64),
  fechaInicioUtc: z.string().datetime({ message: 'La fecha de inicio debe ser un timestamp ISO 8601 UTC válido' }).optional(),
});

export const RegistrarSerieSchema = z
  .object({
    serieId: z.string().uuid('El ID de la serie debe ser un UUID válido'),
    repsLogradas: z.number().int().min(0).max(200),
    pesoKg: z
      .string()
      .regex(DECIMAL_STRING_REGEX, 'El peso en kg debe tener formato decimal con hasta 2 decimales')
      .nullable()
      .optional()
      .or(z.literal('')),
    rpe: z
      .string()
      .regex(/^\d+(\.\d)?$/, 'El RPE debe ser un valor decimal (ej. 8 o 8.5)')
      .nullable()
      .optional()
      .or(z.literal('')),
    descansoSegundos: z.number().int().min(0).max(3600).nullable().optional(),
    completada: z.boolean(),
    /**
     * WU17: marca REAL de inicio de la serie. Misma validación UTC estricta (`Z`) que
     * `timestampCompletadaUtc`. Opcional: los clientes previos a WU17 no la envían.
     */
    timestampInicioUtc: z
      .string()
      .datetime({ message: 'El timestamp de inicio debe estar en formato ISO 8601 UTC' })
      .optional(),
    timestampCompletadaUtc: z.string().datetime({ message: 'El timestamp debe estar en formato ISO 8601 UTC' }).optional(),
  })
  /**
   * WU17: coherencia temporal dentro de la misma serie. Si llegan ambas marcas, el inicio
   * no puede ser posterior a la finalización (misma fuente de reloj: el dispositivo).
   */
  .refine(
    (serie) =>
      !serie.timestampInicioUtc ||
      !serie.timestampCompletadaUtc ||
      new Date(serie.timestampInicioUtc).getTime() <=
        new Date(serie.timestampCompletadaUtc).getTime(),
    {
      message: 'El timestamp de inicio no puede ser posterior al de completada',
      path: ['timestampInicioUtc'],
    }
  );

export const SincronizarSeriesBatchSchema = z.object({
  series: z.array(RegistrarSerieSchema).min(1, 'Debe incluir al menos una serie para sincronizar'),
});

/**
 * Acción explícita del alumno para instanciar/cambiar la sesión de hoy de un bloque (RF-001 RN-04).
 * El `bloqueId` viaja como parámetro de ruta; solo una acción explícita puede crear/alterar sesiones.
 * `iniciarInmediato` se usa al repetir un bloque ya completado (nueva sesión 'en_progreso').
 */
export const EntrenarBloqueHoySchema = z.object({
  timezoneCliente: z.string().min(2).max(64).optional(),
  iniciarInmediato: z.boolean().optional(),
});

export const FinalizarSesionSchema = z.object({
  notasAlumno: z.string().max(1000, 'Las notas no pueden exceder 1000 caracteres').optional(),
  fechaFinUtc: z.string().datetime({ message: 'La fecha de fin debe ser un timestamp ISO 8601 UTC válido' }).optional(),
  /**
   * RF-001 Escenario 5: decisión explícita al cerrar una sesión sin series completadas.
   * COMPLETADA con 0 series se rechaza; DESCANSADA/INCOMPLETA marcan la sesión como OMITIDA.
   */
  tipoCierre: z.nativeEnum(TipoCierreSesion).optional(),
});

export const FotoComidaInputSchema = z.object({
  tipoComida: z.nativeEnum(TipoComida),
  storageKey: z.string().min(5, 'La clave de almacenamiento no es válida'),
});

/**
 * RF-002 RN-02: ventana local del check-in 1-Tap (18:00–23:59, hora del alumno).
 * Fuera de esta ventana el día ya quedó cerrado: no se admite el reporte.
 */
export const HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL = 18;
export const HORA_FIN_VENTANA_CHECKIN_NUTRICIONAL = 23;
/** Zona por defecto del alumno cuando el cliente no informa la suya (RN-05/ADR-002). */
export const TIMEZONE_NUTRICION_POR_DEFECTO = 'America/Caracas';
/** RF-002 Escenario 3: margen de tolerancia (±%) de los totales reportados contra las metas. */
export const TOLERANCIA_TOTALES_NUTRICIONAL_PCT = 10.0;

export const CheckinNutricionalSchema = z.object({
  alumnoId: z.string().uuid('El ID del alumno debe ser un UUID válido').optional(),
  fecha: z.string().regex(FECHA_CALENDARIO_REGEX, 'El formato de fecha debe ser YYYY-MM-DD'),
  semaforo: z.nativeEnum(SemaforoNutricional),
  aguaLitros: z.string().regex(DECIMAL_STRING_REGEX, 'El consumo de agua debe tener formato decimal con hasta 2 decimales').optional(),
  caloriasReportadas: z.number().int().min(0).max(15000).optional(),
  proteinaGramosReportada: z.number().int().min(0).max(1000).optional(),
  notasAlumno: z.string().max(280, 'Las notas del alumno no pueden exceder 280 caracteres').optional(),
  fotosPlatos: z
    .array(FotoComidaInputSchema)
    .max(4, 'No se permiten más de 4 fotografías de platos por día')
    .optional(),
  /**
   * RN-05/ADR-002: zona IANA del cliente para resolver el día local y la ventana horaria.
   * Si se omite o es inválida, el servidor asume `TIMEZONE_NUTRICION_POR_DEFECTO`.
   */
  timezoneCliente: z.string().min(2).max(64).optional(),
});

/**
 * RF-002 RN-01: recurso educativo adjunto a las metas del coach (PDF de lista de compras,
 * distribución de comidas, etc.).
 *
 * El recurso declara EXACTAMENTE una fuente: un enlace externo validado (`url`) o un archivo
 * subido a la bóveda (`storageKey` con el prefijo `nutricion-recursos/{alumnoId}/…`). El módulo
 * de la API valida además que la clave pertenezca al alumno dueño de las metas (RNF-001).
 */
export const RecursoNutricionalSchema = z
  .object({
    titulo: z.string().min(2, 'El título del recurso debe tener al menos 2 caracteres').max(120),
    url: z.string().url('La URL del recurso no es válida').max(500).optional(),
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
    aguaLitrosObjetivo: z
      .string()
      .regex(DECIMAL_STRING_REGEX, 'La meta de agua debe tener formato decimal con hasta 2 decimales')
      .optional(),
    recursos: z
      .array(RecursoNutricionalSchema)
      .max(10, 'No se permiten más de 10 recursos educativos por alumno')
      .optional(),
  })
  .refine(
    (valor) => Object.values(valor).some((campo) => campo !== undefined),
    'Debes definir al menos una meta nutricional o recurso educativo.'
  );

export const FiltroSesionesAlumnoSchema = z.object({
  desde: z.string().regex(FECHA_CALENDARIO_REGEX).optional(),
  hasta: z.string().regex(FECHA_CALENDARIO_REGEX).optional(),
  estado: z.nativeEnum(EstadoSesion).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const FiltroCheckinsNutricionalesSchema = z.object({
  alumnoId: z.string().uuid().optional(),
  desde: z.string().regex(FECHA_CALENDARIO_REGEX).optional(),
  hasta: z.string().regex(FECHA_CALENDARIO_REGEX).optional(),
  semaforo: z.nativeEnum(SemaforoNutricional).optional(),
});


// =============================================================================
// ANTROPOMETRÍA & BÓVEDA R2 SCHEMAS (Módulo 4: Control Antropométrico & Bóveda R2)
// =============================================================================

export const FotoAntropometriaInputSchema = z.object({
  angulo: z.nativeEnum(AnguloFoto),
  storageKey: z.string().min(5, 'La clave de almacenamiento no es válida'),
});

/**
 * RF-003 §6: medida decimal con rango de saneamiento.
 *
 * Los rangos del doc están fijados para peso (30–300 kg) y % de grasa (2–70%). Los perímetros y
 * pliegues del RN-02 usan cotas de coherencia antropométrica (ISAK) que atrapan el error de tipeo
 * sin rechazar un valor real: el mensaje conserva el mismo formato del peso/grasa y la medida sigue
 * siendo un string decimal de hasta 2 decimales (nunca un `number` flotante).
 */
function decimalEnRango(
  minimo: number,
  maximo: number,
  etiqueta: string,
  unidad: 'cm' | 'mm'
): z.ZodEffects<z.ZodString, string, string> {
  return z
    .string()
    .regex(DECIMAL_STRING_REGEX, `${etiqueta} debe tener formato decimal de hasta 2 decimales`)
    .refine((val) => {
      const num = Number(val);
      return num >= minimo && num <= maximo;
    }, `${etiqueta} debe estar entre ${minimo.toFixed(2)} ${unidad} y ${maximo.toFixed(2)} ${unidad}`);
}

/** Perímetros frecuentes del RN-02 (cm), reutilizables por cualquier variante del contrato. */
const PERIMETRO_BRAZO = (etiqueta: string) => decimalEnRango(10, 80, etiqueta, 'cm');
const PERIMETRO_MUSLO = (etiqueta: string) => decimalEnRango(20, 120, etiqueta, 'cm');

/**
 * RF-003 RN-02: perímetros corporales del control antropométrico.
 *
 * El doc lista: pecho, cintura, cadera, **brazo relajado/contraído**, **muslo medio** y cuello.
 * `brazoCm`/`musloCm` se conservan como ALIAS LEGADOS del brazo relajado y del muslo medio
 * (documentado en el WU RF-003a): no se rompe el contrato previo y el servicio resuelve la
 * precedencia `brazoRelajadoCm ?? brazoCm` al persistir.
 */
export const PerimetrosCorporalesInputSchema = z.object({
  cuelloCm: decimalEnRango(20, 80, 'El cuello', 'cm').optional(),
  pechoCm: decimalEnRango(40, 200, 'El pecho', 'cm').optional(),
  cinturaCm: decimalEnRango(30, 250, 'La cintura', 'cm').optional(),
  caderaCm: decimalEnRango(40, 250, 'La cadera', 'cm').optional(),
  /** RN-02: brazo RELAJADO (dato nuevo; alias legado `brazoCm`). */
  brazoRelajadoCm: PERIMETRO_BRAZO('El brazo relajado').optional(),
  /** RN-02: brazo CONTRAÍDO (dato nuevo, independiente del relajado). */
  brazoContraidoCm: PERIMETRO_BRAZO('El brazo contraído').optional(),
  /** RN-02: muslo MEDIO (dato nuevo; alias legado `musloCm`). */
  musloMedioCm: PERIMETRO_MUSLO('El muslo medio').optional(),
  /** Alias legado del brazo relajado (WU previos). */
  brazoCm: PERIMETRO_BRAZO('El brazo').optional(),
  /** Alias legado del muslo medio (WU previos). */
  musloCm: PERIMETRO_MUSLO('El muslo').optional(),
});

/**
 * RF-003 RN-02: pliegues cutáneos (mm) para la composición corporal estimada.
 * El doc lista tríceps, subescapular, suprailíaco y abdominal. Son opcionales y alternativos al
 * `%` de grasa por bioimpedancia/fórmula (el servicio admite cualquiera de los dos o ambos).
 */
export const PlieguesCutaneosInputSchema = z.object({
  tricepsMm: decimalEnRango(1, 100, 'El pliegue del tríceps', 'mm').optional(),
  subescapularMm: decimalEnRango(1, 100, 'El pliegue subescapular', 'mm').optional(),
  suprailiacoMm: decimalEnRango(1, 100, 'El pliegue suprailíaco', 'mm').optional(),
  abdominalMm: decimalEnRango(1, 100, 'El pliegue abdominal', 'mm').optional(),
});

/** RF-002 RN-01: módulo de la bóveda que solo admite PDFs (recursos del coach). */
export const MODULO_UPLOAD_PDF = 'nutricion-recursos' as const;

export const PresignedUploadUrlSchema = z
  .object({
    modulo: z.enum(['antropometria', 'comidas', 'comprobantes', MODULO_UPLOAD_PDF]),
    alumnoId: z.string().uuid('El ID del alumno debe ser un UUID válido'),
    angulo: z.nativeEnum(AnguloFoto).optional(),
    mimeType: z.enum(['image/webp', 'image/jpeg', 'application/pdf']),
  })
  .superRefine((valor, ctx) => {
    // RNF-001 §2: cada módulo tiene su familia de MIME. Los recursos nutricionales son PDFs
    // (documentos); las fotos de antropometría y comidas siguen siendo WebP/JPEG optimizados.
    if (valor.modulo === MODULO_UPLOAD_PDF && valor.mimeType !== 'application/pdf') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mimeType'],
        message: 'El módulo de recursos nutricionales solo admite archivos PDF (application/pdf).',
      });
    }
    if (valor.modulo !== MODULO_UPLOAD_PDF && valor.mimeType === 'application/pdf') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mimeType'],
        message: 'Solo los recursos nutricionales admiten PDF; aquí se permiten imágenes WebP o JPEG.',
      });
    }
  });

export const CheckinAntropometricoSchema = z.object({
  alumnoId: z.string().uuid('El ID del alumno debe ser un UUID válido'),
  fechaEvaluacion: z.string().regex(FECHA_CALENDARIO_REGEX, 'El formato de fecha debe ser YYYY-MM-DD'),
  pesoKg: z
    .string()
    .regex(DECIMAL_STRING_REGEX, 'El peso en kg debe tener hasta 2 decimales')
    .refine((val) => {
      const num = Number(val);
      return num >= 30 && num <= 300;
    }, 'El peso debe estar entre 30.00 kg y 300.00 kg'),
  alturaCm: z
    .string()
    .regex(DECIMAL_STRING_REGEX, 'La altura en cm debe tener hasta 2 decimales')
    .refine((val) => {
      const num = Number(val);
      return num >= 100 && num <= 250;
    }, 'La altura debe estar entre 100.00 cm y 250.00 cm')
    .optional(),
  porcentajeGrasa: z
    .string()
    .regex(DECIMAL_STRING_REGEX, 'El porcentaje de grasa debe tener hasta 2 decimales')
    .refine((val) => {
      const num = Number(val);
      return num >= 2 && num <= 70;
    }, 'El porcentaje de grasa debe estar entre 2.00% y 70.00%')
    .optional(),
  perimetros: PerimetrosCorporalesInputSchema.optional(),
  /** RN-02: composición por pliegues cutáneos (mm); alternativa/complemento del % de grasa. */
  pliegues: PlieguesCutaneosInputSchema.optional(),
  fotos: z
    .array(FotoAntropometriaInputSchema)
    .max(3, 'No se permiten más de 3 fotografías corporales de progreso por evaluación')
    .optional(),
  observacionesCoach: z.string().max(1000).optional(),
});

export const ConciliarAntropometriaSchema = z
  .object({
    accion: z.enum(['aprobar', 'rechazar']),
    observacionesCoach: z.string().max(1000).optional(),
    motivoRechazo: z.string().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.accion === 'rechazar' && (!data.motivoRechazo || data.motivoRechazo.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['motivoRechazo'],
        message: 'El motivo de rechazo es obligatorio al rechazar una evaluación antropométrica',
      });
    }
  });

export const FiltroEvolucionAntropometricaSchema = z.object({
  periodo: z.enum(['1M', '3M', '6M', '1A', 'todo']).optional(),
  desde: z.string().regex(FECHA_CALENDARIO_REGEX, 'El formato de fecha debe ser YYYY-MM-DD').optional(),
  hasta: z.string().regex(FECHA_CALENDARIO_REGEX, 'El formato de fecha debe ser YYYY-MM-DD').optional(),
  /**
   * WU24b: slice OPT-IN de la serie de controles aprobados. Sin ninguno de los dos parámetros,
   * `evaluaciones` devuelve la serie completa (contrato que consumen los charts del alumno).
   * Con `controlesOffset` y sin `controlesLimit`, el servidor aplica la página por defecto.
   */
  controlesLimit: z
    .coerce
    .number()
    .int('El límite de controles debe ser un número entero')
    .min(1, 'El límite de controles debe ser al menos 1')
    .max(LIMITE_CONTROLES_EVOLUCION_MAXIMO, 'El límite de controles no puede exceder 100')
    .optional(),
  controlesOffset: z
    .coerce
    .number()
    .int('El offset de controles debe ser un número entero')
    .min(0, 'El offset de controles debe ser mayor o igual a 0')
    .optional(),
});

export const ConsultaComparadorFotograficoSchema = z.object({
  controlIdA: z.string().uuid('El ID de control A debe ser un UUID válido'),
  controlIdB: z.string().uuid('El ID de control B debe ser un UUID válido'),
  angulo: z.nativeEnum(AnguloFoto),
});

// =============================================================================
// FINANZAS & LEDGER SCHEMAS (Módulo 2: Finanzas & Deuda Maestra Bimonetaria)
// =============================================================================

export const CrearPlanMembresiaSchema = z.object({
  nombre: z.string().min(3).max(60),
  descripcion: z.string().max(1000).optional(),
  beneficios: z.array(z.string().min(1)).min(1, 'Debe incluir al menos un beneficio'),
  // RF-005 RN-01: el precio base del catálogo es un monto numérico MAYOR a 0.00 con 2 decimales.
  // El precio cero NO es una vía válida para becados: eso se expresa con un override individual
  // (RN-02/§6), no con un plan estándar de $0.
  precioBaseUsd: z
    .string()
    .regex(DECIMAL_STRING_REGEX, 'El precio base debe ser una cadena decimal con hasta 2 decimales')
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
    .regex(DECIMAL_STRING_REGEX, 'El precio base debe ser una cadena decimal con hasta 2 decimales')
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
    .regex(TASA_STRING_REGEX, 'La tasa override debe tener hasta 4 decimales')
    .refine((val) => Number(val) > 0, 'La tasa override debe ser mayor a 0')
    .nullable()
    .optional(),
  beneficiosPersonalizados: z.array(z.string().min(1)).nullable().optional(),
  motivoOverride: z.string().max(500).nullable().optional(),
});

export const EmitirCuotaSchema = z.object({
  clienteId: z.string().uuid(),
  planId: z.string().uuid(),
  entrenadorId: z.string().uuid().optional(),
  periodo: z.string().regex(PERIODO_MES_REGEX, 'El formato de periodo debe ser YYYY-MM'),
  /**
   * RF-005 RN-03 (Precedencia de Valores): el monto de una cuota NUEVA NO lo dicta el cliente.
   * El servidor lo resuelve con el override activo del alumno (`precio_acordado_usd`) o, en su
   * defecto, con el precio base del plan del catálogo. El campo queda como contrato legado
   * opcional: si se envía, debe ser > 0.00 (nunca una vía para fabricar cuotas de $0 por error;
   * el becado se expresa con un override de precio 0.00 — RF-005 §6).
   */
  montoTotalUsd: z
    .string()
    .regex(DECIMAL_STRING_REGEX, 'El monto total debe ser una cadena decimal con hasta 2 decimales')
    .refine((val) => Number(val) > 0, 'El monto total debe ser mayor a 0.00')
    .optional(),
  fechaCorteUtc: z.string().datetime({ message: 'La fecha de corte debe ser una fecha ISO 8601 UTC válida' }),
  fechaEmisionUtc: z.string().datetime({ message: 'La fecha de emisión debe ser una fecha ISO 8601 UTC válida' }).optional(),
  notas: z.string().max(1000).optional(),
});

export const ActualizarTasaCambioSchema = z.object({
  entrenadorId: z.string().uuid().optional(),
  tasaOficialBcv: z
    .string()
    .regex(TASA_STRING_REGEX, 'La tasa oficial BCV debe ser una cadena decimal con hasta 4 decimales')
    .refine((val) => Number(val) > 0, 'La tasa oficial BCV debe ser mayor a 0'),
  tasaParalelo: z
    .string()
    .regex(TASA_STRING_REGEX, 'La tasa paralelo debe ser una cadena decimal con hasta 4 decimales')
    .refine((val) => Number(val) > 0, 'La tasa paralelo debe ser mayor a 0')
    .optional(),
  tasaActivaEntrenador: z
    .string()
    .regex(TASA_STRING_REGEX, 'La tasa activa del entrenador debe ser una cadena decimal con hasta 4 decimales')
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
      .regex(DECIMAL_STRING_REGEX, 'El monto original debe ser una cadena decimal con hasta 2 decimales'),
    monedaOriginal: z.nativeEnum(Moneda),
    metodoPago: z.nativeEnum(MetodoPago),
    referenciaBancaria: z.string().min(4).max(64).optional(),
    fechaOperacion: z.string().regex(FECHA_CALENDARIO_REGEX, 'La fecha de operación debe tener formato YYYY-MM-DD'),
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
      .regex(DECIMAL_STRING_REGEX, 'El monto original debe ser una cadena decimal con hasta 2 decimales')
      .refine((val) => Number(val) > 0, 'El monto original debe ser mayor a 0.00')
      .refine((val) => Number(val) <= 100000, 'El monto original no puede exceder 100,000.00'),
    monedaOriginal: z.nativeEnum(Moneda, {
      errorMap: () => ({ message: 'La moneda original debe ser válida (USD o VES)' }),
    }),
    metodoPago: z.nativeEnum(MetodoPago, {
      errorMap: () => ({ message: 'El método de pago no es válido' }),
    }).default(MetodoPago.EFECTIVO_USD),
    fechaOperacion: z.string().regex(FECHA_CALENDARIO_REGEX, 'La fecha de operación debe tener formato YYYY-MM-DD'),
    referenciaBancaria: z.string().max(64).optional(),
    notas: z.string().max(500).optional(),
  });

export const CobroDirectoInteligenteSchema = z.object({
  montoOriginal: z
    .string({ required_error: 'El monto original es obligatorio' })
    .regex(DECIMAL_STRING_REGEX, 'El monto original debe ser una cadena decimal con hasta 2 decimales')
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
    .regex(FECHA_CALENDARIO_REGEX, 'La fecha de operación debe tener formato YYYY-MM-DD')
    .optional()
    .default(() => new Date().toISOString().split('T')[0]),
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

// =============================================================================
// NOTIFICACIONES & PREFERENCIAS SCHEMAS (RF-014, RF-015, RF-016)
// =============================================================================

/** RF-015: canales físicos de entrega de la matriz de preferencias. */
export type CanalPreferenciaNotificacion = 'push' | 'email';

/**
 * RF-015 §A: mensaje EXACTO de la interfaz para el canal obligatorio de seguridad
 * (Escenario 2 — "Este canal es obligatorio para proteger tu cuenta").
 */
export const MENSAJE_CANAL_OBLIGATORIO_SEGURIDAD =
  'Este canal es obligatorio para proteger tu cuenta: el correo de seguridad no puede desactivarse (RF-015 RN-01).';

/**
 * RF-015 RN-02: advertencia al apagar a la vez Push y Email de "Finanzas y Pagos". El usuario
 * puede continuar confirmando explícitamente con `confirmarSinCanalesFinanzas: true`.
 */
export const MENSAJE_MINIMO_CANAL_FINANZAS =
  'Recomendamos mantener al menos un canal activo para no perder tu acceso por cuotas vencidas. ' +
  'Confirma con `confirmarSinCanalesFinanzas: true` para continuar.';

/** Campo del contrato que confirma la advertencia de RN-02. */
export const CAMPO_CONFIRMACION_FINANZAS = 'confirmarSinCanalesFinanzas';

/**
 * RF-015 §A: campos que NUNCA pueden desactivarse (RN-01 — "anulando cualquier intento de
 * desactivación"). Los comprobantes de pago aprobado no dependen de una preferencia: viajan como
 * `esCriticoSeguridad` y el despachador los garantiza por Email.
 */
export const CANALES_OBLIGATORIOS_NOTIFICACION = ['notifySeguridadEmail'] as const;

/**
 * RF-015 §A/§B: valores por defecto de la matriz COMPLETA, por campo.
 *
 * Fuente única de defaults del contrato (el `DEFAULT` de cada columna en la migración 0008 replica
 * estos mismos valores para que un alta por SQL directo nazca alineada).
 */
export const PREFERENCIAS_NOTIFICACION_POR_DEFECTO = {
  // §A Alumno / Cliente — Finanzas y Pagos
  notifyPaymentsPush: true,
  notifyPaymentsEmail: true,
  // §A Alumno / Cliente — Planificación Deportiva
  notifyWorkoutsPush: true,
  notifyWorkoutsEmail: false,
  // §A Alumno / Cliente — Check-in Antropométrico
  notifyCheckinsPush: true,
  notifyCheckinsEmail: false,
  // §A Seguridad de Cuenta (fila BLOQUEADA: Email obligatorio, Push opt-in)
  notifySeguridadPush: false,
  notifySeguridadEmail: true,
  // §B Entrenador — Cobranzas Entrantes
  notifyCobranzasPush: true,
  notifyCobranzasEmail: true,
  // §B Entrenador — Nuevos Registros
  notifyNuevosRegistrosPush: true,
  notifyNuevosRegistrosEmail: true,
  // §B Entrenador — Reportes de Progreso
  notifyReportesProgresoPush: true,
  notifyReportesProgresoEmail: false,
  // §B Entrenador — Resumen Semanal (digest dominical)
  digestWeeklyPush: false,
  digestWeeklyEmail: true,
} as const;

/**
 * RF-015: matriz de preferencias por rol y canal.
 *
 * Los 16 campos existen para CUALQUIER usuario (una fila por usuario); este esquema declara cuáles
 * son los que cada rol realmente gobierna. Cualquier campo puede llegar parcialmente (PUT).
 *
 * RN-01 se valida aquí (contrato) y se vuelve a validar en el servicio sobre el estado EFECTIVO
 * (el payload puede desactivar un canal que ya estaba apagado en base de datos).
 */
export const PreferenciasNotificacionSchema = z.object({
  notifyPaymentsPush: z.boolean(),
  notifyPaymentsEmail: z.boolean(),
  notifyWorkoutsPush: z.boolean(),
  notifyWorkoutsEmail: z.boolean(),
  notifyCheckinsPush: z.boolean(),
  notifyCheckinsEmail: z.boolean(),
  notifySeguridadPush: z.boolean(),
  notifySeguridadEmail: z.boolean(),
  notifyCobranzasPush: z.boolean(),
  notifyCobranzasEmail: z.boolean(),
  notifyNuevosRegistrosPush: z.boolean(),
  notifyNuevosRegistrosEmail: z.boolean(),
  notifyReportesProgresoPush: z.boolean(),
  notifyReportesProgresoEmail: z.boolean(),
  digestWeeklyPush: z.boolean(),
  digestWeeklyEmail: z.boolean(),
});

/** Campo booleano de la matriz de preferencias (derive del contrato, no una lista a mano). */
export type CampoPreferenciaNotificacion = keyof z.infer<typeof PreferenciasNotificacionSchema>;

/**
 * RF-015: categorías de evento del despachador que alimentan cada fila de la matriz.
 * (Reemplaza la antigua unión suelta de `types/index.ts` para poder tipar el catálogo.)
 */
export const CATEGORIAS_NOTIFICACION = [
  'FINANZAS',
  'ENTRENAMIENTO',
  'ANTROPOMETRIA',
  'RESUMEN_SEMANAL',
  'SEGURIDAD',
  /**
   * WU-E (RF-011 RN-07.4 / RF-015 §B "Nuevos Registros"): alertas operativas de onboarding del
   * coach (p. ej. alumno registrado por su deep link). El Despachador las persiste SIEMPRE en la
   * bandeja In-App (RF-014 RN-04) y enruta Push/Email por la fila "Nuevos Registros" del §B.
   */
  'ALUMNOS',
] as const;

export type CategoriaNotificacion = (typeof CATEGORIAS_NOTIFICACION)[number];

/** RF-015 §A/§B: identificadores de las filas de la matriz (por rol). */
export type CategoriaPreferenciaNotificacion =
  | 'FINANZAS'
  | 'PLANIFICACION_DEPORTIVA'
  | 'CHECKIN_ANTROPOMETRICO'
  | 'SEGURIDAD'
  | 'COBRANZAS'
  | 'NUEVOS_REGISTROS'
  | 'REPORTES_PROGRESO'
  | 'RESUMEN_SEMANAL';

/** RF-015: fila de la matriz — categoría, etiqueta de UI, canales y bloqueos. */
export interface DefinicionCategoriaPreferencia {
  id: CategoriaPreferenciaNotificacion;
  /** Etiqueta en español de la pantalla de ajustes (RF-015 §A/§B). */
  etiqueta: string;
  /** Categorías de evento que el despachador enruta por esta fila. */
  eventos: readonly CategoriaNotificacion[];
  push: CampoPreferenciaNotificacion;
  email: CampoPreferenciaNotificacion;
  /** Canales que no pueden desactivarse (RN-01). */
  canalesObligatorios: readonly CanalPreferenciaNotificacion[];
}

const CATEGORIA_SEGURIDAD: DefinicionCategoriaPreferencia = {
  id: 'SEGURIDAD',
  etiqueta: 'Seguridad de Cuenta',
  eventos: ['SEGURIDAD'],
  push: 'notifySeguridadPush',
  email: 'notifySeguridadEmail',
  canalesObligatorios: ['email'],
};

const MATRIZ_ALUMNO: readonly DefinicionCategoriaPreferencia[] = [
  {
    id: 'FINANZAS',
    etiqueta: 'Finanzas y Pagos',
    eventos: ['FINANZAS'],
    push: 'notifyPaymentsPush',
    email: 'notifyPaymentsEmail',
    canalesObligatorios: [],
  },
  {
    id: 'PLANIFICACION_DEPORTIVA',
    etiqueta: 'Planificación Deportiva',
    eventos: ['ENTRENAMIENTO'],
    push: 'notifyWorkoutsPush',
    email: 'notifyWorkoutsEmail',
    canalesObligatorios: [],
  },
  {
    id: 'CHECKIN_ANTROPOMETRICO',
    etiqueta: 'Check-in Antropométrico',
    eventos: ['ANTROPOMETRIA'],
    push: 'notifyCheckinsPush',
    email: 'notifyCheckinsEmail',
    canalesObligatorios: [],
  },
  CATEGORIA_SEGURIDAD,
];

const MATRIZ_ENTRENADOR: readonly DefinicionCategoriaPreferencia[] = [
  {
    id: 'COBRANZAS',
    etiqueta: 'Cobranzas Entrantes',
    eventos: ['FINANZAS'],
    push: 'notifyCobranzasPush',
    email: 'notifyCobranzasEmail',
    canalesObligatorios: [],
  },
  {
    id: 'NUEVOS_REGISTROS',
    etiqueta: 'Nuevos Registros',
    eventos: ['ALUMNOS'],
    push: 'notifyNuevosRegistrosPush',
    email: 'notifyNuevosRegistrosEmail',
    canalesObligatorios: [],
  },
  {
    id: 'REPORTES_PROGRESO',
    etiqueta: 'Reportes de Progreso',
    eventos: ['ENTRENAMIENTO', 'ANTROPOMETRIA'],
    push: 'notifyReportesProgresoPush',
    email: 'notifyReportesProgresoEmail',
    canalesObligatorios: [],
  },
  {
    id: 'RESUMEN_SEMANAL',
    etiqueta: 'Resumen Semanal',
    eventos: ['RESUMEN_SEMANAL'],
    push: 'digestWeeklyPush',
    email: 'digestWeeklyEmail',
    canalesObligatorios: [],
  },
  CATEGORIA_SEGURIDAD,
];

/**
 * RF-015: matriz por rol. El superadmin opera la plataforma con el mismo tablero operativo que un
 * entrenador (no tiene perfil propio), por lo que hereda la matriz del entrenador.
 */
export const MATRIZ_PREFERENCIAS_NOTIFICACION: Record<
  Rol,
  readonly DefinicionCategoriaPreferencia[]
> = {
  [Rol.ALUMNO]: MATRIZ_ALUMNO,
  [Rol.ENTRENADOR]: MATRIZ_ENTRENADOR,
  [Rol.SUPERADMIN]: MATRIZ_ENTRENADOR,
};

/** RF-015: filas de la matriz que gobierna un rol. */
export function matrizPreferenciasPorRol(
  rol: Rol
): readonly DefinicionCategoriaPreferencia[] {
  return MATRIZ_PREFERENCIAS_NOTIFICACION[rol] ?? MATRIZ_ALUMNO;
}

/** RF-015: fila de la matriz que enruta una categoría de evento para un rol (o `undefined`). */
export function buscarDefinicionCategoria(
  rol: Rol,
  categoria: CategoriaNotificacion
): DefinicionCategoriaPreferencia | undefined {
  return matrizPreferenciasPorRol(rol).find((fila) => fila.eventos.includes(categoria));
}

/** RF-015: canal lógico → campo de preferencia de una fila. */
export function campoDeCanal(
  fila: DefinicionCategoriaPreferencia,
  canal: CanalPreferenciaNotificacion
): CampoPreferenciaNotificacion {
  return canal === 'push' ? fila.push : fila.email;
}

/**
 * RF-015: PUT de preferencias. Cualquier subconjunto de la matriz es válido.
 *
 * - **RN-01**: `notifySeguridadEmail = false` se rechaza en contrato (además de servicio y BD).
 * - **RN-02**: apagar Push y Email de Finanzas en el mismo payload exige
 *   `confirmarSinCanalesFinanzas = true` (la UI muestra la advertencia y reintenta).
 */
export const ActualizarPreferenciasNotificacionSchema = PreferenciasNotificacionSchema.partial()
  .extend({
    [CAMPO_CONFIRMACION_FINANZAS]: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.notifySeguridadEmail === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notifySeguridadEmail'],
        message: MENSAJE_CANAL_OBLIGATORIO_SEGURIDAD,
      });
    }

    if (
      data.notifyPaymentsPush === false &&
      data.notifyPaymentsEmail === false &&
      !data[CAMPO_CONFIRMACION_FINANZAS]
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notifyPaymentsPush'],
        message: MENSAJE_MINIMO_CANAL_FINANZAS,
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notifyPaymentsEmail'],
        message: MENSAJE_MINIMO_CANAL_FINANZAS,
      });
    }
  });

export const RegistrarDispositivoSchema = z.object({
  deviceToken: z.string().min(10).max(255),
  platform: z.nativeEnum(PlataformaDispositivo),
});

export const MarcarNotificacionLeidaSchema = z.object({
  leida: z.boolean().default(true),
});

/** RF-014 (Ola 3): página por defecto y techo duro de `GET /notificaciones/in-app`. */
export const LIMITE_IN_APP_POR_DEFECTO = 25;
export const LIMITE_IN_APP_MAXIMO = 100;

/**
 * Acepta booleanos reales (uso interno/tests) y strings de query (`'true'`/`'false'`).
 * `z.coerce.boolean()` NO sirve aquí: `Boolean('false') === true` convertiría un filtro
 * desactivado en activado.
 */
const BooleanoQuerySchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((valor) => (typeof valor === 'boolean' ? valor : valor === 'true'));

/**
 * RF-014 (Ola 3): filtros server-side de la bandeja In-App (campana de N2).
 *
 * - `limit`/`offset`: paginación estándar con techo duro (ADR-013).
 * - `soloNoLeidas`: recorta la lista a las no leídas; `totalNoLeidas` de la respuesta sigue
 *   describiendo TODAS las no leídas del usuario (no solo la página).
 */
export const FiltroBandejaInAppSchema = z.object({
  limit: z
    .coerce
    .number()
    .int('El límite debe ser un número entero')
    .min(1, 'El límite debe ser al menos 1')
    .max(LIMITE_IN_APP_MAXIMO, `El límite no puede exceder ${LIMITE_IN_APP_MAXIMO}`)
    .optional()
    .default(LIMITE_IN_APP_POR_DEFECTO),
  offset: z
    .coerce
    .number()
    .int('El offset debe ser un número entero')
    .min(0, 'El offset debe ser mayor o igual a 0')
    .optional()
    .default(0),
  soloNoLeidas: BooleanoQuerySchema.optional().default(false),
});

export const ActualizarTemaUiSchema = z.object({
  temaUi: z.nativeEnum(TemaUi),
});
