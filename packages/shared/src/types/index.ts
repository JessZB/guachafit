import { z } from 'zod';
import {
  LoginUsuarioSchema,
  RefreshTokenSchema,
  CrearEntrenadorSchema,
  EstablecerPasswordConTokenSchema,
  AltaManualAlumnoSchema,
  RegistroPublicoAlumnoSchema,
  CambioEstadoAlumnoSchema,
  ActualizarPerfilAlumnoSchema,
  FiltroDirectorioAlumnosSchema,
  RestaurarAlumnoSchema,
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
  FotoComidaInputSchema,
  CheckinNutricionalSchema,
  FiltroSesionesAlumnoSchema,
  FiltroCheckinsNutricionalesSchema,
  FotoAntropometriaInputSchema,
  PerimetrosCorporalesInputSchema,
  PresignedUploadUrlSchema,
  CheckinAntropometricoSchema,
  ConciliarAntropometriaSchema,
  FiltroEvolucionAntropometricaSchema,
  ConsultaComparadorFotograficoSchema,
  CrearPlanMembresiaSchema,
  ActualizarPlanMembresiaSchema,
  CrearOverridePlanSchema,
  ActualizarOverridePlanSchema,
  EmitirCuotaSchema,
  ActualizarTasaCambioSchema,
  CalcularConversionSchema,
  ReportarPagoSchema,
  CobroDirectoSchema,
  CobroDirectoInteligenteSchema,
  ConciliarTransaccionSchema,
  PreferenciasNotificacionSchema,
  RegistrarDispositivoSchema,
  ActualizarTemaUiSchema,
  ActualizarPreferenciasNotificacionSchema,
  MarcarNotificacionLeidaSchema,
} from '../schemas';
import {
  Rol,
  TipoDocumento,
  Modalidad,
  EstadoAlumno,
  EstadoSesion,
  SemaforoNutricional,
  TipoComida,
  SemaforoAdherencia,
  EstadoCuota,
  Moneda,
  MetodoPago,
  EstadoConciliacion,
  OrigenAntropometria,
  EstadoMedicion,
  AnguloFoto,
  PeriodoEvolucion,
  ModuloUpload,
  PlataformaDispositivo,
} from '../enums';

// Tipos inferidos de DTOs - IAM & Onboarding
export type LoginUsuarioDTO = z.infer<typeof LoginUsuarioSchema>;
export type RefreshTokenDTO = z.infer<typeof RefreshTokenSchema>;
export type CrearEntrenadorDTO = z.infer<typeof CrearEntrenadorSchema>;
export type EstablecerPasswordConTokenDTO = z.infer<typeof EstablecerPasswordConTokenSchema>;
export type AltaManualAlumnoDTO = z.infer<typeof AltaManualAlumnoSchema>;
export type RegistroPublicoAlumnoDTO = z.infer<typeof RegistroPublicoAlumnoSchema>;
export type CambioEstadoAlumnoDTO = z.infer<typeof CambioEstadoAlumnoSchema>;
export type ActualizarPerfilAlumnoDTO = z.infer<typeof ActualizarPerfilAlumnoSchema>;
export type FiltroDirectorioAlumnosDTO = z.infer<typeof FiltroDirectorioAlumnosSchema>;
export type RestaurarAlumnoDTO = z.infer<typeof RestaurarAlumnoSchema>;

// Tipos inferidos de DTOs - Entrenamiento & Nutrición (Módulo 3)
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
export type FotoComidaInputDTO = z.infer<typeof FotoComidaInputSchema>;
export type CheckinNutricionalDTO = z.infer<typeof CheckinNutricionalSchema>;
export type FiltroSesionesAlumnoDTO = z.infer<typeof FiltroSesionesAlumnoSchema>;
export type FiltroCheckinsNutricionalesDTO = z.infer<typeof FiltroCheckinsNutricionalesSchema>;

