import { z } from 'zod';
import {
  FotoAntropometriaInputSchema,
  PerimetrosCorporalesInputSchema,
  PlieguesCutaneosInputSchema,
  PresignedUploadUrlSchema,
  CheckinAntropometricoSchema,
  ConciliarAntropometriaSchema,
  FiltroEvolucionAntropometricaSchema,
  ConsultaComparadorFotograficoSchema,
} from '../schemas';
import {
  OrigenAntropometria,
  EstadoMedicion,
  AnguloFoto,
  Modalidad,
} from '../enums';
import type { PaginadoDTO } from './comunes';

// Tipos inferidos de DTOs - Antropometría & Bóveda R2 (Módulo 4)
export type FotoAntropometriaInputDTO = z.infer<typeof FotoAntropometriaInputSchema>;
export type PerimetrosCorporalesInputDTO = z.infer<typeof PerimetrosCorporalesInputSchema>;
export type PlieguesCutaneosInputDTO = z.infer<typeof PlieguesCutaneosInputSchema>;
export type PresignedUploadUrlDTO = z.infer<typeof PresignedUploadUrlSchema>;
export type CheckinAntropometricoDTO = z.infer<typeof CheckinAntropometricoSchema>;
export type ConciliarAntropometriaDTO = z.infer<typeof ConciliarAntropometriaSchema>;
export type FiltroEvolucionAntropometricaDTO = z.infer<typeof FiltroEvolucionAntropometricaSchema>;
export type ConsultaComparadorFotograficoDTO = z.infer<typeof ConsultaComparadorFotograficoSchema>;

// =============================================================================
// RESPUESTAS TIPADAS - CONTROL ANTROPOMÉTRICO & BÓVEDA R2 (MÓDULO 4)
// =============================================================================

export interface PresignedUploadUrlResponseDTO {
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
  key: string;
}

export interface FotoAntropometriaDetalleDTO {
  id: string;
  controlId: string;
  angulo: AnguloFoto;
  storageKey: string;
  presignedGetUrl?: string | null;
  createdAtUtc: string;
}

/**
 * RF-003 RN-02 (WU RF-003a): perímetros corporales del control.
 *
 * `brazoRelajadoCm`/`musloMedioCm` son los campos del RN-02; `brazoCm`/`musloCm` se conservan como
 * ALIAS LEGADOS (mismo valor) para no romper consumidores previos ni datos históricos.
 */
export interface PerimetrosCorporalesDTO {
  cuelloCm?: string | null;
  pechoCm?: string | null;
  cinturaCm?: string | null;
  caderaCm?: string | null;
  brazoRelajadoCm?: string | null;
  brazoContraidoCm?: string | null;
  musloMedioCm?: string | null;
  /** Alias legado de `brazoRelajadoCm`. */
  brazoCm?: string | null;
  /** Alias legado de `musloMedioCm`. */
  musloCm?: string | null;
}

/** RF-003 RN-02 (WU RF-003a): pliegues cutáneos en milímetros (composición corporal estimada). */
export interface PlieguesCutaneosDTO {
  tricepsMm?: string | null;
  subescapularMm?: string | null;
  suprailiacoMm?: string | null;
  abdominalMm?: string | null;
}

export interface ControlAntropometricoDetalleDTO {
  id: string;
  alumnoId: string;
  /**
   * WU20 (aditivo): nombre completo del alumno (nombres + apellidos) resuelto por el servidor.
   * Hoy solo lo completa la cola de pendientes; si falta, el cliente cae al ID recortado.
   */
  alumnoNombre?: string | null;
  fechaEvaluacion: string; // Formato YYYY-MM-DD
  pesoKg: string; // Decimal string con hasta 2 decimales (ej. "75.50")
  alturaCm?: string | null; // Decimal string con hasta 2 decimales (ej. "178.00")
  porcentajeGrasa?: string | null; // Decimal string con hasta 2 decimales (ej. "15.50")
  perimetros?: PerimetrosCorporalesDTO | null;
  /** RN-02: pliegues cutáneos (mm) cuando el control los registró. `null` si no aplica. */
  pliegues?: PlieguesCutaneosDTO | null;
  modalidad: Modalidad;
  origen: OrigenAntropometria;
  registradoPor: string; // UUID del autor del registro
  estado: EstadoMedicion;
  observacionesCoach?: string | null;
  motivoRechazo?: string | null;
  fechaAprobacionUtc?: string | null; // ISO 8601 UTC
  fotos: FotoAntropometriaDetalleDTO[];
  createdAtUtc: string; // ISO 8601 UTC
  updatedAtUtc: string; // ISO 8601 UTC
}

/**
 * WU24b: respuesta paginada de `GET /antropometria/pendientes` (cola de validación del coach).
 * `total` es el COUNT real de controles PENDIENTE_APROBACION del entrenador y el orden
 * (fechaEvaluacion descendente) se mantiene con desempate estable por `createdAtUtc`/`id`.
 */
export type ColaPendientesAntropometricosDTO = PaginadoDTO<ControlAntropometricoDetalleDTO>;

export interface EvolucionCorporalDTO {
  alumnoId: string;
  /**
   * COUNT real de controles aprobados que cumplen el filtro (independiente del slice).
   * Sin `controlesLimit`/`controlesOffset` coincide con `evaluaciones.length` (comportamiento histórico).
   */
  totalEvaluaciones: number;
  /** Alias explícito WU24b del total real de la serie: SIEMPRE presente. */
  controlesTotal: number;
  /**
   * Serie cronológica ascendente de controles aprobados. Sin `controlesLimit`/`controlesOffset`
   * viene COMPLETA (contrato de los charts del alumno); con ellos, el slice paginado en SQL.
   */
  evaluaciones: ControlAntropometricoDetalleDTO[];
  cambioNetoPesoKg?: string | null;
  cambioNetoGrasaPorcentaje?: string | null;
  rangoSeleccionado?: string | null;
}

export interface ComparativaAngularDTO {
  angulo: AnguloFoto;
  controlA: ControlAntropometricoDetalleDTO;
  controlB: ControlAntropometricoDetalleDTO;
  fotoA?: FotoAntropometriaDetalleDTO | null;
  fotoB?: FotoAntropometriaDetalleDTO | null;
  diferenciaPesoKg?: string | null;
  diferenciaGrasaPorcentaje?: string | null;
}
