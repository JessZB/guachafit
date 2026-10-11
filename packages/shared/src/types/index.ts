import { z } from 'zod';
import {
  LoginUsuarioSchema,
  RefreshTokenSchema,
  CrearEntrenadorSchema,
  EstablecerPasswordConTokenSchema,
  SolicitarRecuperacionPasswordSchema,
  RestablecerPasswordSchema,
  ActualizarMiPerfilSchema,
  CambiarPasswordSchema,
  SolicitarCambioCorreoSchema,
  ConfirmarCambioCorreoSchema,
  ListarEntrenadoresAdminQuerySchema,
  CambiarEstadoEntrenadorSchema,
  CambiarLicenciaEntrenadorSchema,
  AltaManualAlumnoSchema,
  RegistroPublicoAlumnoSchema,
  CambioEstadoAlumnoSchema,
  ActualizarPerfilAlumnoSchema,
  ActualizarZonaHorariaAlumnoSchema,
  FiltroDirectorioAlumnosSchema,
  RestaurarAlumnoSchema,
  CrearEjercicioCatalogoSchema,
  ActualizarEjercicioCatalogoSchema,
  SeriePrescritaInputSchema,
  EjercicioPrescritoInputSchema,
  CrearSesionEntrenamientoSchema,
  BloqueDiaRutinaSchema,
  GuardarRutinaSemanalSchema,
  CrearPlantillaRutinaSchema,
  ActualizarPlantillaRutinaSchema,
  AjusteEjercicioPlantillaSchema,
  AsignarPlantillaSchema,
  IniciarSesionSchema,
  RegistrarSerieSchema,
  SincronizarSeriesBatchSchema,
  FinalizarSesionSchema,
  FotoComidaInputSchema,
  CheckinNutricionalSchema,
  MetasNutricionalesSchema,
  RecursoNutricionalSchema,
  FiltroSesionesAlumnoSchema,
  FiltroCheckinsNutricionalesSchema,
  FiltroMonitorAdherenciaSchema,
  SemaforoFiltroMonitorSchema,
  FotoAntropometriaInputSchema,
  PerimetrosCorporalesInputSchema,
  PlieguesCutaneosInputSchema,
  PresignedUploadUrlSchema,
  CheckinAntropometricoSchema,
  ConciliarAntropometriaSchema,
  FiltroEvolucionAntropometricaSchema,
  ConsultaComparadorFotograficoSchema,
  CrearPlanMembresiaSchema,
  ActualizarPlanMembresiaSchema,
  CrearOverridePlanSchema,
  ActualizarTasaCambioSchema,
  CalcularConversionSchema,
  ReportarPagoSchema,
  CobroDirectoSchema,
  CobroDirectoInteligenteSchema,
  ConciliarTransaccionSchema,
  AsignarSuscripcionSchema,
  PreferenciasNotificacionSchema,
  RegistrarDispositivoSchema,
  ActualizarTemaUiSchema,
  ActualizarPreferenciasNotificacionSchema,
  MarcarNotificacionLeidaSchema,
  FiltroBandejaInAppSchema,
  PestanaCarteraSchema,
  FiltroCarteraSchema,
} from '../schemas';
import type {
  CampoPreferenciaNotificacion,
  CanalPreferenciaNotificacion,
  CategoriaNotificacion,
  CategoriaPreferenciaNotificacion,
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
  MotivoOmision,
  NivelObjetivoPlantilla,
  ModoAsignacionPlantilla,
  EstadoLicencia,
  PeriodicidadAntropometria,
} from '../enums';

// Tipos inferidos de DTOs - IAM & Onboarding
export type LoginUsuarioDTO = z.infer<typeof LoginUsuarioSchema>;
export type RefreshTokenDTO = z.infer<typeof RefreshTokenSchema>;
export type CrearEntrenadorDTO = z.infer<typeof CrearEntrenadorSchema>;
export type EstablecerPasswordConTokenDTO = z.infer<typeof EstablecerPasswordConTokenSchema>;
export type SolicitarRecuperacionPasswordDTO = z.infer<typeof SolicitarRecuperacionPasswordSchema>;
export type RestablecerPasswordDTO = z.infer<typeof RestablecerPasswordSchema>;
export type ActualizarMiPerfilDTO = z.infer<typeof ActualizarMiPerfilSchema>;
export type CambiarPasswordDTO = z.infer<typeof CambiarPasswordSchema>;
export type SolicitarCambioCorreoDTO = z.infer<typeof SolicitarCambioCorreoSchema>;
export type ConfirmarCambioCorreoDTO = z.infer<typeof ConfirmarCambioCorreoSchema>;

