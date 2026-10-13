import { z } from 'zod';
import {
  CrearEjercicioCatalogoSchema,
  ActualizarEjercicioCatalogoSchema,
  SeriePrescritaInputSchema,
  EjercicioPrescritoInputSchema,
  CrearSesionEntrenamientoSchema,
  BloqueDiaRutinaSchema,
  GuardarRutinaSemanalSchema,
  IniciarSesionSchema,
  RegistrarSerieSchema,
  SincronizarSeriesBatchSchema,
  FinalizarSesionSchema,
  FiltroSesionesAlumnoSchema,
  FiltroMonitorAdherenciaSchema,
  SemaforoFiltroMonitorSchema,
} from '../schemas';
import {
  EstadoSesion,
  SemaforoAdherencia,
  MotivoOmision,
} from '../enums';
import type { PaginadoDTO } from './comunes';

// Tipos inferidos de DTOs - Entrenamiento (Módulo 3)
export type CrearEjercicioCatalogoDTO = z.infer<typeof CrearEjercicioCatalogoSchema>;
export type ActualizarEjercicioCatalogoDTO = z.infer<typeof ActualizarEjercicioCatalogoSchema>;
export type SeriePrescritaInputDTO = z.infer<typeof SeriePrescritaInputSchema>;
export type EjercicioPrescritoInputDTO = z.infer<typeof EjercicioPrescritoInputSchema>;
export type CrearSesionEntrenamientoDTO = z.infer<typeof CrearSesionEntrenamientoSchema>;
export type BloqueDiaRutinaDTO = z.infer<typeof BloqueDiaRutinaSchema>;
export type GuardarRutinaSemanalDTO = z.infer<typeof GuardarRutinaSemanalSchema>;
export type IniciarSesionDTO = z.infer<typeof IniciarSesionSchema>;
export type RegistrarSerieDTO = z.infer<typeof RegistrarSerieSchema>;
export type SincronizarSeriesBatchDTO = z.infer<typeof SincronizarSeriesBatchSchema>;
export type FinalizarSesionDTO = z.infer<typeof FinalizarSesionSchema>;
export type FiltroSesionesAlumnoDTO = z.infer<typeof FiltroSesionesAlumnoSchema>;
/** WU25a: filtros server-side del monitor de adherencia (q + semáforo + orden). */
export type FiltroMonitorAdherenciaDTO = z.infer<typeof FiltroMonitorAdherenciaSchema>;
export type SemaforoFiltroMonitorDTO = z.infer<typeof SemaforoFiltroMonitorSchema>;

// =============================================================================
// RESPUESTAS TIPADAS - ENTRENAMIENTO (MÓDULO 3)
// =============================================================================

export interface EjercicioCatalogoDetalleDTO {
  id: string;
  entrenadorId?: string | null;
  nombre: string;
  grupoMuscular: string;
  patronMovimiento?: string | null;
  videoUrl?: string | null;
  activo: boolean;
  createdAtUtc: string;
}

export interface SerieRegistroDetalleDTO {
  id: string;
  ejercicioSesionId: string;
  numeroSerie: number;
  repsObjetivo: number;
  repsLogradas?: number | null;
  /** Peso real levantado por el alumno (se sobrescribe en cada sincronización). */
  pesoKg?: string | null;
  /** Peso prescrito por el coach (null cuando la prescripción es cualitativa o sin peso). */
  pesoPrescritoKg?: string | null;
  rpe?: string | null;
  descansoSegundos?: number | null;
  /**
   * WU17: marca REAL de inicio de la serie (ISO 8601 UTC) capturada cuando el alumno
   * interactúa con la serie o pulsa "Iniciar serie". `descansoSegundos` sigue siendo el
   * valor del temporizador (objetivo), no una medición. Null/ausente = sin marca: el
   * descanso real no se inventa.
   */
  timestampInicioUtc?: string | null;
  completada: boolean;
  timestampCompletadaUtc?: string | null;
}

