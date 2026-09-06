import { z } from 'zod';
import {
  EstablecerPasswordConTokenSchema,
  AltaManualAlumnoSchema,
  RegistroPublicoAlumnoSchema,
  CambioEstadoAlumnoSchema,
  IniciarSesionSchema,
  RegistrarSerieSchema,
  SincronizarSeriesBatchSchema,
  FinalizarSesionSchema,
  CheckinNutricionalSchema,
  PresignedUploadUrlSchema,
  CheckinAntropometricoSchema,
  ConciliarAntropometriaSchema,
  ReportarPagoSchema,
  CobroDirectoSchema,
  ConciliarTransaccionSchema,
  PreferenciasNotificacionSchema,
  RegistrarDispositivoSchema,
  ActualizarTemaUiSchema,
} from '../schemas';

// Tipos inferidos de DTOs
export type EstablecerPasswordConTokenDTO = z.infer<typeof EstablecerPasswordConTokenSchema>;
export type AltaManualAlumnoDTO = z.infer<typeof AltaManualAlumnoSchema>;
export type RegistroPublicoAlumnoDTO = z.infer<typeof RegistroPublicoAlumnoSchema>;
export type CambioEstadoAlumnoDTO = z.infer<typeof CambioEstadoAlumnoSchema>;
export type IniciarSesionDTO = z.infer<typeof IniciarSesionSchema>;
export type RegistrarSerieDTO = z.infer<typeof RegistrarSerieSchema>;
export type SincronizarSeriesBatchDTO = z.infer<typeof SincronizarSeriesBatchSchema>;
export type FinalizarSesionDTO = z.infer<typeof FinalizarSesionSchema>;
export type CheckinNutricionalDTO = z.infer<typeof CheckinNutricionalSchema>;
export type PresignedUploadUrlDTO = z.infer<typeof PresignedUploadUrlSchema>;
export type CheckinAntropometricoDTO = z.infer<typeof CheckinAntropometricoSchema>;
export type ConciliarAntropometriaDTO = z.infer<typeof ConciliarAntropometriaSchema>;
export type ReportarPagoDTO = z.infer<typeof ReportarPagoSchema>;
export type CobroDirectoDTO = z.infer<typeof CobroDirectoSchema>;
export type ConciliarTransaccionDTO = z.infer<typeof ConciliarTransaccionSchema>;
export type PreferenciasNotificacionDTO = z.infer<typeof PreferenciasNotificacionSchema>;
export type RegistrarDispositivoDTO = z.infer<typeof RegistrarDispositivoSchema>;
export type ActualizarTemaUiDTO = z.infer<typeof ActualizarTemaUiSchema>;

// Estructura de error RFC 7807
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code?: string;
  invalidParams?: Array<{ field: string; reason: string }>;
  timestampUtc: string;
}

// Token Claims JWT
export interface JwtPayload {
  sub: string;
  email: string;
  rol: string;
  entrenadorId?: string;
  iat?: number;
  exp?: number;
}