/**
 * RF-018: perfil propio de cualquier rol (`GET /usuarios/me/perfil`). El alumno trae su ficha
 * (documento y fecha de nacimiento solo de lectura); el entrenador, la suya; el superadmin no tiene
 * ficha. Nunca incluye contraseñas ni hashes de tokens.
 */
export interface MiPerfilDTO {
  id: string;
  email: string;
  rol: Rol;
  /** Correo nuevo esperando confirmación (RF-018 RN-05) o `null`. */
  correoPendiente: string | null;
  correoPendienteExpiraUtc: string | null;
  alumno: {
    nombres: string;
    apellidos: string;
    telefonoWhatsapp: string;
    tipoDocumento: TipoDocumento;
    numeroDocumento: string;
    fechaNacimiento: string;
    zonaHoraria: string;
  } | null;
  entrenador: {
    nombres: string;
    apellidos: string;
    nombreComercial: string | null;
    telefonoContacto: string;
  } | null;
}

/** RF-018 RN-04/RN-05: respuesta de `POST /usuarios/me/correo`. */
export interface SolicitudCambioCorreoDTO {
  mensaje: string;
  correoPendiente: string;
  expiraUtc: string;
  /** `true` solo si el correo de confirmación quedó realmente en camino. */
  correoEnviado: boolean;
  /** Solo fuera de producción y si el correo no salió (pruebas sin proveedor). */
  enlaceConfirmacion?: string;
}
export type ListarEntrenadoresAdminQueryDTO = z.infer<typeof ListarEntrenadoresAdminQuerySchema>;
export type CambiarEstadoEntrenadorDTO = z.infer<typeof CambiarEstadoEntrenadorSchema>;
export type CambiarLicenciaEntrenadorDTO = z.infer<typeof CambiarLicenciaEntrenadorSchema>;
export type AltaManualAlumnoDTO = z.infer<typeof AltaManualAlumnoSchema>;
export type RegistroPublicoAlumnoDTO = z.infer<typeof RegistroPublicoAlumnoSchema>;
export type CambioEstadoAlumnoDTO = z.infer<typeof CambioEstadoAlumnoSchema>;
export type ActualizarPerfilAlumnoDTO = z.infer<typeof ActualizarPerfilAlumnoSchema>;
export type ActualizarZonaHorariaAlumnoDTO = z.infer<typeof ActualizarZonaHorariaAlumnoSchema>;
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
export type CrearPlantillaRutinaDTO = z.infer<typeof CrearPlantillaRutinaSchema>;
export type ActualizarPlantillaRutinaDTO = z.infer<typeof ActualizarPlantillaRutinaSchema>;
export type AjusteEjercicioPlantillaDTO = z.infer<typeof AjusteEjercicioPlantillaSchema>;
export type AsignarPlantillaDTO = z.infer<typeof AsignarPlantillaSchema>;
export type IniciarSesionDTO = z.infer<typeof IniciarSesionSchema>;
export type RegistrarSerieDTO = z.infer<typeof RegistrarSerieSchema>;
export type SincronizarSeriesBatchDTO = z.infer<typeof SincronizarSeriesBatchSchema>;
export type FinalizarSesionDTO = z.infer<typeof FinalizarSesionSchema>;
export type FotoComidaInputDTO = z.infer<typeof FotoComidaInputSchema>;
export type CheckinNutricionalDTO = z.infer<typeof CheckinNutricionalSchema>;
export type MetasNutricionalesDTO = z.infer<typeof MetasNutricionalesSchema>;
export type RecursoNutricionalDTO = z.infer<typeof RecursoNutricionalSchema>;

/**
 * RF-002 RN-01: recurso educativo ya resuelto para lectura. `url` es la URL externa tal cual o
 * la URL firmada de la bóveda (presigned GET, TTL del proyecto) del archivo subido; queda `null`
 * si la firma falla o no hay bóveda configurada (degradación honesta, nunca un enlace fabricado).
 * `storageKey` solo está presente cuando el recurso es un archivo subido.
 */