// Tipos inferidos de DTOs - Antropometría & Bóveda R2 (Módulo 4)
export type FotoAntropometriaInputDTO = z.infer<typeof FotoAntropometriaInputSchema>;
export type PerimetrosCorporalesInputDTO = z.infer<typeof PerimetrosCorporalesInputSchema>;
export type PresignedUploadUrlDTO = z.infer<typeof PresignedUploadUrlSchema>;
export type CheckinAntropometricoDTO = z.infer<typeof CheckinAntropometricoSchema>;
export type ConciliarAntropometriaDTO = z.infer<typeof ConciliarAntropometriaSchema>;
export type FiltroEvolucionAntropometricaDTO = z.infer<typeof FiltroEvolucionAntropometricaSchema>;
export type ConsultaComparadorFotograficoDTO = z.infer<typeof ConsultaComparadorFotograficoSchema>;

// Finanzas & Deuda Maestra Bimonetaria DTOs (Módulo 2)
export type CrearPlanMembresiaDTO = z.infer<typeof CrearPlanMembresiaSchema>;
export type ActualizarPlanMembresiaDTO = z.infer<typeof ActualizarPlanMembresiaSchema>;
export type CrearOverridePlanDTO = z.infer<typeof CrearOverridePlanSchema>;
export type ActualizarOverridePlanDTO = z.infer<typeof ActualizarOverridePlanSchema>;
export type EmitirCuotaDTO = z.infer<typeof EmitirCuotaSchema>;
export type ActualizarTasaCambioDTO = z.infer<typeof ActualizarTasaCambioSchema>;
export type CalcularConversionDTO = z.infer<typeof CalcularConversionSchema>;
export type ReportarPagoDTO = z.infer<typeof ReportarPagoSchema>;
export type CobroDirectoDTO = z.infer<typeof CobroDirectoSchema>;
export type CobroDirectoInteligenteDTO = z.infer<typeof CobroDirectoInteligenteSchema>;
export type ConciliarTransaccionDTO = z.infer<typeof ConciliarTransaccionSchema>;

// Notificaciones & Preferencias DTOs
export type PreferenciasNotificacionInputDTO = z.infer<typeof PreferenciasNotificacionSchema>;
export type ActualizarPreferenciasNotificacionDTO = z.infer<typeof ActualizarPreferenciasNotificacionSchema>;
export type RegistrarDispositivoDTO = z.infer<typeof RegistrarDispositivoSchema>;
export type MarcarNotificacionLeidaDTO = z.infer<typeof MarcarNotificacionLeidaSchema>;
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
  rol: Rol;
  entrenadorId?: string;
  iat?: number;
  exp?: number;
}

// Respuestas tipadas de IAM y Usuarios
export interface AuthUserDTO {
  id: string;
  email: string;
  rol: Rol;
  entrenadorId?: string;
}

export interface AuthTokensResponseDTO {
  mensaje: string;
  accessToken: string;
  refreshToken?: string;
  usuario: AuthUserDTO;
}

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
  tasaFijadaOverride?: string | null;
  fichaSaludPrivada?: string | null; // Cifrado AES-256-GCM solo visible para el coach
  planActivoId?: string | null;
  planActivoNombre?: string | null;
  precioAcordadoOverride?: string | null;
  semaforoPago?: 'al_dia' | 'por_vencer' | 'moroso' | 'sin_cuota';
  ultimaSesionFecha?: string | null;
  deletedAtUtc?: string | null;
  createdAtUtc: string;
}

export interface ResumenFinancieroAlumnoDTO {
  alumnoId: string;
  usuarioId: string;
  saldoPendienteTotalUsd: string;
  totalPagadoHistoricoUsd: string;
  totalPagadoMesActualUsd: string;
  cuotaMesActual?: {
    id: string;
    periodo: string;
    montoTotalUsd: string;
    montoPagadoUsd: string;
    saldoPendienteUsd: string;
    estado: string;
    fechaVencimiento: string;
  } | null;
  transacciones: Array<{
    id: string;
    cuotaId: string;
    montoUsd: string;
    montoBs?: string;
    metodoPago: string;
    referencia?: string;
    estado: string;
    createdAtUtc: string;
  }>;
}

