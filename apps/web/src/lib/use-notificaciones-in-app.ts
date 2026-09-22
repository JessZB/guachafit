/**
 * RF-014 RN-04 (Ola 3 · N2b): datos de la bandeja In-App de la campana.
 *
 * - **Badge**: consulta ligera (`limit=1`) que trae `totalNoLeidas`; refresco suave cada 5 minutos
 *   y al abrir el panel (nunca polling agresivo).
 * - **Bandeja**: al abrir el panel se consulta `limit`/`offset=0`; "Ver más" amplía la ventana
 *   (`limit` crece) sin perder lo ya mostrado.
 * - **Marcar leída / todas**: mutaciones reales (`PATCH`) con actualización local inmediata tras el
 *   2xx y reconciliación del badge. Un fallo se muestra con mensaje y no finge éxito.
 * - **Demo**: con `isDemoMode` no hay red; la bandeja sale del fixture y las lecturas se aplican en
 *   memoria para la sesión demo.
 */
import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LIMITE_IN_APP_MAXIMO,
  Rol,
  type BandejaNotificacionesInAppDTO,
  type NotificacionInAppDTO,
} from '@guachafit/shared';
import { ApiError, apiClient } from './api-client';
import { useAuth } from '../context/auth-context';
import { buildDemoNotificacionesInApp } from './demo-notificaciones';

/** Ventana inicial del panel y paso de "Ver más" (múltiplo cómodo para el scroll del panel). */
export const TAMANO_BANDEJA_NOTIFICACIONES = 8;

const CLAVE_QUERY_BADGE = ['notificaciones-in-app', 'badge'] as const;

export interface OpcionesBandejaNotificacionesInApp {
  /** El panel está abierto: habilita la consulta de la bandeja y su refresco. */
  abierto: boolean;
}

export interface BandejaNotificacionesInApp {
  items: NotificacionInAppDTO[];
  total: number;
  totalNoLeidas: number;
  cargando: boolean;
  /** Error de carga de la bandeja (con acción de reintento en el panel). */
  error: Error | null;
  /** Error de una acción (marcar leída/todas): se muestra sin tumbar la lista. */
  errorAccion: string | null;
  marcandoId: string | null;
  marcandoTodas: boolean;
  hayMas: boolean;
  verMas: () => void;
  recargar: () => void;
  marcarLeida: (id: string) => Promise<void>;
  marcarTodasLeidas: () => Promise<void>;
  limpiarErrorAccion: () => void;
}

function mensajeDeError(error: unknown, respaldo: string): string {
  if (error instanceof ApiError) {
    return error.problem?.detail || error.problem?.message || error.message || respaldo;
  }
  if (error instanceof Error && error.message) return error.message;
  return respaldo;
}

function actualizarBandejaEnCache(
  previa: BandejaNotificacionesInAppDTO | undefined,
  transformar: (item: NotificacionInAppDTO) => NotificacionInAppDTO,
  totalNoLeidas: (previa: BandejaNotificacionesInAppDTO) => number
): BandejaNotificacionesInAppDTO | undefined {
  if (!previa) return previa;
  return {
    ...previa,
    items: previa.items.map(transformar),
    totalNoLeidas: Math.max(0, totalNoLeidas(previa)),
  };
}

