/**
 * RF-015 (Ola 3): immutable clone of the notification-preferences matrix.
 *
 * Extracted verbatim from `components/notificaciones/MatrizPreferenciasNotificacion.tsx:45-47`.
 * Pure logic (R1): no React, no network, no domain decisions. The row objects
 * and their `canalesObligatorios` arrays are copied so drafts never share
 * references with the saved snapshot.
 */
import type { MatrizPreferenciasNotificacion } from './preferencias-notificacion';

export function clonarMatriz(
  matriz: MatrizPreferenciasNotificacion
): MatrizPreferenciasNotificacion {
  return matriz.map((fila) => ({ ...fila, canalesObligatorios: [...fila.canalesObligatorios] }));
}