export interface DashboardComandoDTO {
  kpisMacro: {
    alumnosActivos: number;
    capacidadMaxima: number;
    porcentajeOcupacion: string;
    cobranzaMesUsd: string;
    metaCobranzaMesUsd: string;
    porcentajeCobranza: string;
    tasaAdherenciaSemanal: string;
    alumnosEnRiesgo: number;
  };
  bandejasRapidas: {
    pagosPorConciliar: number;
    checkinsAntropometricosPendientes: number;
    alumnosEnMora: Array<{
      alumnoId: string;
      nombre: string;
      cuotaId: string;
      saldoPendienteUsd: string;
      diasVencido: number;
    }>;
    alumnosInactivosEntrenamiento: Array<{
      alumnoId: string;
      nombre: string;
      diasSinEntrenar: number;
    }>;
  };
}

// =============================================================================
// RESPUESTAS TIPADAS - FINANZAS, COBRANZA & CONCILIACIÓN (MÓDULO 2)
// =============================================================================

export interface PlanMembresiaDetalleDTO {
  id: string;
  entrenadorId: string;
  nombre: string;
  descripcion?: string | null;
  beneficios: string[];
  precioBaseUsd: string;
  duracionMeses: number;
  activo: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface OverridePlanDetalleDTO {
  id: string;
  planId: string;
  clienteId: string;
  precioAcordadoUsd?: string | null;
  tasaFijadaOverride?: string | null;
  beneficiosPersonalizados?: string[] | null;
  motivoOverride?: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface TransaccionPagoDetalleDTO {
  id: string;
  cuotaId: string;
  clienteId: string;
  entrenadorId: string;
  registradoPor: string;
  montoOriginal: string;
  monedaOriginal: Moneda;
  tasaCambioFijada: string;
  montoEquivalenteUsd: string;
  metodoPago: MetodoPago;
  referenciaBancaria?: string | null;
  fechaOperacion: string; // Formato YYYY-MM-DD
  comprobanteStorageKey?: string | null;
  comprobanteUrl?: string | null;
  estadoConciliacion: EstadoConciliacion;
  motivoRechazo?: string | null;
  fechaReporteUtc: string;
  fechaConciliacionUtc?: string | null;
  clienteNombre?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface CuotaDetalleDTO {
  id: string;
  clienteId: string;
  entrenadorId: string;
  planId: string;
  periodo: string; // Formato YYYY-MM
  montoTotalUsd: string;
  montoAbonadoUsd: string;
  saldoPendienteUsd: string;
  saldoPendienteVes?: string;
  tasaAplicada?: string;
  fechaEmisionUtc: string;
  fechaCorteUtc: string;
  estado: EstadoCuota;
  notas?: string | null;
  planNombre?: string;
  clienteNombre?: string;
  transacciones?: TransaccionPagoDetalleDTO[];
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface CalculoConversionDTO {
  montoOriginal: string;
  monedaOriginal: Moneda;
  montoConvertido: string;
  monedaConvertida: Moneda;
  tasaAplicada: string;
  fuenteTasa: 'oficial_bcv' | 'paralelo' | 'entrenador_activa' | 'override_cliente';
  esTasaOverride: boolean;
  fechaCalculoUtc: string;
}

export interface TasaCambioVigenteDTO {
  id?: string;
  entrenadorId: string;
  tasaOficialBcv: string;
  tasaParalelo?: string | null;
  tasaActivaEntrenador: string;
  tasaAcordadaCliente?: string | null;
  tasaEfectiva: string;
  fuente: string;
  fechaActualizacionUtc: string;
}

// =============================================================================
// RESPUESTAS TIPADAS - ENTRENAMIENTO & NUTRICIÓN (MÓDULO 3)
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
  pesoKg?: string | null;
  rpe?: string | null;
  descansoSegundos?: number | null;
  completada: boolean;
  timestampCompletadaUtc?: string | null;
}

export interface EjercicioSesionDetalleDTO {
  id: string;
  sesionId: string;
  ejercicioId: string;
  orden: number;
  notasCoach?: string | null;
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

export interface FotoComidaDetalleDTO {
  id: string;
  checkinId: string;
  tipoComida: TipoComida;
  storageKey: string;
  fotoUrl?: string | null;
  createdAtUtc: string;
}

export interface CheckinNutricionalDetalleDTO {
  id: string;
  alumnoId: string;
  fecha: string; // Formato YYYY-MM-DD
  semaforo: SemaforoNutricional;
  caloriasReportadas?: number | null;
  proteinaGramosReportada?: number | null;
  aguaLitros?: string | null; // Decimal string con hasta 2 decimales
  notasAlumno?: string | null;
  fotosPlatos: FotoComidaDetalleDTO[];
  alumnoNombre?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface MonitorAdherenciaSemanalDTO {
  alumnoId: string;
  nombreCompleto: string;
  sesionesPrescritas: number;
  sesionesCompletadas: number;
  porcentajeCumplimientoSemanal: string; // Decimal string con hasta 2 decimales (ej. "80.00")
  semaforoAdherencia: SemaforoAdherencia;
  rachaDiasConsecutivos: number;
  diasInactivo: number;
  ultimaSesionUtc?: string | null;
}

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

export interface PerimetrosCorporalesDTO {
  cuelloCm?: string | null;
  pechoCm?: string | null;
  cinturaCm?: string | null;
  caderaCm?: string | null;
  brazoCm?: string | null;
  musloCm?: string | null;
}

export interface ControlAntropometricoDetalleDTO {
  id: string;
  alumnoId: string;
  fechaEvaluacion: string; // Formato YYYY-MM-DD
  pesoKg: string; // Decimal string con hasta 2 decimales (ej. "75.50")
  alturaCm?: string | null; // Decimal string con hasta 2 decimales (ej. "178.00")
  porcentajeGrasa?: string | null; // Decimal string con hasta 2 decimales (ej. "15.50")
  perimetros?: PerimetrosCorporalesDTO | null;
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

export interface EvolucionCorporalDTO {
  alumnoId: string;
  totalEvaluaciones: number;
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

// =============================================================================
// NOTIFICACIONES & DISPOSITIVOS DTOs (RF-014, RF-015, RF-016)
// =============================================================================

export interface PreferenciasNotificacionDTO {
  id: string;
  usuarioId: string;
  notifyPaymentsPush: boolean;
  notifyPaymentsEmail: boolean;
  notifyWorkoutsPush: boolean;
  notifyWorkoutsEmail: boolean;
  notifyCheckinsPush: boolean;
  notifyCheckinsEmail: boolean;
  digestWeeklyEmail: boolean;
  updatedAtUtc: string;
}

export interface RegistrarDispositivoPushDTO {
  deviceToken: string;
  platform: PlataformaDispositivo;
}

export interface DispositivoUsuarioDTO {
  id: string;
  usuarioId: string;
  deviceToken: string;
  platform: PlataformaDispositivo;
  isActive: boolean;
  updatedAtUtc: string;
}

export interface NotificacionInAppDTO {
  id: string;
  usuarioId: string;
  titulo: string;
  cuerpo: string;
  tipoEvento: string;
  leida: boolean;
  linkAccion?: string | null;
  createdAtUtc: string;
}

export type CategoriaNotificacion =
  | 'FINANZAS'
  | 'ENTRENAMIENTO'
  | 'ANTROPOMETRIA'
  | 'RESUMEN_SEMANAL'
  | 'SEGURIDAD';

export interface EventoNotificacionPayload {
  tipoEvento: string;
  destinatarioUserId: string;
  entrenadorId?: string;
  titulo: string;
  cuerpo: string;
  categoria: CategoriaNotificacion;
  linkAccion?: string | null;
  datosAdicionales?: Record<string, any>;
  esCriticoSeguridad?: boolean;
  timestampUtc?: string;
}