export interface RecursoNutricionalDetalleDTO {
  titulo: string;
  url: string | null;
  storageKey: string | null;
}
export type FiltroSesionesAlumnoDTO = z.infer<typeof FiltroSesionesAlumnoSchema>;
export type FiltroCheckinsNutricionalesDTO = z.infer<typeof FiltroCheckinsNutricionalesSchema>;
/** WU25a: filtros server-side del monitor de adherencia (q + semáforo + orden). */
export type FiltroMonitorAdherenciaDTO = z.infer<typeof FiltroMonitorAdherenciaSchema>;
export type SemaforoFiltroMonitorDTO = z.infer<typeof SemaforoFiltroMonitorSchema>;

// Tipos inferidos de DTOs - Antropometría & Bóveda R2 (Módulo 4)
export type FotoAntropometriaInputDTO = z.infer<typeof FotoAntropometriaInputSchema>;
export type PerimetrosCorporalesInputDTO = z.infer<typeof PerimetrosCorporalesInputSchema>;
export type PlieguesCutaneosInputDTO = z.infer<typeof PlieguesCutaneosInputSchema>;
export type PresignedUploadUrlDTO = z.infer<typeof PresignedUploadUrlSchema>;
export type CheckinAntropometricoDTO = z.infer<typeof CheckinAntropometricoSchema>;
export type ConciliarAntropometriaDTO = z.infer<typeof ConciliarAntropometriaSchema>;
export type FiltroEvolucionAntropometricaDTO = z.infer<typeof FiltroEvolucionAntropometricaSchema>;
export type ConsultaComparadorFotograficoDTO = z.infer<typeof ConsultaComparadorFotograficoSchema>;

// Finanzas & Deuda Maestra Bimonetaria DTOs (Módulo 2)
export type CrearPlanMembresiaDTO = z.infer<typeof CrearPlanMembresiaSchema>;
export type ActualizarPlanMembresiaDTO = z.infer<typeof ActualizarPlanMembresiaSchema>;
export type CrearOverridePlanDTO = z.infer<typeof CrearOverridePlanSchema>;
export type ActualizarTasaCambioDTO = z.infer<typeof ActualizarTasaCambioSchema>;
export type CalcularConversionDTO = z.infer<typeof CalcularConversionSchema>;
export type ReportarPagoDTO = z.infer<typeof ReportarPagoSchema>;
export type CobroDirectoDTO = z.infer<typeof CobroDirectoSchema>;
export type CobroDirectoInteligenteDTO = z.infer<typeof CobroDirectoInteligenteSchema>;
export type ConciliarTransaccionDTO = z.infer<typeof ConciliarTransaccionSchema>;
export type AsignarSuscripcionDTO = z.infer<typeof AsignarSuscripcionSchema>;
/** WU-I (RF-009): filtros server-side del tablero de cartera (`q`, `pestana`, `limit`, `offset`). */
export type FiltroCarteraDTO = z.infer<typeof FiltroCarteraSchema>;

// Notificaciones & Preferencias DTOs
export type PreferenciasNotificacionInputDTO = z.infer<typeof PreferenciasNotificacionSchema>;
export type ActualizarPreferenciasNotificacionDTO = z.infer<typeof ActualizarPreferenciasNotificacionSchema>;
export type RegistrarDispositivoDTO = z.infer<typeof RegistrarDispositivoSchema>;
export type MarcarNotificacionLeidaDTO = z.infer<typeof MarcarNotificacionLeidaSchema>;
/** RF-014 (Ola 3): filtros de la bandeja In-App (`limit`, `offset`, `soloNoLeidas`). */
export type FiltroBandejaInAppDTO = z.infer<typeof FiltroBandejaInAppSchema>;
export type ActualizarTemaUiDTO = z.infer<typeof ActualizarTemaUiSchema>;

