import { z } from 'zod';
import {
  ListarEntrenadoresAdminQuerySchema,
  CambiarEstadoEntrenadorSchema,
  CambiarLicenciaEntrenadorSchema,
} from '../schemas';
import {
  EstadoLicencia,
} from '../enums';
import type { PaginadoDTO } from './comunes';

// Tipos inferidos de DTOs - Administración (panel maestro Superadmin)
export type ListarEntrenadoresAdminQueryDTO = z.infer<typeof ListarEntrenadoresAdminQuerySchema>;
export type CambiarEstadoEntrenadorDTO = z.infer<typeof CambiarEstadoEntrenadorSchema>;
export type CambiarLicenciaEntrenadorDTO = z.infer<typeof CambiarLicenciaEntrenadorSchema>;

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
  /** D17: `false` = el enlace de captación está pausado. */
  captacionActiva: boolean;
  /** D17: ISO 8601 UTC de la última rotación del enlace; `null` si nunca se rotó. */
  enlaceRotadoEnUtc: string | null;
  /** D17: alumnos registrados por el enlace vigente. */
  registrosPorEnlace: number;
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
