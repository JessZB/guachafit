import { z } from 'zod';
import {
  PreferenciasNotificacionSchema,
  RegistrarDispositivoSchema,
  ActualizarTemaUiSchema,
  ActualizarPreferenciasNotificacionSchema,
  MarcarNotificacionLeidaSchema,
  FiltroBandejaInAppSchema,
} from '../schemas';
import type {
  CampoPreferenciaNotificacion,
  CanalPreferenciaNotificacion,
  CategoriaNotificacion,
  CategoriaPreferenciaNotificacion,
} from '../schemas';
import {
  Rol,
  PlataformaDispositivo,
} from '../enums';
import type { PaginadoDTO } from './comunes';

// Notificaciones & Preferencias DTOs
export type PreferenciasNotificacionInputDTO = z.infer<typeof PreferenciasNotificacionSchema>;
export type ActualizarPreferenciasNotificacionDTO = z.infer<typeof ActualizarPreferenciasNotificacionSchema>;
export type RegistrarDispositivoDTO = z.infer<typeof RegistrarDispositivoSchema>;
export type MarcarNotificacionLeidaDTO = z.infer<typeof MarcarNotificacionLeidaSchema>;
/** RF-014 (Ola 3): filtros de la bandeja In-App (`limit`, `offset`, `soloNoLeidas`). */
export type FiltroBandejaInAppDTO = z.infer<typeof FiltroBandejaInAppSchema>;
export type ActualizarTemaUiDTO = z.infer<typeof ActualizarTemaUiSchema>;

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