export interface EjercicioSesionDetalleDTO {
  id: string;
  sesionId: string;
  ejercicioId: string;
  orden: number;
  /**
   * Texto corto para el alumno. En sesiones creadas desde la rutina semanal es un resumen
   * ("Día 1 · 8-10 repeticiones · peso a tu criterio") seguido de las indicaciones del coach;
   * se conserva para la web ya publicada. La web actual prefiere los campos estructurados.
   */
  notasCoach?: string | null;
  /** RF-017 RN-01: indicaciones técnicas que el coach escribió para el ejercicio. */
  notasTecnicas?: string | null;
  /** Esfuerzo prescrito de 1 a 10 (ej. "8.0"); no cambia cuando el alumno registra su esfuerzo real. */
  rpeSugerido?: string | null;
  descansoPrescritoSegundos?: number | null;
  ejercicio?: EjercicioCatalogoDetalleDTO;
  series: SerieRegistroDetalleDTO[];
}

export interface SesionEntrenamientoDetalleDTO {
  id: string;
  alumnoId: string;
  rutinaId?: string | null;
  bloqueId?: string | null;
  esDiaDescansoOriginal?: boolean;
  fechaProgramada: string; // Formato YYYY-MM-DD
  fechaInicioUtc?: string | null; // ISO 8601 UTC
  fechaFinUtc?: string | null; // ISO 8601 UTC
  timezoneCliente: string;
  estado: EstadoSesion;
  /** Motivo persistido cuando `estado === OMITIDA` (RF-001 Escenario 5). */
  motivoOmision?: MotivoOmision | null;
  porcentajeCumplimiento: string; // Decimal string con hasta 2 decimales (ej. "85.00")
  volumenTotalKg?: string | null; // Tonelaje total acumulado (kg * reps)
  notasAlumno?: string | null;
  ejercicios: EjercicioSesionDetalleDTO[];
  alumnoNombre?: string;
  duracionMinutos?: number | null;
  cumpleReglaRacha?: boolean; // RN-02: True si completó >= 70% del volumen prescrito
  createdAtUtc: string;
  updatedAtUtc: string;
}

/**
 * WU24: respuesta paginada de `GET /sesiones/alumno/:alumnoId/historial`.
 * `total` es el COUNT real de sesiones del alumno (no el tamaño de la página) y el orden es
 * cronológico descendente con desempate estable por `id` para que `offset` no repita ni salte.
 */
export type HistorialSesionesAlumnoDTO = PaginadoDTO<SesionEntrenamientoDetalleDTO>;

/**
 * Respuesta de `POST /sesiones/:id/finalizar` (RF-001 RN-02).
 * `cumpleRacha` es el alias explícito aditivo de `cumpleReglaRacha` para el cliente.
 */
export interface FinalizarSesionResponseDTO {
  sesion: SesionEntrenamientoDetalleDTO;
  cumpleReglaRacha: boolean;
  cumpleRacha: boolean;
  nuevaRacha: number;
  duracionMinutos: number | null;
  volumenTotalKg?: string;
}

export interface BloqueSemanaProgresoDTO {
  bloqueId: string;
  titulo: string;
  enfoque?: string | null;
  diaSugerido?: number;
  totalEjercicios: number;
  completado: boolean;
  fechaCompletadaUtc?: string | null;
  fechaProgramada?: string | null;
  sesionId?: string | null;
  esSugeridoHoy?: boolean;
  /**
   * Estado de la sesión de referencia del bloque en la semana (COMPLETADA, OMITIDA, EN_PROGRESO...).
   * Permite renderizar una OMITIDA como "Descansado"/"Incompleto" en lugar de un 0% pendiente.
   */
  estadoSesion?: EstadoSesion | null;
  /** Motivo persistido cuando `estadoSesion === OMITIDA` (DESCANSO | INCOMPLETO). */
  motivoOmision?: MotivoOmision | null;
}

