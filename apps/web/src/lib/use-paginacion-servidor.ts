/**
 * WU25a: hook de paginación server-side con TanStack Query.
 *
 * Contrato:
 * - La página se controla con `pagina`/`tamano` (estado de React del consumidor).
 * - `cargar` lo provee la pantalla: en real llama a `apiClient` con `limit`/`offset`; en modo
 *   demo corta el fixture local con `rebanarPagina` (mismo flujo, cero red).
 * - `clave` forma el `queryKey` `[clave, pagina, tamano]`; debe incluir los filtros activos para
 *   que cada combinación tenga su propia caché (p. ej. `['directorio-alumnos', q, estado]`).
 * - `placeholderData: keepPreviousData` conserva la página anterior mientras llega la nueva, de
 *   modo que la tabla no parpadea ni salta al cambiar de página.
 * - `onAjustarPagina` avisa cuando el total real encoge y la página activa ya no existe.
 */
import { keepPreviousData, useQuery, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';
import { calcularTotalPaginas } from './paginacion';

/** Mínimo contrato de una página servida por la API o por el fixture demo. */
export interface PaginaServidor<T> {
  items: T[];
  total: number;
}

/** Parámetros que recibe la función `cargar` de cada pantalla. */
export interface ParametrosCargaPagina {
  pagina: number;
  tamano: number;
  /** `AbortSignal` de la consulta: cancelar al cambiar de clave/página sin parpadeos. */
  signal: AbortSignal;
}

export interface OpcionesPaginacionServidor<
  T,
  TRespuesta extends PaginaServidor<T> = PaginaServidor<T>,
> {
  /** Clave base del `queryKey`; puede ser compuesta para incluir filtros. */
  clave: string | readonly unknown[];
  pagina: number;
  tamano: number;
  cargar: (parametros: ParametrosCargaPagina) => Promise<TRespuesta>;
  /** `false` deshabilita la consulta (p. ej. mientras falta un dato obligatorio). */
  habilitado?: boolean;
  /** Se invoca con la última página válida cuando el total encoge por debajo de `pagina`. */
  onAjustarPagina?: (pagina: number) => void;
}

export interface ResultadoPaginacionServidor<
  T,
  TRespuesta extends PaginaServidor<T> = PaginaServidor<T>,
> {
  items: T[];
  total: number;
  totalPaginas: number;
  cargando: boolean;
  error: Error | null;
  recargar: () => void;
  /**
   * Payload crudo de la última página (incluye metadatos extra como `resumen` en el directorio o
   * el monitor). Con `keepPreviousData` es la página anterior mientras llega la nueva.
   */
  respuesta: TRespuesta | undefined;
}

/** Construye el `queryKey`: `[clave, pagina, tamano]` (la clave puede ser compuesta). */export function construirClavePaginada(
  clave: string | readonly unknown[],
  pagina: number,
  tamano: number
): QueryKey {
  const base = Array.isArray(clave) ? clave : [clave];
  return [...base, pagina, tamano];
}

/**
 * Opciones puras de `useQuery` (sin React), exportadas para poder testear el contrato del hook:
 * clave, `placeholderData` y `enabled`.
 */
export function construirOpcionesConsultaPaginada<
  T,
  TRespuesta extends PaginaServidor<T> = PaginaServidor<T>,
>(opciones: OpcionesPaginacionServidor<T, TRespuesta>) {
  const { clave, pagina, tamano, cargar, habilitado = true } = opciones;

  return {
    queryKey: construirClavePaginada(clave, pagina, tamano),
    queryFn: ({ signal }: { signal: AbortSignal }) => cargar({ pagina, tamano, signal }),
    placeholderData: keepPreviousData,
    enabled: habilitado,
  };
}

export function usePaginacionServidor<
  T,
  TRespuesta extends PaginaServidor<T> = PaginaServidor<T>,
>(opciones: OpcionesPaginacionServidor<T, TRespuesta>): ResultadoPaginacionServidor<T, TRespuesta> {
  const { pagina, tamano, onAjustarPagina } = opciones;

  const consulta = useQuery(construirOpcionesConsultaPaginada(opciones));

  const total = consulta.data?.total ?? 0;
  const totalPaginas = calcularTotalPaginas(total, tamano);

  useEffect(() => {
    // El servidor devolvió menos páginas que la activa (filtros o bajas): se avisa para que la
    // pantalla haga clamp a la última página válida.
    if (!consulta.data) return;
    if (pagina > totalPaginas) onAjustarPagina?.(totalPaginas);
  }, [consulta.data, pagina, totalPaginas, onAjustarPagina]);

  return {
    items: consulta.data?.items ?? [],
    total,
    totalPaginas,
    // `isFetching` cubre la carga inicial y los cambios de página con datos previos en pantalla.
    cargando: consulta.isFetching,
    error: (consulta.error as Error | null) ?? null,
    recargar: () => {
      void consulta.refetch();
    },
    respuesta: consulta.data,
  };
}
