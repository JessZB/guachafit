import { useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';
import { resolverBloqueoAlumno } from '../../../lib/acceso-alumno';
import {
  hayMutacionesSinEnviarDeGrupo,
  offlineDb,
  queueOfflineMutation,
} from '../../../lib/offline-db';
import { esFalloParaEncolar } from '../../../lib/offline-sync';
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
 */
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
      const encolar = async () => {
        await queueOfflineMutation(endpoint, method, payload, descripcion, idempotencyKey);
        return { estado: 'encolado' as const };
      };
      const colaOcupada = await hayMutacionesSinEnviarDeGrupo(`sesion:${sesionId}`).catch(
        () => false
      );
      if (!navigator.onLine || colaOcupada) return encolar();
      try {
        const respuesta = await apiClient<T>(endpoint, {
          method,
          body: JSON.stringify(payload),
          idempotencyKey,
        });
        return { estado: 'enviado', respuesta };
      } catch (err) {
        // RF-012: un bloqueo (403) nunca se encola; lo resuelve quien llama.
        if (resolverBloqueoAlumno(err) || !esFalloParaEncolar(err)) {
          return { estado: 'rechazado', error: err };
        }
        return encolar();
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
