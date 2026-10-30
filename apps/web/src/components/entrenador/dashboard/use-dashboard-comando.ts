import { useCallback, useEffect, useRef, useState } from 'react';
import type { DashboardComandoDTO } from '@guachafit/shared';
import { useAuth } from '../../../context/auth-context';
import { apiClient } from '../../../lib/api-client';
import { DASHBOARD_COMANDO_DEMO } from '../../../lib/dashboard-comando-demo';

export interface EstadoDashboardComando {
  dashboard: DashboardComandoDTO | null;
  isLoading: boolean;
  error: string | null;
  recargar: () => void;
}

/** Resumen del Dashboard del entrenador: demo local o GET real con estados honestos. */
export function useDashboardComando(): EstadoDashboardComando {
  const { isDemoMode } = useAuth();
  // En modo demo no hay petición: arranca con datos y sin estado de carga.
  const [dashboard, setDashboard] = useState<DashboardComandoDTO | null>(
    isDemoMode ? DASHBOARD_COMANDO_DEMO : null
  );
  const [isLoading, setIsLoading] = useState(() => !isDemoMode);
  const [error, setError] = useState<string | null>(null);
  // Generación vigente: las respuestas de cargas anteriores se descartan.
  const generacion = useRef(0);

  const cargar = useCallback(async () => {
    const generacionActual = ++generacion.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient<DashboardComandoDTO>('/entrenador/dashboard-comando');
      if (generacionActual !== generacion.current) return;
      setDashboard(data);
      setError(null);
      setIsLoading(false);
    } catch (err: any) {
      if (generacionActual !== generacion.current) return;
      // D2: sin datos demo fuera del modo demo; estado de error honesto con reintento.
      // Conserva el dashboard previo: un fallo de recarga no borra las cifras cargadas.
      setError(
        err?.message || 'No se pudo cargar el dashboard del negocio. Inténtalo de nuevo.'
      );
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // MODO DEMO EXPLÍCITO: sin llamadas contra la API real.
    if (isDemoMode) {
      setDashboard(DASHBOARD_COMANDO_DEMO);
      setIsLoading(false);
      setError(null);
    } else {
      // Al salir del modo demo no se conservan datos sintéticos (ADR-012).
      setDashboard(null);
      void cargar();
    }
    // Al cambiar de modo o desmontar, invalida la carga en curso.
    return () => {
      generacion.current++;
    };
  }, [isDemoMode, cargar]);

  const recargar = useCallback(() => {
    void cargar();
  }, [cargar]);

  return { dashboard, isLoading, error, recargar };
}