// Estructura de error RFC 7807
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  /**
   * D7: código máquina estable y canónico para errores de negocio que la UI debe distinguir
   * (p. ej. `SESION_VACIA` en el cierre de sesión sin series completadas).
   * Campo único alineado al esquema estándar RFC 7807 §1 del doc de contratos.
   */
  code?: string;
  /** Mensaje humano del error tal como lo emite la API (NestJS lo incluye en el cuerpo). */
  message?: string;
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
  /**
   * RF-003 RN-03/RN-04 (WU RF-003a): modalidad del perfil del alumno para que la web pueda poner
   * el formulario antropométrico en solo lectura sin una petición extra. Es `null` para los roles
   * sin perfil de alumno (entrenador/superadmin).
   */
  modalidad?: Modalidad | null;
  /**
   * RF-003 RN-01/RN-04 (WU RF-003b): calendario antropométrico del alumno para que la web pueda
   * mostrar su ventana de check-in (`GET /auth/me` lo re-resuelve del perfil, igual que la
   * modalidad). `null` = sin calendario; también `null` para roles sin perfil de alumno.
   */
  periodicidadAntropometria?: PeriodicidadAntropometria | null;
  /** Ancla (YYYY-MM-DD, día local del alumno) del calendario de periodicidad antropométrica. */
  antropometriaInicio?: string | null;
  /**
   * LOTE API-N2: zona horaria (IANA) del perfil del alumno, la que decide la ventana y el plazo del
   * reporte nutricional. `GET /auth/me` la re-resuelve del perfil; `null` para roles sin perfil de
   * alumno.
   */
  zonaHoraria?: string | null;
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
 * WU24: envelope de paginación server-side compartido por los listados del coach.
 *
 * `total` es el COUNT REAL de filas que cumplen el filtro (nunca el tamaño de `items`), de modo
 * que la UI puede mostrar "Mostrando X de N" y pedir la siguiente página con `offset` sin
 * repetir ni saltar filas. `limit`/`offset` son la página efectiva aplicada por el servidor.
 */
export interface PaginadoDTO<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
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

/** WU19: respuesta paginada de `GET /alumnos` (contrato interno consumido por el directorio). */
export interface DirectorioAlumnosDTO extends PaginadoDTO<PerfilAlumnoDetalleDTO> {
  /** Contadores reales de la cartera completa para los KPIs (independientes de la página). */
  resumen: ResumenDirectorioAlumnosDTO;
}

/**
 * WU-E (RF-011): perfil operativo del entrenador autenticado.
 * Expone el `coachCode` REAL de la BD (nunca un valor hardcodeado en el cliente) para construir
 * el enlace único de captación.
 */
export interface PerfilEntrenadorDTO {
  id: string;
  usuarioId: string;
  nombres: string;
  apellidos: string;
  nombreComercial: string | null;
  coachCode: string;
  estadoLicencia: EstadoLicencia;
  capacidadMaxima: number;
  telefonoContacto: string;
}

/**
 * RF-010 Escenario 1: resultado del alta de entrenador por el Superadmin.
 * `tokenInvitacion` es el token crudo de un solo uso (TTL 48h) con el que el entrenador crea su
 * contraseña; la API devuelve `null` cuando el alta se hace con contraseña directa.
 */
export interface EntrenadorCreadoDTO {
  id: string;
  usuarioId: string;
  nombres: string;
  apellidos: string;
  email: string;
  coachCode: string;
  tokenInvitacion: string | null;
  /**
   * `true` solo si el correo de bienvenida quedó realmente en camino (proveedor configurado y
   * encolado confirmado). Con `false` la web pide compartir el enlace a mano.
   */
  correoEnviado: boolean;
  mensaje: string;
}

/**
 * RF-010 RN-01 (WU Admin): fila del listado de entrenadores del panel maestro.
 *
 * `usuarioId` es el identificador de la CUENTA (`usuarios.id`) y la clave de las mutaciones
 * `PATCH /auth/entrenadores/:id/...`; `perfilId` es el id de `perfiles_entrenador`.
 */
export interface EntrenadorAdminDTO {
  usuarioId: string;
  perfilId: string;
  nombres: string;
  apellidos: string;
  nombreComercial: string | null;
  email: string;
  coachCode: string;
  estadoLicencia: EstadoLicencia;
  /** `usuarios.activo`: `false` = cuenta deshabilitada por el Superadmin. */
  activo: boolean;
  /** Fecha de alta de la cuenta (ISO 8601 UTC). */
  fechaAltaUtc: string;
}

/** RF-010 RN-01: listado paginado de entrenadores para el panel maestro (envelope estándar). */
export type ListadoEntrenadoresAdminDTO = PaginadoDTO<EntrenadorAdminDTO>;

