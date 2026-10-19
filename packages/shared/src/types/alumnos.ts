import { z } from 'zod';
import {
  AltaManualAlumnoSchema,
  RegistroPublicoAlumnoSchema,
  CambioEstadoAlumnoSchema,
  ActualizarPerfilAlumnoSchema,
  ActualizarZonaHorariaAlumnoSchema,
  FiltroDirectorioAlumnosSchema,
  RestaurarAlumnoSchema,
} from '../schemas';
import {
  TipoDocumento,
  Modalidad,
  EstadoAlumno,
  PeriodicidadAntropometria,
} from '../enums';
import type { PaginadoDTO } from './comunes';

// Tipos inferidos de DTOs - Alumnos
export type AltaManualAlumnoDTO = z.infer<typeof AltaManualAlumnoSchema>;
export type RegistroPublicoAlumnoDTO = z.infer<typeof RegistroPublicoAlumnoSchema>;
export type CambioEstadoAlumnoDTO = z.infer<typeof CambioEstadoAlumnoSchema>;
export type ActualizarPerfilAlumnoDTO = z.infer<typeof ActualizarPerfilAlumnoSchema>;
export type ActualizarZonaHorariaAlumnoDTO = z.infer<typeof ActualizarZonaHorariaAlumnoSchema>;
export type FiltroDirectorioAlumnosDTO = z.infer<typeof FiltroDirectorioAlumnosSchema>;
export type RestaurarAlumnoDTO = z.infer<typeof RestaurarAlumnoSchema>;

export interface PerfilAlumnoDetalleDTO {
  id: string;
  usuarioId: string;
  entrenadorId: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  email?: string | null;
  fechaNacimiento: string;
  edadCalculada: number;
  telefonoWhatsapp: string;
  modalidad: Modalidad;
  estadoActivacion: EstadoAlumno;
  /**
   * RF-003 RN-01 (WU RF-003a): periodicidad configurable del check-in antropométrico del alumno.
   * `null` = sin calendario (no hay fechas programadas ni recordatorio de las 06:00).
   */
  periodicidadAntropometria?: PeriodicidadAntropometria | null;
  /** Ancla (YYYY-MM-DD, día local del alumno) del calendario de periodicidad antropométrica. */
  antropometriaInicio?: string | null;
  tasaFijadaOverride?: string | null;
  fichaSaludPrivada?: string | null; // Cifrado AES-256-GCM solo visible para el coach
  planActivoId?: string | null;
  planActivoNombre?: string | null;
  precioAcordadoOverride?: string | null;
  semaforoPago?: 'al_dia' | 'por_vencer' | 'moroso' | 'sin_cuota';
  ultimaSesionFecha?: string | null;
  /** RF-001 RN-02: racha de días consecutivos con cumplimiento >= 70%. */
  rachaDias?: number;
  /** Última fecha local (YYYY-MM-DD) en la que se incrementó la racha. */
  rachaUltimaFecha?: string | null;
  /**
   * LOTE API-N2: zona horaria (IANA) del alumno. El API la envía siempre en la ficha
   * (`GET`/`PATCH /alumnos/:id`); opcional solo para datos de demostración anteriores.
   */
  zonaHoraria?: string;
  deletedAtUtc?: string | null;
  createdAtUtc: string;
}

/**
 * WU19: contadores reales de la cartera del entrenador para los KPIs del directorio.
 *
 * Se calculan con COUNT en el servidor (nunca desde la página cargada) y siempre describen la
 * cartera COMPLETA del coach, sin importar filtros, búsqueda o paginación de la lista.
 * - `activos`/`pausados`/`presenciales`/`remotos` excluyen archivados (igual que la UI).
 * - `morosos` cuenta alumnos con deuda vencida (misma regla que la bandeja del dashboard).
 */
export interface ResumenDirectorioAlumnosDTO {
  total: number;
  activos: number;
  pausados: number;
  morosos: number;
  presenciales: number;
  remotos: number;
  archivados: number;
}

/**
 * Lote Mis alumnos (2026-10-19): ítem del listado `GET /alumnos`. No incluye la ficha de salud
 * (`fichaSaludPrivada` solo se expone en el detalle `GET /alumnos/:id`). La racha es la EFECTIVA
 * (0 si la cadena se rompió) y `ultimaSesionFecha` es el último entrenamiento completado.
 */
export type AlumnoDirectorioItemDTO = Omit<
  PerfilAlumnoDetalleDTO,
  'fichaSaludPrivada' | 'ultimaSesionFecha' | 'rachaDias' | 'rachaUltimaFecha'
> & {
  ultimaSesionFecha: string | null;
  rachaDias: number;
  rachaUltimaFecha: string | null;
};

/** WU19: respuesta paginada de `GET /alumnos` (contrato interno consumido por el directorio). */
export interface DirectorioAlumnosDTO extends PaginadoDTO<AlumnoDirectorioItemDTO> {
  /** Contadores reales de la cartera completa para los KPIs (independientes de la página). */
  resumen: ResumenDirectorioAlumnosDTO;
}

/** WU-E (RF-011 RN-05): resultado del alta manual con el token para compartir el enlace de activación. */
export interface AltaManualAlumnoResultadoDTO {
  id: string;
  nombres: string;
  apellidos: string;
  email: string;
  edadCalculada: number;
  modalidad: Modalidad;
  estadoActivacion: EstadoAlumno;
  /** Token de un solo uso (TTL 48h) con el que el alumno crea su contraseña en `/activar`. */
  tokenInvitacion: string;
  /** `true` solo si el correo de bienvenida quedó realmente en camino (ver `EntrenadorCreadoDTO`). */
  correoEnviado: boolean;
  mensaje: string;
}