export interface SemanaEntrenamientoProgresoDTO {
  semanaIso: string; // ej. '2026-W38'
  inicioSemana: string; // YYYY-MM-DD (Lunes)
  finSemana: string; // YYYY-MM-DD (Domingo)
  totalBloques: number;
  bloquesCompletados: number;
  porcentajeCumplimiento: string;
  bloques: BloqueSemanaProgresoDTO[];
  siguienteBloqueSugeridoId?: string | null;
  esDiaDescansoHoy: boolean;
  /** Racha efectiva del alumno (RN-02): 0 cuando la cadena está rota o no existe. */
  rachaDias: number;
}

/**
 * Cuerpo de la acción explícita del alumno para entrenar un bloque hoy (RF-001 RN-04).
 * El `bloqueId` viaja como parámetro de ruta; este DTO controla timezone y arranque inmediato.
 */
export interface EntrenarBloqueHoyDTO {
  timezoneCliente?: string;
  /**
   * true al repetir un bloque ya completado: la nueva sesión se crea directamente 'en_progreso'.
   * false/omitido: la sesión se crea 'planificada' para previsualizar antes de comenzar.
   */
  iniciarInmediato?: boolean;
}

export interface RutinaSemanalDetalleDTO {
  id: string;
  alumnoId: string;
  entrenadorId: string;
  nombre: string;
  activa: boolean;
  bloques: BloqueDiaRutinaDTO[];
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface MonitorAdherenciaSemanalDTO {
  /** `usuarios.id` del alumno (clave de sesiones y rutinas). */
  alumnoId: string;
  /**
   * `perfiles_alumno.id` del alumno: es el ID que espera `GET /alumnos/:id`, por lo que
   * habilita el enlace directo de la UI al expediente del alumno.
   */
  alumnoPerfilId: string;
  nombreCompleto: string;
  /**
   * Sesiones prescritas de la rutina activa que ya debieron ejecutarse en la semana
   * en curso (bloques con día sugerido <= día ISO de hoy). 0 si no hay plan activo.
   */
  sesionesPrescritas: number;
  /** Sesiones materializadas y completadas dentro de la semana en curso (Lunes 00:00 -> ahora). */
  sesionesCompletadas: number;
  porcentajeCumplimientoSemanal: string; // Decimal string con hasta 2 decimales (ej. "80.00")
  semaforoAdherencia: SemaforoAdherencia;
  /**
   * `false` cuando el alumno no tiene una rutina activa con bloques: la UI debe mostrar
   * "sin plan" en lugar de un semáforo ROJO 0/0 potencialmente engañoso.
   */
  tienePlanActivo: boolean;
  /**
   * D6 (aditivo): `true` cuando el alumno tiene plan activo pero NINGÚN bloque vence todavía
   * en la semana en curso (bloques debidos = 0). La UI debe mostrarlo como estado neutral
   * ("Al día — sin pendientes"), nunca como ROJO: aún no existe nada que cumplir.
   */
  sinPendientesSemana: boolean;
  rachaDiasConsecutivos: number;
  diasInactivo: number;
  ultimaSesionUtc?: string | null;
}

/**
 * WU24: contadores de la cartera COMPLETA del monitor de adherencia (independientes de la página).
 *
 * Paridad EXACTA con los chips/filtros de la UI (`monitor-filtros.ts`):
 * - `rojo` excluye a los alumnos con plan pero sin pendientes aún (0/0 neutral de D6).
 * - `amarillo`/`verde` cuentan alumnos con plan y ese semáforo.
 * - `sinPlan` cuenta alumnos sin rutina activa; `sinPendientes` cuenta plan activo sin bloques
 *   vencidos en la semana (estado neutral "Al día — sin pendientes").
 */
export interface ResumenMonitorAdherenciaDTO {
  rojo: number;
  amarillo: number;
  verde: number;
  sinPlan: number;
  sinPendientes: number;
  total: number;
}

/** WU24: respuesta paginada de `GET /entrenador/monitor-adherencia` (orden de riesgo estable). */
export interface MonitorAdherenciaDTO extends PaginadoDTO<MonitorAdherenciaSemanalDTO> {
  resumen: ResumenMonitorAdherenciaDTO;
}
