import type { ReactNode } from 'react';
import { useIndicadorRetrasado } from '../../lib/use-indicador-retrasado';

/**
 * Contenedor de carga con esqueleto diferido (fase 2 «carga sin saltos»).
 *
 * - De inmediato expone `role="status"` + texto `sr-only` (accesibilidad).
 * - El esqueleto visual (`children`) solo se dibuja tras `retardoMs` de carga continua, así las
 *   cargas rápidas no parpadean. Cuando el padre deja de renderizarlo, todo desaparece.
 */
export interface CargaConEsqueletoProps {
  /** Texto accesible del estado (no visible). Por defecto "Cargando…". */
  texto?: string;
  /** Milisegundos de carga continua antes de dibujar el esqueleto. Por defecto 150. */
  retardoMs?: number;
  /** Clases del contenedor (reserva de alto). Por defecto `min-h-[200px]`. */
  claseContenedor?: string;
  /** Esqueleto visual (presets de `ui/esqueletos`). */
  children?: ReactNode;
}

export function CargaConEsqueleto({
  texto = 'Cargando…',
  retardoMs = 150,
  claseContenedor,
  children,
}: CargaConEsqueletoProps) {
  const mostrarEsqueleto = useIndicadorRetrasado(true, retardoMs);

  return (
    <div role="status" aria-busy="true" className={claseContenedor ?? 'min-h-[200px]'}>
      <span className="sr-only">{texto}</span>
      {mostrarEsqueleto ? children : null}
    </div>
  );
}