/** RF-010 RN-01/§6: resultado de habilitar o deshabilitar una cuenta de entrenador. */
export interface CambioEstadoEntrenadorResultadoDTO {
  usuarioId: string;
  activo: boolean;
  /** `true` cuando la mutación cambió el estado; `false` cuando ya estaba en ese estado. */
  cambioAplicado: boolean;
  mensaje: string;
}

/** RF-010 RN-01: resultado de activar o suspender la licencia de un entrenador. */
export interface CambioLicenciaEntrenadorResultadoDTO {
  usuarioId: string;
  estadoLicencia: EstadoLicencia;
  /** `true` cuando la mutación cambió el estado; `false` cuando ya estaba en ese estado. */
  cambioAplicado: boolean;
  mensaje: string;
}

/**
 * WU-E (RF-011 RN-06/RN-07.1): resolución pública del `coach_code` de un enlace de captación.
 * Solo datos de identidad comercial del coach; jamás información sensible (licencia, contacto,
 * cartera o identidad legal completa).
 */
export interface CoachPublicoDTO {
  coachCode: string;
  /** Nombre humano del coach (`nombres apellidos`). */
  nombre: string;
  /** Marca/gimnasio del coach si lo configuró; `null` si no existe. */
  nombreComercial: string | null;
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
  /**
   * WU24b: COUNT real de transacciones del alumno (independiente del slice paginado).
   * SIEMPRE presente, también cuando no se envían `txLimit`/`txOffset`.
   */
  transaccionesTotal: number;
  /**
   * WU24b: sin `txLimit`/`txOffset` devuelve TODAS las transacciones (comportamiento histórico);
   * con ellos, el slice paginado en SQL (los agregados del resumen siguen siendo del total).
   */
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
    /**
     * Meta de cobranza del mes = suma de las cuotas emitidas del periodo.
     * `null` cuando no hay ninguna cuota emitida: sin meta real el cliente muestra
     * "Sin meta de cobranza configurada" y NUNCA un valor heurístico inventado.
     */
    metaCobranzaMesUsd: string | null;
    /** `cobranzaMesUsd / metaCobranzaMesUsd * 100`; `null` cuando no hay meta real. */
    porcentajeCobranza: string | null;
    /**
     * Adherencia agregada de la semana en curso (RN-03), calculada como
     * sesiones completadas / sesiones prescritas de los alumnos con plan activo.
     * `null` cuando no existen datos evaluables (ningún alumno con plan prescrito en la ventana).
     * El cliente debe renderizar un estado "sin datos" y NO un porcentaje artificial.
     */
    tasaAdherenciaSemanal: string | null;
    /**
     * Riesgo deportivo: alumnos con semáforo ROJO de adherencia o inactividad >= 4 días.
     * Métrica separada de la mora financiera (no deben fundirse en un mismo contador).
     */
    alumnosEnRiesgoDeportivo: number;
    /** Alumnos con cuotas vencidas o saldo pendiente (riesgo financiero). */
    alumnosEnMoraFinanciera: number;
    /**
     * @deprecated Contador legacy que unía riesgo deportivo + mora financiera.
     * Se mantiene por compatibilidad; usar `alumnosEnRiesgoDeportivo` y `alumnosEnMoraFinanciera`.
     */
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
  /** RF-005: nombre del plan del catálogo (hidratado para la UI; nunca un nombre inventado). */
  planNombre?: string | null;
  /** RF-005: precio base del plan, útil para comparar contra el precio acordado. */
  planPrecioBaseUsd?: string | null;
  /** RF-005: nombre humano del alumno titular del override. */
  clienteNombre?: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
}

/** Resultado honesto de `DELETE /finanzas/planes/override/:id` (RF-005 RN-02). */
export interface EliminarOverridePlanResultadoDTO {
  id: string;
  eliminado: boolean;
  mensaje: string;
}

/**
 * M5-L1 (RF-005 / RF-008): plan asignado a un alumno y su ciclo de cobro. Las fechas son días
 * locales del alumno (`YYYY-MM-DD`): `fechaInicio` fija el día de vencimiento y `proximoCorte`
 * es el vencimiento de la próxima cuota que se emitirá sola. `cuotaEmitidaId` solo viene en la
 * respuesta de la asignación que emitió una cuota.
 */
