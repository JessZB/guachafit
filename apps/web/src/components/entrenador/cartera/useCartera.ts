/**
 * Prompt 73 (Ola 2, módulo `cartera`): filtros y carga server-side de la cartera.
 *
 * Recorte verbatim de `CarteraPage.tsx:66-160` (estado de pestaña/página/tamaño/búsqueda,
 * sesión demo, `cargarPagina` y `usePaginacionServidor`). Mantiene el MISMO mecanismo de
 * datos (TanStack Query vía `usePaginacionServidor`, R9): los specs montan con
 * `QueryClientProvider`.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../../../lib/api-client';
import { crearCarteraDemo } from '../../../lib/demo-cartera';
import { normalizarPestana } from '../../../lib/cartera';
import { useValorDebounced } from '../../../lib/use-valor-debounced';
import { usePaginacionServidor } from '../../../lib/use-paginacion-servidor';
import { useAuth } from '../../../context/auth-context';
import type {
  CarteraDTO,
  FilaCarteraDTO,
  PestanaCarteraDTO,
} from '@guachafit/shared';

export function useCartera() {
  const { isDemoMode } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pestana, setPestana] = useState<PestanaCarteraDTO>(() =>
    normalizarPestana(searchParams.get('pestana'))
  );
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [busqueda, setBusqueda] = useState('');
  const q = useValorDebounced(busqueda);

  // Estado de sesión SOLO demo: cobros y recordatorios aplicados sobre el fixture local.
  const [cobradosDemo, setCobradosDemo] = useState<string[]>([]);
  const [recordatoriosDemo, setRecordatoriosDemo] = useState<Record<string, string>>({});

  const cargarPagina = useCallback(
    async ({
      pagina: paginaSolicitada,
      tamano: tamanoSolicitado,
      signal,
    }: {
      pagina: number;
      tamano: number;
      signal: AbortSignal;
    }): Promise<CarteraDTO> => {
      const offset = (paginaSolicitada - 1) * tamanoSolicitado;
      if (isDemoMode) {
        return crearCarteraDemo({
          pestana,
          q,
          limit: tamanoSolicitado,
          offset,
          cobrados: cobradosDemo,
          recordatorios: recordatoriosDemo,
        });
      }
      const parametros = new URLSearchParams({
        pestana,
        limit: String(tamanoSolicitado),
        offset: String(offset),
      });
      if (q.trim().length > 0) parametros.set('q', q.trim());
      return apiClient<CarteraDTO>(`/finanzas/cartera?${parametros.toString()}`, { signal });
    },
    [isDemoMode, pestana, q, cobradosDemo, recordatoriosDemo]
  );

  const paginacion = usePaginacionServidor<FilaCarteraDTO, CarteraDTO>({
    clave: [
      'cartera-coach',
      pestana,
      q.trim(),
      isDemoMode ? `demo-${cobradosDemo.length}-${Object.keys(recordatoriosDemo).length}` : 'real',
    ],
    pagina,
    tamano,
    cargar: cargarPagina,
    onAjustarPagina: setPagina,
  });

  const { items, total, cargando, error: errorConsulta, recargar, respuesta } = paginacion;
  const resumen = respuesta?.resumen ?? null;
  const isLoading = cargando && !respuesta;
  const error = errorConsulta?.message ?? null;

  // Cambiar pestaña, tamaño o búsqueda vuelve a la página 1.
  useEffect(() => {
    setPagina(1);
  }, [pestana, tamano, q]);

  const cambiarPestana = (nueva: PestanaCarteraDTO) => {
    setPestana(nueva);
    const parametros = new URLSearchParams(searchParams);
    parametros.set('pestana', nueva);
    setSearchParams(parametros, { replace: true });
  };

  return {
    isDemoMode,
    pestana,
    pagina,
    tamano,
    busqueda,
    q,
    setPagina,
    setTamano,
    setBusqueda,
    cambiarPestana,
    items,
    total,
    cargando,
    error,
    recargar,
    resumen,
    isLoading,
    cobradosDemo,
    setCobradosDemo,
    recordatoriosDemo,
    setRecordatoriosDemo,
  };
}

export type UsoCartera = ReturnType<typeof useCartera>;
