import { createHash } from 'node:crypto';
import {
  LIMITE_IN_APP_POR_DEFECTO,
  type FiltroBandejaInAppDTO,
  type NotificacionInAppDTO,
} from '@guachafit/shared';
import type { notificacionesInApp } from '@guachafit/database';
import type { ResultadoConLimite } from '../../../common/esperar-con-limite.util';
import { TIEMPO_MAX_ENCOLADO_CORREO_CUENTA_MS } from '../events/eventos-correo-cuenta';

/**
 * Mapeo de la fila persistida al DTO de la bandeja (movido sin cambios desde
 * `NotificationDispatcherService.mapearNotificacionInApp`).
 */
export function mapearNotificacionInApp(
  r: typeof notificacionesInApp.$inferSelect,
): NotificacionInAppDTO {
  return {
    id: r.id,
    usuarioId: r.usuarioId,
    titulo: r.titulo,
    cuerpo: r.cuerpo,
    tipoEvento: r.tipoEvento,
    leida: r.leida,
    linkAccion: r.linkAccion,
    createdAtUtc:
      r.createdAtUtc instanceof Date
        ? r.createdAtUtc.toISOString()
        : new Date(r.createdAtUtc).toISOString(),
  };
}

/**
 * Valores efectivos de paginación de la bandeja (defaults del doc cuando el
 * filtro no los trae).
 */
export function resolverPaginacionBandeja(filtro: Partial<FiltroBandejaInAppDTO>): {
  limit: number;
  offset: number;
  soloNoLeidas: boolean;
} {
  return {
    limit: filtro.limit ?? LIMITE_IN_APP_POR_DEFECTO,
    offset: filtro.offset ?? 0,
    soloNoLeidas: filtro.soloNoLeidas ?? false,
  };
}

/**
 * Motivo legible cuando el correo de cuenta no quedó encolado: tiempo de espera
 * o mensaje del error original (movido sin cambios desde `despacharCorreoCuenta`).
 */
export function construirMotivoFalloEncolado(
  resultado: Extract<ResultadoConLimite<void>, { ok: false }>,
): string {
  if (resultado.motivo === 'tiempo') {
    return `la cola no respondió en ${TIEMPO_MAX_ENCOLADO_CORREO_CUENTA_MS} ms`;
  }
  const error = (resultado as { motivo: 'error'; error: unknown }).error;
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sufijo de idempotencia del correo de cuenta (movido sin cambios desde
 * `encolarCorreoCuenta`): huella del código cuando hay enlace, identificador
 * propio para los avisos sin enlace para que BullMQ no descarte el segundo.
 */
export function construirHuellaCorreoCuenta(
  token: string | null | undefined,
  avisoUuid: string,
): string {
  if (token) {
    return createHash('sha256').update(token).digest('hex').slice(0, 16);
  }
  return `aviso_${avisoUuid}`;
}

/**
 * Identificador de trabajo del correo de cuenta (movido sin cambios desde
 * `encolarCorreoCuenta`).
 */
export function construirJobIdCorreoCuenta(
  tipo: string,
  usuarioId: string,
  huella: string,
): string {
  return `cuenta_${tipo}_${usuarioId}_${huella}`;
}

/**
 * La recuperación no tiene respaldo visible (su respuesta es genérica): es un
 * error. Las bienvenidas tienen el enlace copiable en pantalla: aviso.
 * (Movido sin cambios desde `despacharCorreoCuenta`).
 */
export function esFalloCriticoCorreoCuenta(tipo: string): boolean {
  return tipo === 'RECUPERACION_PASSWORD';
}
