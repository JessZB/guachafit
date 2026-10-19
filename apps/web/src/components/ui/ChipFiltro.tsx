/**
 * Átomo de chip de filtro (fase C, prompt 48).
 *
 * Consolida los chips de filtro con clases idénticas en al menos 2 vistas
 * (`PagosPage.tsx:998-1009` ↔ `ConciliacionPage.tsx:355-364`; mismo patrón en
 * `PlantillasPage.tsx:542-566`, `MonitorAdherenciaPage.tsx:557-611`,
 * `ProgresoPage.tsx:472`).
 *
 * Divergencias deliberadas respecto a las copias (ver reporte 48 §2):
 * - `aria-pressed={activo}`: las copias de Pagos/Conciliación no lo declaran;
 *   las de Alumnos/Plantillas sí. El átomo lo exige siempre.
 * - `min-h-11` (§6.8): las copias usan `py-1.5` (~32px). La fase B lo adopta a
 *   conciencia; los specs consultan por rol y nombre, no por alto.
 */
import type { ReactNode } from 'react';

export interface ChipFiltroProps {
  activo: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}

export function ChipFiltro({ activo, onClick, className = '', children }: ChipFiltroProps) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`min-h-11 inline-flex items-center justify-center px-3 rounded-xl text-xs font-bold transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
        activo
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
      } ${className}`}
    >
      {children}
    </button>
  );
}
