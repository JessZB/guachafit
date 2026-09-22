/**
 * Ola 4 · U4 — actualización guiada del Service Worker (`registerType: 'prompt'`).
 *
 * Con `prompt` el Service Worker nuevo queda `waiting`: NADA se aplica ni se recarga en
 * silencio. Este módulo es el estado observable entre el registro (`virtual:pwa-register`,
 * en `pwa-registro.ts`) y la UI (`ActualizacionDisponible`):
 *
 * - `onNeedRefresh` → `hayVersionNueva: true` (aviso discreto, no bloqueante).
 * - `aplicar()` → `updateSW(true)`: activa el SW nuevo y recarga; si la recarga no ocurre o
 *   el registro falla, deja un error honesto en vez de fingir que se actualizó.
 *
 * El registro se inyecta como dependencia (`RegistrarActualizacionSW`) para poder testear el
 * estado en Node sin `virtual:pwa-register`.
 */

export interface EstadoActualizacion {
  hayVersionNueva: boolean;
  aplicando: boolean;
  error: string | null;
}

export interface OpcionesRegistroSW {
  onNeedRefresh?: () => void;
  onRegisterError?: (error: unknown) => void;
  onRegisteredSW?: (swScriptUrl: string, registration?: ServiceWorkerRegistration) => void;
}

export type AplicarActualizacionSW = (reloadPage?: boolean) => Promise<void>;
export type RegistrarActualizacionSW = (opciones: OpcionesRegistroSW) => AplicarActualizacionSW;

export interface GestorActualizacion {
  estadoActual(): EstadoActualizacion;
  suscribir(listener: (estado: EstadoActualizacion) => void): () => void;
  aplicar(): Promise<void>;
}

const ESTADO_INICIAL: EstadoActualizacion = {
  hayVersionNueva: false,
  aplicando: false,
  error: null,
};

export function crearGestorActualizacion(
  registrar: RegistrarActualizacionSW
): GestorActualizacion {
  let estado: EstadoActualizacion = ESTADO_INICIAL;
  const listeners = new Set<(estado: EstadoActualizacion) => void>();
  let updateSW: AplicarActualizacionSW | null = null;

  const actualizar = (parcial: Partial<EstadoActualizacion>) => {
    estado = { ...estado, ...parcial };
    listeners.forEach((listener) => {
      try {
        listener(estado);
      } catch {
        // Un listener roto jamás debe romper el flujo de actualización.
      }
    });
  };

  try {
    updateSW = registrar({
      onNeedRefresh: () => actualizar({ hayVersionNueva: true, error: null }),
      onRegisterError: (error) => {
        // El registro fallido no rompe la app (sigue sirviendo la versión actual); no se
        // convierte en un banner persistente, solo queda rastro para diagnosticar.
        console.warn('[pwa] No se pudo registrar el service worker:', error);
      },
    });
  } catch (error) {
    console.warn('[pwa] El registro del service worker falló:', error);
  }

  return {
    estadoActual: () => estado,
    suscribir(listener) {
      listeners.add(listener);
      listener(estado);
      return () => {
        listeners.delete(listener);
      };
    },
    async aplicar() {
      if (!updateSW) {
        actualizar({
          error:
            'La actualización todavía no está disponible. Vuelve a intentarlo en unos segundos.',
        });
        return;
      }

      actualizar({ aplicando: true, error: null });
      try {
        // `true` = activa el SW en espera y recarga la página al tomar el control.
        // Si la recarga ocurre, este código posterior no llega a ejecutarse.
        await updateSW(true);
        actualizar({
          aplicando: false,
          hayVersionNueva: false,
          error:
            'La aplicación no se recargó automáticamente. Ciérrala y vuelve a abrirla para completar la actualización.',
        });
      } catch (error) {
        console.warn('[pwa] No se pudo aplicar la actualización:', error);
        actualizar({
          aplicando: false,
          error: 'No se pudo aplicar la actualización. Cierra la aplicación y vuelve a abrirla.',
        });
      }
    },
  };
}

let gestor: GestorActualizacion | null = null;

/** Inicializa el gestor una sola vez (el registro real vive en `pwa-registro.ts`). */
export function inicializarActualizacion(
  registrar: RegistrarActualizacionSW
): GestorActualizacion {
  if (!gestor) gestor = crearGestorActualizacion(registrar);
  return gestor;
}

export function obtenerGestorActualizacion(): GestorActualizacion | null {
  return gestor;
}