export function useNotificacionesInApp({
  abierto,
}: OpcionesBandejaNotificacionesInApp): BandejaNotificacionesInApp {
  const { isDemoMode, user } = useAuth();
  const queryClient = useQueryClient();
  const rol = user?.rol ?? Rol.ALUMNO;

  const [limite, setLimite] = useState(TAMANO_BANDEJA_NOTIFICACIONES);
  const [idsLeidasDemo, setIdsLeidasDemo] = useState<string[]>([]);
  const [marcandoId, setMarcandoId] = useState<string | null>(null);
  const [marcandoTodas, setMarcandoTodas] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const demo = useMemo(() => buildDemoNotificacionesInApp(rol), [rol]);
  const itemsDemo = useMemo(
    () =>
      demo.map((item) => (idsLeidasDemo.includes(item.id) ? { ...item, leida: true } : item)),
    [demo, idsLeidasDemo]
  );

  // Badge: siempre montado con sesión real. `refetchIntervalInBackground` queda en false (por
  // defecto), así que el refresco suave solo ocurre con la pestaña visible.
  const consultaBadge = useQuery({
    queryKey: CLAVE_QUERY_BADGE,
    queryFn: () => apiClient<BandejaNotificacionesInAppDTO>('/notificaciones/in-app?limit=1&offset=0'),
    enabled: !isDemoMode && !!user,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const consultaBandeja = useQuery({
    queryKey: ['notificaciones-in-app', 'bandeja', limite],
    queryFn: () =>
      apiClient<BandejaNotificacionesInAppDTO>(
        `/notificaciones/in-app?limit=${limite}&offset=0`
      ),
    enabled: !isDemoMode && !!user && abierto,
    // Al abrir el panel se refetchea siempre: la bandeja es la vista viva del momento.
    staleTime: 0,
    refetchOnMount: 'always',
    // "Ver más" cambia el `limit`: la ventana anterior se conserva en pantalla mientras llega.
    placeholderData: keepPreviousData,
  });

  const items = isDemoMode
    ? itemsDemo.slice(0, limite)
    : consultaBandeja.data?.items ?? [];
  const total = isDemoMode ? itemsDemo.length : consultaBandeja.data?.total ?? 0;
  const totalNoLeidas = isDemoMode
    ? itemsDemo.filter((item) => !item.leida).length
    : consultaBadge.data?.totalNoLeidas ?? consultaBandeja.data?.totalNoLeidas ?? 0;

  const marcarLeida = useCallback(
    async (id: string) => {
      setErrorAccion(null);

      if (isDemoMode) {
        setIdsLeidasDemo((previas) => (previas.includes(id) ? previas : [...previas, id]));
        return;
      }

      setMarcandoId(id);
      try {
        await apiClient(`/notificaciones/in-app/${id}/leer`, { method: 'PATCH' });
        // 2xx confirmado: la lista y el badge reflejan la lectura sin esperar al refetch.
        queryClient.setQueryData<BandejaNotificacionesInAppDTO>(
          ['notificaciones-in-app', 'bandeja', limite],
          (previa) =>
            actualizarBandejaEnCache(
              previa,
              (item) => (item.id === id ? { ...item, leida: true } : item),
              (actual) => actual.totalNoLeidas - 1
            )
        );
        queryClient.setQueryData<BandejaNotificacionesInAppDTO>(CLAVE_QUERY_BADGE, (previa) =>
          previa ? { ...previa, totalNoLeidas: Math.max(0, previa.totalNoLeidas - 1) } : previa
        );
        // El badge se reconcilia contra el servidor (el conteo local puede diferir si otra
        // pestaña leyó avisos entretanto).
        void queryClient.invalidateQueries({ queryKey: CLAVE_QUERY_BADGE });
      } catch (error) {
        setErrorAccion(
          mensajeDeError(error, 'No se pudo marcar la notificación como leída. Inténtalo de nuevo.')
        );
      } finally {
        setMarcandoId(null);
      }
    },
    [isDemoMode, limite, queryClient]
  );

  const marcarTodasLeidas = useCallback(async () => {
    setErrorAccion(null);

    if (isDemoMode) {
      setIdsLeidasDemo(itemsDemo.map((item) => item.id));
      return;
    }

    setMarcandoTodas(true);
    try {
      await apiClient('/notificaciones/in-app/leer-todas', { method: 'PATCH' });
      queryClient.setQueryData<BandejaNotificacionesInAppDTO>(
        ['notificaciones-in-app', 'bandeja', limite],
        (previa) =>
          actualizarBandejaEnCache(
            previa,
            (item) => ({ ...item, leida: true }),
            () => 0
          )
      );
      queryClient.setQueryData<BandejaNotificacionesInAppDTO>(CLAVE_QUERY_BADGE, (previa) =>
        previa ? { ...previa, totalNoLeidas: 0 } : previa
      );
      void queryClient.invalidateQueries({ queryKey: CLAVE_QUERY_BADGE });
    } catch (error) {
      setErrorAccion(
        mensajeDeError(error, 'No se pudieron marcar las notificaciones como leídas.')
      );
    } finally {
      setMarcandoTodas(false);
    }
  }, [isDemoMode, itemsDemo, limite, queryClient]);

  const verMas = useCallback(() => {
    setLimite((previo) =>
      Math.min(LIMITE_IN_APP_MAXIMO, previo + TAMANO_BANDEJA_NOTIFICACIONES)
    );
  }, []);

  return {
    items,
    total,
    totalNoLeidas,
    cargando: !isDemoMode && abierto && consultaBandeja.isFetching,
    error: !isDemoMode && abierto ? (consultaBandeja.error as Error | null) : null,
    errorAccion,
    marcandoId,
    marcandoTodas,
    hayMas: items.length < total,
    verMas,
    recargar: () => {
      void consultaBandeja.refetch();
    },
    marcarLeida,
    marcarTodasLeidas,
    limpiarErrorAccion: () => setErrorAccion(null),
  };
}
