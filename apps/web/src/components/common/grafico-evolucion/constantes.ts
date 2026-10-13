/**
 * Constantes de presentación del gráfico de evolución (Ola 3, módulo `grafico-evolucion`).
 *
 * Recorte verbatim de `GraficoEvolucion.tsx:45-70`: mapas de `ColorMetrica` a clases
 * Tailwind de tokens semánticos (claro/oscuro por construcción, §6.10) y geometría del
 * SVG. Sin lógica ni datos.
 */
import type { ColorMetrica } from '../../../lib/evolucion-graficos';

export const CLASES_STROKE: Record<ColorMetrica, string> = {
  primary: 'stroke-primary',
  success: 'stroke-success',
  info: 'stroke-info',
  warning: 'stroke-warning',
  decor: 'stroke-decor',
};

export const CLASES_FILL: Record<ColorMetrica, string> = {
  primary: 'fill-primary',
  success: 'fill-success',
  info: 'fill-info',
  warning: 'fill-warning',
  decor: 'fill-decor',
};

export const CLASES_PUNTO: Record<ColorMetrica, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  info: 'bg-info',
  warning: 'bg-warning',
  decor: 'bg-decor',
};

export const ALTO_GRAFICO = 250;
export const MARGENES = { arriba: 18, abajo: 34, izquierda: 46, derecha: 46 };
