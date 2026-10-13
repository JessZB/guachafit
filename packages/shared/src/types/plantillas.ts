import { z } from 'zod';
import {
  CrearPlantillaRutinaSchema,
  ActualizarPlantillaRutinaSchema,
  AjusteEjercicioPlantillaSchema,
  AsignarPlantillaSchema,
} from '../schemas';
import {
  NivelObjetivoPlantilla,
  ModoAsignacionPlantilla,
} from '../enums';
import type { BloqueDiaRutinaDTO } from './entrenamiento';

// Tipos inferidos de DTOs - Banco de plantillas de rutina (RF-017)
export type CrearPlantillaRutinaDTO = z.infer<typeof CrearPlantillaRutinaSchema>;
export type ActualizarPlantillaRutinaDTO = z.infer<typeof ActualizarPlantillaRutinaSchema>;
export type AjusteEjercicioPlantillaDTO = z.infer<typeof AjusteEjercicioPlantillaSchema>;
export type AsignarPlantillaDTO = z.infer<typeof AsignarPlantillaSchema>;

// =============================================================================
// RESPUESTAS TIPADAS - BANCO DE PLANTILLAS DE RUTINA (RF-017)
// =============================================================================

/** Plantilla completa (detalle) del banco del entrenador. */
export interface PlantillaRutinaDTO {
  id: string;
  entrenadorId: string;
  nombre: string;
  nivelObjetivo: NivelObjetivoPlantilla;
  bloques: BloqueDiaRutinaDTO[];
  activa: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

/** Resumen de plantilla para el listado de la biblioteca (sin bloques embebidos). */
export interface PlantillaRutinaResumenDTO {
  id: string;
  entrenadorId: string;
  nombre: string;
  nivelObjetivo: NivelObjetivoPlantilla;
  totalDias: number;
  totalEjercicios: number;
  activa: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

/**
 * Resultado por alumno de una asignación de plantilla (RF-017 RN-03).
 * `exito=false` no aborta la operación de los demás alumnos; `error` explica el fallo.
 */
export interface ResultadoAsignacionAlumnoDTO {
  alumnoId: string;
  /** `usuarios.id` resuelto cuando el alumno se identificó por `perfiles_alumno.id`. */
  usuarioId?: string | null;
  exito: boolean;
  rutinaId?: string | null;
  rutinaNombre?: string | null;
  bloquesTotal?: number | null;
  error?: string | null;
}

/** Respuesta de `POST /plantillas/:id/asignar` con reporte de éxito/fallo por alumno. */
export interface AsignacionPlantillaResponseDTO {
  plantillaId: string;
  modo: ModoAsignacionPlantilla;
  totalSolicitados: number;
  exitosos: number;
  fallidos: number;
  resultados: ResultadoAsignacionAlumnoDTO[];
}
