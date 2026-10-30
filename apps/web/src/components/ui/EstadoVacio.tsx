/**
 * Átomo de estado vacío (fase C, prompt 48).
 *
 * Consolida la tarjeta `border-dashed` duplicada en 20+ sitios
 * (orígenes pre-Olas 1–3: `PlantillasPage.tsx`, `AlumnosPage.tsx`,
 * `PagosPage.tsx`, `ProgresoPage.tsx`, `AntropometriaPage.tsx`,
 * `ConciliacionPage.tsx`, `TablaCartera.tsx` y `MonitorAdherenciaPage.tsx`;
 * las líneas citadas en la versión anterior ya no corresponden porque las
 * Olas 1–3 extrajeron esos vacíos a piezas propias —p. ej.
 * `tabla-cartera/EstadoVacioCartera.tsx`, con icono y color propios según
 * pestaña, y `grafico-evolucion/EstadosGraficoEvolucion.tsx`, con copys
 * propios por rama—).
 *
 * - La acción opcional se renderiza con `BotonTactil` (44px, §6.8).
 * - §6.6: vacío explícito con título y detalle honesto; sin dominio ni datos (R9).
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { SearchX } from 'lucide-react';
import { BotonTactil, type VarianteBotonTactil } from './BotonTactil';

export interface AccionEstadoVacio {
  texto: string;
  onAccion: () => void;
  variante?: VarianteBotonTactil;
}

export interface EstadoVacioProps {
  titulo: string;
  detalle?: ReactNode;
  icono?: LucideIcon;
  accion?: AccionEstadoVacio;
  /** Nivel del título según la jerarquía de la página (por defecto 3). */
  nivelTitulo?: 2 | 3;
}

export function EstadoVacio({
  titulo,
  detalle,
  icono: Icono = SearchX,
  accion,
  nivelTitulo = 3,
}: EstadoVacioProps) {
  const Titulo = nivelTitulo === 2 ? 'h2' : 'h3';
  return (
    <div className="p-10 rounded-3xl bg-card border border-dashed border-border text-center space-y-3">
      <Icono aria-hidden="true" className="h-9 w-9 text-muted-foreground mx-auto opacity-50" />
      <Titulo className="text-sm font-bold text-foreground">{titulo}</Titulo>
      {detalle ? (
        <p className="text-xs text-muted-foreground max-w-md mx-auto">{detalle}</p>
      ) : null}
      {accion ? (
        <BotonTactil
          variante={accion.variante ?? 'secundaria'}
          onClick={accion.onAccion}
        >
          {accion.texto}
        </BotonTactil>
      ) : null}
    </div>
  );
}
