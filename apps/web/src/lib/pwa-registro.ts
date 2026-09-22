/**
 * Ola 4 · U4 — registro real del Service Worker (`registerType: 'prompt'`).
 *
 * Este es el ÚNICO punto que importa `virtual:pwa-register`; el resto de la app habla con el
 * gestor puro de `pwa-actualizacion.ts`. Se ejecuta una vez desde `main.tsx`.
 *
 * Además del registro, programa comprobaciones de versión nueva:
 * - al volver a la pestaña a primer plano (`visibilitychange`), y
 * - cada hora mientras la app siga abierta,
 * con un mínimo de 15 minutos entre comprobaciones para no golpear al servidor.
 *
 * En desarrollo el módulo virtual es un no-op (PWA en dev deshabilitada): no rompe `vite dev`.
 */
import { registerSW } from 'virtual:pwa-register';
import {
  inicializarActualizacion,
  type GestorActualizacion,
} from './pwa-actualizacion';

export const INTERVALO_COMPROBACION_ACTUALIZACIONES_MS = 60 * 60 * 1000;
export const MIN_ENTRE_COMPROBACIONES_MS = 15 * 60 * 1000;

/** Registra el SW y devuelve el gestor que consume la UI de actualización. */
export function registrarActualizacion(): GestorActualizacion {
  return inicializarActualizacion((opciones) =>
    registerSW({
      ...opciones,
      onOfflineReady: () => {
        console.info('[pwa] La app quedó lista para funcionar sin conexión.');
      },
      onRegisteredSW: (_url, registro) => programarComprobacionesDeVersion(registro),
    })
  );
}

function programarComprobacionesDeVersion(
  registro: ServiceWorkerRegistration | undefined
): void {
  if (!registro || typeof window === 'undefined') return;

  let ultimaComprobacion = 0;
  const comprobar = () => {
    const ahora = Date.now();
    if (ahora - ultimaComprobacion < MIN_ENTRE_COMPROBACIONES_MS) return;
    ultimaComprobacion = ahora;
    // Sin conexión esto rechaza: se reintenta en el próximo ciclo.
    void registro.update().catch(() => {});
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') comprobar();
  });
  window.setInterval(comprobar, INTERVALO_COMPROBACION_ACTUALIZACIONES_MS);
}
