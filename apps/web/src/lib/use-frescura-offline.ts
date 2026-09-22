/**
 * Ola 4 · U4 — estado de conexión + frescura de la copia cacheada de un GET concreto.
 *
 * Cuando la pantalla consulta un GET y el Service Worker responde desde `api-cache`
 * (sin conexión), este hook permite decir al usuario qué está viendo y de cuándo es.
 */
import { useEffect, useState } from 'react';
import { consultarFrescuraDeCache, type FrescuraCache } from './frescura-cache';

export interface EstadoFrescuraOffline {
  isOnline: boolean;
  /** `null` mientras no haya copia cacheada o no se pueda datar. */
  frescura: FrescuraCache | null;
}

function leerConexion(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function useFrescuraOffline(url: string | null | undefined): EstadoFrescuraOffline {
  const [isOnline, setIsOnline] = useState(leerConexion);
  const [frescura, setFrescura] = useState<FrescuraCache | null>(null);

  useEffect(() => {
    const alCambiarConexion = () => setIsOnline(leerConexion());
    window.addEventListener('online', alCambiarConexion);
    window.addEventListener('offline', alCambiarConexion);
    return () => {
      window.removeEventListener('online', alCambiarConexion);
      window.removeEventListener('offline', alCambiarConexion);
    };
  }, []);

  useEffect(() => {
    let cancelado = false;

    if (isOnline || !url) {
      setFrescura(null);
      return;
    }

    void consultarFrescuraDeCache(url).then((resultado) => {
      if (!cancelado) setFrescura(resultado);
    });

    return () => {
      cancelado = true;
    };
  }, [isOnline, url]);

  return { isOnline, frescura };
}