export interface SuscripcionAlumnoDTO {
  clienteId: string;
  planId: string;
  planNombre: string;
  duracionMeses: number;
  fechaInicio: string;
  proximoCorte: string;
  cuotaEmitidaId: string | null;
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

/**
 * WU24b: respuesta paginada de `GET /finanzas/conciliacion/bandeja`.
 * `total` es el COUNT real de transacciones PENDIENTES del entrenador (no el tamaño de la página)
 * y el orden FIFO por `fechaReporteUtc` se mantiene con desempate estable por `id`.
 */
export type BandejaConciliacionDTO = PaginadoDTO<TransaccionPagoDetalleDTO>;

// =============================================================================
// WU-I (RF-009): TABLERO DE CONTROL DE CARTERA DEL COACH
// =============================================================================

/** Pestañas del tablero de cartera (mismo orden del RF-009 §4.B). */
export type PestanaCarteraDTO = z.infer<typeof PestanaCarteraSchema>;

/**
 * KPIs superiores y contadores de pestaña del tablero de cartera.
 *
 * Todos describen la cartera COMPLETA del coach (nunca la página cargada):
 * - `recaudadoMesUsd` (KPI-01): pagos aprobados del mes UTC en curso.
 * - `totalEnMoraUsd`/`alumnosEnMora` (KPI-02): suma de saldos vencidos y alumnos distintos.
 *   Un pago en revisión PAUSA la mora (misma regla de la máquina de estados WU-H).
 * - `totalPorVencerUsd`/`proximosAVencer` (KPI-03): saldo y alumnos con corte ≤ 5 días.
 * - `pagosPorValidar` (KPI-04): comprobantes en estado pendiente de verificación.
 * - `tasaVigente`: tasa activa del coach para proyectar Bs; `null` honesto si no configuró.
 */
export interface ResumenCarteraDTO {
  recaudadoMesUsd: string;
  totalEnMoraUsd: string;
  alumnosEnMora: number;
  totalPorVencerUsd: string;
  proximosAVencer: number;
  pagosPorValidar: number;
  contadores: {
    enMora: number;
    porVencer: number;
    revision: number;
    alDia: number;
  };
  tasaVigente: string | null;
}

/**
 * WU-I: fila del tablero de cartera. La forma es única para las cuatro pestañas; cada bloque de
 * campos opcionales solo se completa en las pestañas que lo usan (los nulos son datos honestos,
 * p. ej. `saldoPendienteBs = null` cuando el coach no tiene tasa configurada).
 */
export interface FilaCarteraDTO {
  /** `usuarios.id` del alumno (clave de cobro y de notificación). */
  alumnoUsuarioId: string;
  /** `perfiles_alumno.id` para "Ver ficha"; `null` si el perfil no se pudo resolver. */
  alumnoPerfilId: string | null;
  /**
   * M5-P1 (ADR-020): vencimiento (`YYYY-MM-DD`, día local del alumno) de la próxima cuota que
   * emitirá su suscripción; `null` si no tiene plan asignado.
   */
  proximoCorte: string | null;
  alumnoNombre: string;
  telefonoWhatsapp: string | null;
  /** Mora / por vencer: cuota más urgente del alumno (vencida más antigua o corte más próximo). */
  cuotaId: string | null;
  estadoCuota: EstadoCuota | null;
  fechaCorteUtc: string | null;
  saldoPendienteUsd: string | null;
  /** Proyección a Bs con la tasa aplicable (override del alumno o tasa activa del coach). */
  saldoPendienteBs: string | null;
  tasaAplicada: string | null;
  /** Días de atraso (mora): días transcurridos desde el corte más antiguo. */
  diasAtraso: number | null;
  /** Días restantes para el corte (por vencer). */
  diasRestantes: number | null;
  /** Último recordatorio MANUAL enviado a este alumno; `null` si nunca se envió uno. */
  ultimaGestionUtc: string | null;
  /** Al Día: plan de la cuota cubierta y ciclo (`YYYY-MM`). */
  planNombre: string | null;
  periodo: string | null;
  /** Pendiente de revisión: pago reportado por el alumno. */
  pagoId: string | null;
  montoReportado: string | null;
  monedaOriginal: Moneda | null;
  metodoPago: MetodoPago | null;
  referenciaBancaria: string | null;
  comprobanteUrl: string | null;
  fechaReporteUtc: string | null;
  /** Días que el comprobante lleva esperando validación (revisión). */
  diasEspera: number | null;
}

/** WU-I: respuesta paginada de `GET /finanzas/cartera` con los KPIs de la cartera completa. */
export interface CarteraDTO extends PaginadoDTO<FilaCarteraDTO> {
  resumen: ResumenCarteraDTO;
}

/**
 * WU-I (RF-009 RN-02): resultado del recordatorio manual de un clic.
 *
 * `enviado=false` NO es un fallo técnico: expresa reglas de negocio honestas (sin saldo
 * pendiente, pago en revisión o cooldown anti-spam) con un `mensaje` listo para mostrar.
 * `mensajeSugerido` es el texto despachado, para copiar/abrir WhatsApp.
 */
export interface RecordatorioManualResultadoDTO {
  enviado: boolean;
  motivo: 'despachado' | 'sin_saldo_pendiente' | 'pausa_revision' | 'cooldown_activo';
  mensaje: string;
  mensajeSugerido: string | null;
  saldoPendienteUsd: string | null;
  saldoPendienteBs: string | null;
  ultimaGestionUtc: string | null;
  proximoPermitidoUtc: string | null;
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
  /**
   * RF-005 §6: cuota de un alumno becado / acuerdo de intercambio. Se emite con
   * `montoTotalUsd = 0.00` desde un override de precio 0 y queda saldada en el acto
   * (`estado = al_dia`), sin recordatorios de cobro.
   */
  esBecado?: boolean;
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
  fuenteTasa:
    | 'oficial_bcv'
    | 'paralelo'
    | 'entrenador_activa'
    | 'override_cliente'
    | 'sin_configurar';
  esTasaOverride: boolean;
  fechaCalculoUtc: string;
}

export interface TasaCambioVigenteDTO {
  id?: string;
  entrenadorId: string;
  /**
   * Tasa BCV de referencia. `null` cuando el entrenador no ha configurado ninguna tasa:
   * el vacío es un dato y la UI debe mostrar un estado honesto, nunca un valor inventado.
   */
  tasaOficialBcv: string | null;
  tasaParalelo?: string | null;
  /** Tasa activa del entrenador. `null` cuando no existe configuración de tasa. */
  tasaActivaEntrenador: string | null;
  tasaAcordadaCliente?: string | null;
  /**
   * Tasa efectiva aplicable (override del cliente > tasa activa). `null` cuando no hay
   * ninguna tasa utilizable; los consumidores deben omitir proyecciones o pedir configurarla.
   */
  tasaEfectiva: string | null;
  /** `'sin_configurar'` cuando no existe tasa vigente (nunca se reporta una fuente ficticia). */
  fuente: string;
  /** Fecha de la última actualización real. `null` cuando no hay tasa configurada. */
  fechaActualizacionUtc: string | null;
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
  /**
   * LOTE API-N2: instante en que el alumno guardó el reporte en su teléfono (o la hora del servidor
   * si no la informó). `null` en reportes anteriores a este dato.
   */
  capturadoEnUtc?: string | null;
  /**
   * LOTE API-N2: copia de las metas del alumno vigentes al registrar el reporte. `null` si no tenía
   * metas o si el reporte es anterior a este dato (entonces se comparan las metas actuales).
   */
  metasVigentes?: MetasVigentesCheckinDTO | null;
  /** LOTE API-N2: zona horaria del perfil con la que se interpretan la fecha y la ventana. */
  zonaHoraria?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

/**
 * LOTE API-N2: metas copiadas en cada reporte diario (las del alumno al registrar). `null` en un
 * objetivo = no estaba configurado.
 */
export interface MetasVigentesCheckinDTO {
  caloriasObjetivo: number | null;
  proteinaGramosObjetivo: number | null;
  carbohidratosGramosObjetivo: number | null;
  grasasGramosObjetivo: number | null;
  aguaLitrosObjetivo: string | null;
}

/**
 * RF-002 RN-01: metas nutricionales del coach para un alumno tal como las expone la API.
 * `null` en un objetivo significa "no configurado" (nunca 0 fabricado).
 */
export interface MetasNutricionalesDetalleDTO {
  id: string;
  alumnoId: string;
  caloriasObjetivo: number | null;
  proteinaGramosObjetivo: number | null;
  carbohidratosGramosObjetivo: number | null;
  grasasGramosObjetivo: number | null;
  aguaLitrosObjetivo: string | null;
  recursos: RecursoNutricionalDetalleDTO[];
  createdAtUtc: string;
  updatedAtUtc: string;
}

/**
 * RF-002 Escenario 3: comparación de los totales reportados contra las metas del coach (±10%).
 * Si el alumno no tiene metas, o no reportó el total de una dimensión, esa dimensión no se
 * evalúa y el resultado queda sin marcar (campos `undefined`): "sin evaluar", nunca un falso OK.
 */
export interface ToleranciaNutricionalDTO {
  dentroMargenTolerancia?: boolean;
  desviacionCaloriasPct?: number;
  desviacionProteinasPct?: number;
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

// =============================================================================
// NOTIFICACIONES & DISPOSITIVOS DTOs (RF-014, RF-015, RF-016)
// =============================================================================

/**
 * RF-015 (Ola 3 / N2a): fila de la matriz de preferencias tal como la consume la pantalla de
 * ajustes (N2b). `canalesObligatorios` son los switches que la UI debe pintar `disabled`.
 */
export interface CategoriaPreferenciasDTO {
  id: CategoriaPreferenciaNotificacion;
  etiqueta: string;
  push: boolean;
  email: boolean;
  canalesObligatorios: CanalPreferenciaNotificacion[];
}

/**
 * RF-015 (Ola 3 / N2a): matriz de preferencias del usuario autenticado.
 *
 * Los campos planos se mantienen por compatibilidad (clientes y tests previos a N2a); `rol` y
 * `matriz` describen la MISMA fila de base de datos desde la óptica del rol del usuario, para que
 * la UI no tenga que conocer la correspondencia categoría → campo.
 */
export interface PreferenciasNotificacionDTO {
  id: string;
  usuarioId: string;
  rol: Rol;
  notifyPaymentsPush: boolean;
  notifyPaymentsEmail: boolean;
  notifyWorkoutsPush: boolean;
  notifyWorkoutsEmail: boolean;
  notifyCheckinsPush: boolean;
  notifyCheckinsEmail: boolean;
  notifySeguridadPush: boolean;
  notifySeguridadEmail: boolean;
  notifyCobranzasPush: boolean;
  notifyCobranzasEmail: boolean;
  notifyNuevosRegistrosPush: boolean;
  notifyNuevosRegistrosEmail: boolean;
  notifyReportesProgresoPush: boolean;
  notifyReportesProgresoEmail: boolean;
  digestWeeklyPush: boolean;
  digestWeeklyEmail: boolean;
  updatedAtUtc: string;
  /** Matriz del rol autenticado, en orden de presentación (RF-015 §A/§B). */
  matriz: CategoriaPreferenciasDTO[];
  /** Campos obligatorios (RN-01) que el PUT rechaza desactivar. */
  canalesObligatorios: CampoPreferenciaNotificacion[];
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

/**
 * RF-014 (Ola 3): envelope paginado de `GET /notificaciones/in-app`.
 *
 * `total` es el COUNT real de filas que cumplen el filtro (nunca el tamaño de `items`) y
 * `totalNoLeidas` cuenta SIEMPRE todas las no leídas del usuario (independiente de `soloNoLeidas`),
 * para que la campana de N2 pueda pintar el badge sin una llamada extra.
 */
export interface BandejaNotificacionesInAppDTO extends PaginadoDTO<NotificacionInAppDTO> {
  totalNoLeidas: number;
}

export interface EventoNotificacionPayload {
  tipoEvento: string;
  destinatarioUserId: string;
  entrenadorId?: string;
  titulo: string;
  cuerpo: string;
  /**
   * RF-015 (N2a): categoría del evento. Junto con el ROL del destinatario decide la fila de la
   * matriz de preferencias que gobierna el envío (ver `buscarDefinicionCategoria`).
   */
  categoria: CategoriaNotificacion;
  linkAccion?: string | null;
  datosAdicionales?: Record<string, any>;
  esCriticoSeguridad?: boolean;
  timestampUtc?: string;
  /**
   * RNF-004 (Ola 3): entidad de origen del evento (cuota, transacción, sesión, alumno...).
   * Alimenta el `jobId` determinista `notif_{categoria}_{tipoEvento}_{destinatario}_{ref}_{dia}`,
   * de modo que reintentos y re-emisiones dentro de la misma jornada UTC no dupliquen entregas.
   * Si se omite, el despachador cae a las claves conocidas de `datosAdicionales`.
   */
  referenciaId?: string;
}

