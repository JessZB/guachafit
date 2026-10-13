import { z } from 'zod';
import { EstadoSesion, TipoCierreSesion } from '../enums';
import {
  DECIMAL_STRING_REGEX,
  FECHA_CALENDARIO_REGEX,
  LIMITES_SERIE,
  MENSAJE_PESO_FUERA_DE_RANGO,
  MENSAJE_ESFUERZO_INVALIDO,
  MENSAJE_REPS_FUERA_DE_RANGO,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
  esPesoKgValido,
  esRpeValido,
} from './comunes';
import { campoPesoKg, campoRpe } from './campos-internos';

// =============================================================================
// ENTRENAMIENTO SCHEMAS (Módulo 3: Sesiones de Entrenamiento)
// =============================================================================

export const CrearEjercicioCatalogoSchema = z.object({
  entrenadorId: z.string().uuid('No encontramos ese entrenador. Actualiza la pantalla e inténtalo de nuevo.').optional(),
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
  pesoPrescritoKg: campoPesoKg('El peso prescrito debe tener formato decimal (ej. 50.00)').optional(),
  pesoSugeridoKg: campoPesoKg('El peso sugerido debe tener formato decimal (ej. 50.00)').optional(),
  rpeObjetivo: campoRpe().optional(),
});

export const EjercicioPrescritoInputSchema = z.object({
  ejercicioId: z.string().uuid('No encontramos ese ejercicio. Actualiza la pantalla e inténtalo de nuevo.'),
  orden: z.number().int().min(1).default(1),
  notasCoach: z.string().max(1000, 'Las notas no pueden exceder 1000 caracteres').optional(),
  descansoSegundos: z.number().int().min(5).max(1800).optional().default(90),
  series: z.array(SeriePrescritaInputSchema).min(1, 'Debe incluir al menos una serie prescrita'),
});

export const CrearSesionEntrenamientoSchema = z.object({
  alumnoId: z.string().uuid('No encontramos ese alumno. Actualiza la pantalla e inténtalo de nuevo.'),
  rutinaId: z.string().uuid('No encontramos esa rutina. Actualiza la pantalla e inténtalo de nuevo.').optional(),
  fechaProgramada: z.string().regex(FECHA_CALENDARIO_REGEX, 'La fecha no es válida. Usa el formato año-mes-día (por ejemplo, 2026-01-31)'),
  timezoneCliente: z.string().min(2).max(64).default(ZONA_HORARIA_ALUMNO_POR_DEFECTO),
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
        /** Texto ('10', '8-10', '45s'): ningún número puede superar el máximo de repeticiones. */
        reps: z
          .string()
          .min(1)
          .max(30)
          .refine(
            (texto) => (texto.match(/\d+/g) ?? []).every((n) => Number(n) <= LIMITES_SERIE.repsMax),
            MENSAJE_REPS_FUERA_DE_RANGO
          ),
        /**
         * Carga prescrita como texto libre (ej. '60 kg', '60.5', 'Corporal').
         * Vacío es válido (prescripción cualitativa): la API persiste `peso_prescrito_kg = null`
         * y conserva el texto en notas, sin materializar '0.00'. Igual que `reps`, ningún número
         * del texto puede superar el tope ('500-1200 kg' se rechaza aunque se materialice el 500).
         */
        peso: z
          .string()
          .max(30, 'La carga prescrita no puede exceder 30 caracteres')
          .refine(
            (texto) =>
              (texto.match(/\d+(?:[.,]\d+)?/g) ?? []).every(
                (n) => Number(n.replace(',', '.')) <= LIMITES_SERIE.pesoKgMax
              ),
            MENSAJE_PESO_FUERA_DE_RANGO
          )
          .optional()
          .default(''),
        /** Esfuerzo como texto ('8', '8.5' o '8,5'); vacío = sin esfuerzo prescrito. */
        rpe: z
          .string()
          .max(10)
          .refine((texto) => {
            const valor = texto.trim().replace(',', '.');
            return valor === '' || esRpeValido(valor);
          }, MENSAJE_ESFUERZO_INVALIDO)
          .optional(),
        descansoSegundos: z.number().int().min(5).max(1800).optional(),
        /** RF-017 RN-01: notas técnicas del coach para el ejercicio (aditivo, opcional). */
        notas: z.string().max(500, 'Las notas técnicas no pueden exceder 500 caracteres').optional(),
      })
    )
    .min(1, 'Cada día debe tener al menos un ejercicio'),
});

export const GuardarRutinaSemanalSchema = z.object({
  alumnoId: z.string().uuid('No encontramos ese alumno. Actualiza la pantalla e inténtalo de nuevo.'),
  nombreRutina: z.string().max(120).optional(),
  bloques: z
    .array(BloqueDiaRutinaSchema)
    .min(1, 'Debe definir al menos un bloque de día de entrenamiento')
    .max(7, 'Una planificación semanal no puede exceder 7 bloques de entrenamiento'),
});

export const IniciarSesionSchema = z.object({
  timezoneCliente: z.string().min(2).max(64),
  fechaInicioUtc: z.string().datetime({ message: 'La fecha de inicio no es válida' }).optional(),
});

export const RegistrarSerieSchema = z
  .object({
    serieId: z.string().uuid('No encontramos esa serie. Actualiza la pantalla e inténtalo de nuevo.'),
    repsLogradas: z.number().int().min(0).max(200),
    pesoKg: campoPesoKg('El peso en kg debe tener formato decimal con hasta 2 decimales', {
      permiteVacio: true,
    })
      .nullable()
      .optional(),
    rpe: campoRpe({ permiteVacio: true }).nullable().optional(),
    descansoSegundos: z.number().int().min(0).max(3600).nullable().optional(),
    completada: z.boolean(),
    /**
     * WU17: marca REAL de inicio de la serie. Misma validación UTC estricta (`Z`) que
     * `timestampCompletadaUtc`. Opcional: los clientes previos a WU17 no la envían.
     */
    timestampInicioUtc: z
      .string()
      .datetime({ message: 'La hora de inicio de la serie no es válida' })
      .optional(),
    timestampCompletadaUtc: z.string().datetime({ message: 'La hora de la serie no es válida' }).optional(),
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
      message: 'La hora de inicio de la serie no puede ser posterior a la hora en que la completaste',
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
  fechaFinUtc: z.string().datetime({ message: 'La fecha de fin no es válida' }).optional(),
  /**
   * RF-001 Escenario 5: decisión explícita al cerrar una sesión sin series completadas.
   * COMPLETADA con 0 series se rechaza; DESCANSADA/INCOMPLETA marcan la sesión como OMITIDA.
   */
  tipoCierre: z.nativeEnum(TipoCierreSesion).optional(),
});

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

export const FiltroSesionesAlumnoSchema = z.object({
  desde: z.string().regex(FECHA_CALENDARIO_REGEX).optional(),
  hasta: z.string().regex(FECHA_CALENDARIO_REGEX).optional(),
  estado: z.nativeEnum(EstadoSesion).optional(),
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});
