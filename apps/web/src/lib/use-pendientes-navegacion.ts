import { useQuery } from '@tanstack/react-query';
import { Rol, type DashboardComandoDTO } from '@guachafit/shared';
import { useAuth } from '../context/auth-context';
import { apiClient } from './api-client';
import { DASHBOARD_COMANDO_DEMO } from './dashboard-comando-demo';
import { CLAVE_PENDIENTES_NAVEGACION } from './insignias-pendientes';

/** Conteos de pendientes para las insignias de navegación del entrenador (UX-16). */
export interface PendientesNavegacion {
  pagosPorValidar: number;
  evaluaciones: number;
  enRiesgo: number;
  enMora: number;
}

function mapearPendientes(dashboard: DashboardComandoDTO): PendientesNavegacion {
  return {
    pagosPorValidar: dashboard.bandejasRapidas.pagosPorConciliar,
    evaluaciones: dashboard.bandejasRapidas.checkinsAntropometricosPendientes,
    enRiesgo: dashboard.kpisMacro.alumnosEnRiesgoDeportivo,
    enMora: dashboard.kpisMacro.alumnosEnMoraFinanciera,
  };
}

/**
 * Solo el rol entrenador consulta el resumen; en demo usa el fixture local sin petición.
 * Mientras carga o si falla devuelve null, nunca ceros.
 */
export function usePendientesNavegacion(): PendientesNavegacion | null {
  const { user, isDemoMode } = useAuth();
  const esEntrenador = user?.rol === Rol.ENTRENADOR;

  const consulta = useQuery({
    // El id de usuario en la clave evita mostrar los conteos de otra cuenta en caché.
    queryKey: [CLAVE_PENDIENTES_NAVEGACION, user?.id ?? null],
    queryFn: () => apiClient<DashboardComandoDTO>('/entrenador/dashboard-comando'),
    enabled: esEntrenador && !isDemoMode,
    staleTime: 60_000,
  });

  if (!esEntrenador) return null;
  if (isDemoMode) return mapearPendientes(DASHBOARD_COMANDO_DEMO);
  return consulta.data ? mapearPendientes(consulta.data) : null;
}
