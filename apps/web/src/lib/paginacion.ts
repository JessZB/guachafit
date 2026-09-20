/**
 * WU25a: lógica pura de paginación numerada (sin React ni red).
 *
 * Única fuente de verdad para el rango de páginas con elipsis, el total de páginas y el clamp de
 * la página activa cuando cambian el total, el tamaño de página o los filtros. El componente
 * `Paginacion` y el hook `usePaginacionServidor` solo la consumen.
 */
import { pluralizar } from './pluralizar';

/**
 * Máximo de elementos visibles en el rango (números + elipsis). Incluye siempre la primera y la
 * última página; el resto se reparte alrededor de la página activa.
 */
export const MAXIMO_ELEMENTOS_RANGO_PAGINAS = 7;

/** Elemento de un rango de páginas: un número navegable o un salto elidido. */
export type ElementoRangoPaginas = number | 'elipsis';

/**
 * Total de páginas para `total` registros con páginas de `tamano`.
 *
 * Devuelve SIEMPRE al menos 1 para que la UI pueda mostrar "Página 1 de 1" en un listado vacío
 * sin un "de 0" imposible.
 */
export function calcularTotalPaginas(total: number, tamano: number): number {
  const tamanoSeguro = Math.max(1, Math.floor(tamano) || 1);
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / tamanoSeguro));
}

/** Ajusta `pagina` al rango válido [1, totalPaginas]. */
export function clampPagina(pagina: number, totalPaginas: number): number {
  const totalSeguro = Math.max(1, Math.floor(totalPaginas) || 1);
  if (!Number.isFinite(pagina)) return 1;
  return Math.min(Math.max(1, Math.floor(pagina)), totalSeguro);
}

/**
 * Rango de páginas con elipsis para una ventana de `maximo` elementos.
 *
 * Si hay pocas páginas devuelve todas. Con muchas, muestra la primera, la última y una ventana
 * alrededor de la activa; los huecos se representan con `'elipsis'`.
 * Ejemplo: página 5 de 20 => [1, 'elipsis', 4, 5, 6, 'elipsis', 20].
 */
export function rangoPaginas(
  pagina: number,
  totalPaginas: number,
  maximo: number = MAXIMO_ELEMENTOS_RANGO_PAGINAS
): ElementoRangoPaginas[] {
  const total = Math.max(1, Math.floor(totalPaginas) || 1);
  const activa = clampPagina(pagina, total);
  const maximoSeguro = Math.max(5, Math.floor(maximo) || MAXIMO_ELEMENTOS_RANGO_PAGINAS);

  if (total <= maximoSeguro) {
    return Array.from({ length: total }, (_valor, indice) => indice + 1);
  }

  // 4 elementos fijos: primera, última y las dos elipsis posibles.
  const ventana = maximoSeguro - 4;
  let inicio = activa - Math.floor(ventana / 2);
  inicio = Math.max(2, Math.min(inicio, total - ventana));

  const elementos: ElementoRangoPaginas[] = [1];
  if (inicio > 2) elementos.push('elipsis');

  for (let numero = inicio; numero <= inicio + ventana - 1; numero++) {
    elementos.push(numero);
  }

  if (inicio + ventana - 1 < total - 1) elementos.push('elipsis');
  elementos.push(total);

  return elementos;
}

/**
 * WU25b: offset en una serie ASCENDENTE para mostrar la página `pagina` en orden DESCENDENTE
 * (página 1 = los registros más recientes).
 *
 * Algunos endpoints (p. ej. `GET /antropometria/evolucion/:id`) devuelven la serie en orden
 * cronológico ascendente, mientras que las tablas la muestran "más reciente primero". Este
 * helper traduce la página visible a la página equivalente de la serie ascendente (el `offset`
 * SQL) sin traer la serie completa a memoria.
 *
 * WU26: la PRIMERA página visible queda LLENA (10 de 10 con total=25); el offset se mide desde el
 * final (`total - pagina*tamano`) y las páginas siguientes ajustan hacia atrás. La página parcial
 * es la última, nunca la primera.
 * Ejemplo: total=25, tamano=10 => página visible 1 => offset 15 (registros 16–25).
 */
export function offsetPaginaDescendente(pagina: number, tamano: number, total: number): number {
  const tamanoSeguro = Math.max(1, Math.floor(tamano) || 1);
  const totalSeguro = Math.max(0, Math.floor(total) || 0);
  const totalPaginas = calcularTotalPaginas(totalSeguro, tamanoSeguro);
  const paginaSegura = clampPagina(pagina, totalPaginas);
  return Math.max(0, totalSeguro - paginaSegura * tamanoSeguro);
}

/**
 * WU26: filas que debe devolver el servidor para la página visible `pagina` en orden descendente.
 *
 * Con `offsetPaginaDescendente` el offset se mide desde el final, así que la página parcial es la
 * ÚLTIMA: pedir siempre `tamano` filas en el offset 0 de la última página traería filas ya
 * mostradas en la anterior. Este helper devuelve el límite exacto de la ventana
 * (`min(tamano, total - filasPrevias)`), de modo que recorrer las páginas no repite ni salta
 * registros. Ejemplo: total=25, tamano=10 => página 1 => 10, página 2 => 10, página 3 => 5.
 */
export function limitePaginaDescendente(pagina: number, tamano: number, total: number): number {
  const tamanoSeguro = Math.max(1, Math.floor(tamano) || 1);
  const totalSeguro = Math.max(0, Math.floor(total) || 0);
  const totalPaginas = calcularTotalPaginas(totalSeguro, tamanoSeguro);
  const paginaSegura = clampPagina(pagina, totalPaginas);
  const filasPrevias = (paginaSegura - 1) * tamanoSeguro;
  return Math.min(tamanoSeguro, Math.max(0, totalSeguro - filasPrevias));
}

/** Rebanada de `items` para la página pedida (misma aritmética que el `offset` del servidor). */
export function rebanarPagina<T>(items: readonly T[], pagina: number, tamano: number): T[] {
  const tamanoSeguro = Math.max(1, Math.floor(tamano) || 1);
  const paginaSegura = Math.max(1, Math.floor(pagina) || 1);
  const inicio = (paginaSegura - 1) * tamanoSeguro;
  return items.slice(inicio, inicio + tamanoSeguro);
}

/** Copy del contador: "Página X de Y · N registros" (pluraliza el total). */
export function textoPaginacion(pagina: number, totalPaginas: number, total: number): string {
  const activa = clampPagina(pagina, totalPaginas);
  const totalSeguro = Math.max(1, Math.floor(totalPaginas) || 1);
  return `Página ${activa} de ${totalSeguro} · ${pluralizar(Math.max(0, total), 'registro', 'registros')}`;
}
