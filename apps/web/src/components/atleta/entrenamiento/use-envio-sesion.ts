import { useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';
import { resolverBloqueoAlumno } from '../../../lib/acceso-alumno';
import {
  hayMutacionesSinEnviarDeGrupo,
  offlineDb,
  queueOfflineMutation,
} from '../../../lib/offline-db';
import { esFalloParaEncolar } from '../../../lib/offline-sync';
import {
  hayEnvioEnVuelo,
  marcaDeAccionMs,
  registrarEnvioEnVuelo,
} from '../../../lib/envios-en-vuelo';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';

export type ResultadoEnvio<T> =
  | { estado: 'enviado'; respuesta: T }
  | { estado: 'encolado' }
  | { estado: 'rechazado'; error: unknown };

export type EnviarOEncolarFn = <T>(
  sesionId: string,
  endpoint: string,
  method: 'POST' | 'PUT',
  payload: unknown,
  descripcion: string,
  idempotencyKey: string
) => Promise<ResultadoEnvio<T>>;

interface OpcionesEnvio {
  user: { id?: string } | null;
  isDemoMode: boolean;
}

/**
 * D1/D6: envía una mutación de la sesión o la deja en la cola.
 * - Sin red, o si la cola aún tiene algo de ESTA sesión, se encola (orden causal: nada se
 *   adelanta a un "iniciar" o a una serie pendiente).
 * - Con red: un fallo de red/5xx se encola; cualquier otro 4xx vuelve como `rechazado` para
 *   que la pantalla revierta y muestre el error (nunca se encola un rechazo de datos).
 * - Lote E9: con un envío directo de ESTA sesión en vuelo, el cambio se encola detrás (el orden
 *   se garantiza dentro de la misma pestaña; varias pestañas o dispositivos no se coordinan, y
 *   con red lenta puede verse un momento "por enviar").
 *   Todo lo encolado lleva la hora de la ACCIÓN, también el directo que falla y se re-encola.
 * - El directo tiene un plazo: si la red se queda colgada, vence, se re-encola con la misma key
 *   (el servidor deduplica si sí llegó) y libera el vuelo, en vez de retener la sesión.
 */
const TIEMPO_LIMITE_ENVIO_DIRECTO_MS = 15_000;

export function useEnvioSesion({ user, isDemoMode }: OpcionesEnvio) {
  const enviarOEncolar = useCallback(
    async <T,>(
      sesionId: string,
      endpoint: string,
      method: 'POST' | 'PUT',
      payload: unknown,
      descripcion: string,
      idempotencyKey: string
    ): Promise<ResultadoEnvio<T>> => {
      // E9: todo esto ocurre ANTES del primer `await`, para que dos toques seguidos no puedan
      // salir los dos en directo: el primero reserva el vuelo y el segundo ya lo ve.
      const grupo = `sesion:${sesionId}`;
      const marca = marcaDeAccionMs();
      const vueloEnCurso = hayEnvioEnVuelo(grupo);
      const liberar = vueloEnCurso ? null : registrarEnvioEnVuelo(grupo);
      const encolar = async () => {
        await queueOfflineMutation(endpoint, method, payload, descripcion, idempotencyKey, {
          creadoEnMs: marca,
        });
        return { estado: 'encolado' as const };
      };
      try {
        if (!liberar || !navigator.onLine) return await encolar();
        const colaOcupada = await hayMutacionesSinEnviarDeGrupo(grupo).catch(() => false);
        if (colaOcupada) return await encolar();
        try {
          const respuesta = await apiClient<T>(endpoint, {
            method,
            body: JSON.stringify(payload),
            idempotencyKey,
            tiempoLimiteMs: TIEMPO_LIMITE_ENVIO_DIRECTO_MS,
          });
          return { estado: 'enviado', respuesta };
        } catch (err) {
          // RF-012: un bloqueo (403) nunca se encola; lo resuelve quien llama.
          if (resolverBloqueoAlumno(err) || !esFalloParaEncolar(err)) {
            return { estado: 'rechazado', error: err };
          }
          return await encolar();
        }
      } finally {
        // Se libera DESPUÉS de re-encolar: el drenado que dispara la liberación ya lo ve.
        liberar?.();
      }
    },
    []
  );

  const cacheSesion = useCallback(
    async (data: SesionEntrenamientoDetalleDTO) => {
      if (isDemoMode || !data?.id) return;
      try {
        await offlineDb.rutinaHoy.put({
          id: data.id,
          alumnoId: user?.id || '',
          fechaProgramada: data.fechaProgramada,
          sesion: data,
          updatedAt: Date.now(),
        });
      } catch {
        // La caché local nunca debe romper la experiencia
      }
    },
    [isDemoMode, user]
  );

  return { enviarOEncolar, cacheSesion };
}
