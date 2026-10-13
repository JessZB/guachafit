/**
 * RF-010 RN-01 (WU Admin): listado paginado del panel de entrenadores.
 *
 * Hook de datos extraído de `AdminPage` con el MISMO mecanismo que usa hoy (R9): página y tamaño
 * en estado local, `cargar` con rama demo (`listarEntrenadoresDemo`, sin red) o real
 * (`apiClient.get` + `endpointListadoEntrenadores`) y `usePaginacionServidor` con la misma
 * clave (`admin-entrenadores` o `['admin-entrenadores-demo', versionDemo]`).
 */
import { useCallback, useState } from 'react';
import type {
  EntrenadorAdminDTO,
  ListadoEntrenadoresAdminDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import type { ParametrosCargaPagina } from '../../../lib/use-paginacion-servidor';
import { usePaginacionServidor } from '../../../lib/use-paginacion-servidor';
import {
  TAMANO_PAGINA_ENTRENADORES_ADMIN,
  endpointListadoEntrenadores,
  listarEntrenadoresDemo,
  type CambioDemoEntrenador,
} from '../../../lib/admin-entrenadores';

export interface OpcionesListadoEntrenadoresAdmin {
  isDemoMode: boolean;
  cambiosDemo: Record<string, CambioDemoEntrenador>;
  versionDemo: number;
}

export function useListadoEntrenadoresAdmin({
  isDemoMode,
  cambiosDemo,
  versionDemo,
}: OpcionesListadoEntrenadoresAdmin) {
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(TAMANO_PAGINA_ENTRENADORES_ADMIN);

  const cargarEntrenadores = useCallback(
    async ({ pagina: paginaPedida, tamano: tamanoPedido }: ParametrosCargaPagina) => {
      if (isDemoMode) {
        return listarEntrenadoresDemo(paginaPedida, tamanoPedido, cambiosDemo);
      }
      return apiClient.get<ListadoEntrenadoresAdminDTO>(
        endpointListadoEntrenadores(paginaPedida, tamanoPedido)
      );
    },
    [isDemoMode, cambiosDemo]
  );

  const { items, total, cargando, error: errorListado, recargar } = usePaginacionServidor<
    EntrenadorAdminDTO,
    ListadoEntrenadoresAdminDTO
  >({
    clave: isDemoMode ? ['admin-entrenadores-demo', versionDemo] : 'admin-entrenadores',
    pagina,
    tamano,
    cargar: cargarEntrenadores,
    onAjustarPagina: setPagina,
  });

  return { items, total, cargando, errorListado, recargar, pagina, setPagina, tamano, setTamano };
}
