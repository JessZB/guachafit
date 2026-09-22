/**
 * Ola 4 · U4 — cierre de sesión sin perder trabajo en silencio.
 *
 * Antes: el botón de logout limpiaba la cola offline (Dexie) y las cachés de API, descartando
 * cualquier serie/check-in sin subir con solo un `console.warn`.
 * Ahora: si hay mutaciones sin confirmar, la UI abre un diálogo accesible que permite
 * cancelar, sincronizar y esperar, o cerrar sesión asumiendo la pérdida.
 *
 * En modo demo no hay datos reales: el cierre no pide confirmación.
 */
import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { contarMutacionesPendientes } from './offline-db';
import { processOutboxQueue } from './offline-sync';

export interface LogoutSeguro {
  dialogoAbierto: boolean;
  pendientes: number;
  sincronizando: boolean;
  mensaje: string | null;
  solicitarCierre: () => Promise<void>;
  cancelar: () => void;
  confirmar: () => void;
  sincronizarAhora: () => Promise<void>;
}

export function useLogoutSeguro(): LogoutSeguro {
  const { logout, isDemoMode } = useAuth();
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [pendientes, setPendientes] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const pendientesRef = useRef(0);

  const solicitarCierre = useCallback(async () => {
    // Modo demo: sin fricción (no hay trabajo real que perder).
    if (isDemoMode) {
      logout();
      return;
    }

    let pendientesAhora = 0;
    try {
      pendientesAhora = await contarMutacionesPendientes();
    } catch (error) {
      // Sin dato fiable no se bloquea el cierre: la limpieza de sesión es best-effort.
      console.warn('[logout] No se pudo consultar la cola offline:', error);
    }

    if (pendientesAhora === 0) {
      logout();
      return;
    }

    pendientesRef.current = pendientesAhora;
    setPendientes(pendientesAhora);
    setMensaje(null);
    setDialogoAbierto(true);
  }, [isDemoMode, logout]);

  const cancelar = useCallback(() => {
    setDialogoAbierto(false);
    setMensaje(null);
  }, []);

  const confirmar = useCallback(() => {
    setDialogoAbierto(false);
    logout();
  }, [logout]);

  const sincronizarAhora = useCallback(async () => {
    setSincronizando(true);
    setMensaje(null);

    try {
      const resultado = await processOutboxQueue();

      let restantes: number;
      try {
        restantes = await contarMutacionesPendientes();
      } catch {
        restantes = pendientesRef.current;
      }

      if (restantes === 0) {
        setDialogoAbierto(false);
        logout();
        return;
      }

      pendientesRef.current = restantes;
      setPendientes(restantes);
      setMensaje(
        resultado.skipped
          ? `No hay conexión para sincronizar. Quedan ${restantes} cambios sin subir.`
          : `No se pudieron subir todos los cambios. Quedan ${restantes} sin sincronizar.`
      );
    } catch (error) {
      console.warn('[logout] Falló la sincronización antes de cerrar sesión:', error);
      setMensaje(
        'No se pudieron sincronizar los cambios. Inténtalo de nuevo o cierra la sesión igualmente.'
      );
    } finally {
      setSincronizando(false);
    }
  }, [logout]);

  return {
    dialogoAbierto,
    pendientes,
    sincronizando,
    mensaje,
    solicitarCierre,
    cancelar,
    confirmar,
    sincronizarAhora,
  };
}
