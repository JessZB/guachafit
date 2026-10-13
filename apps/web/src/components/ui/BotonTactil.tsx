/**
 * Átomo de botón táctil (fase C, prompt 48).
 *
 * Consolida el botón primario de 44px duplicado en al menos 4 superficies
 * (`PlantillasPage.tsx:502-509`, `AlumnosPage.tsx:444-450`,
 * `AsignacionMasivaPlantilla.tsx:506`, `AjustesPage.tsx:824`) y la variante
 * secundaria de `PlantillasPage.tsx:642-649`.
 *
 * - §6.8: `min-h-11` siempre (las copias de "Reintentar"/"Limpiar filtros" con
 *   `py-2` quedaban en ~32-40px; ver WARNINGs de los inventarios 43/44/47).
 * - §6.9/§6.12: `text-xs` (12px) y `font-bold` (700) como máximo.
 * - Solo tokens semánticos con variante claro/oscuro (§6.10).
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type VarianteBotonTactil = 'primaria' | 'secundaria' | 'peligro';

const CLASES_VARIANTE: Record<VarianteBotonTactil, string> = {
  primaria:
    'bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:brightness-110 active:scale-95',
  secundaria: 'bg-secondary text-foreground hover:bg-secondary/80 active:scale-95',
  peligro: 'bg-destructive text-white hover:brightness-110 active:scale-95',
};

export interface BotonTactilProps {
  variante?: VarianteBotonTactil;
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
  disabled?: boolean;
  onClick?: () => void;
  etiquetaAccesible?: string;
  className?: string;
  children: ReactNode;
}

export function BotonTactil({
  variante = 'primaria',
  type = 'button',
  disabled = false,
  onClick,
  etiquetaAccesible,
  className = '',
  children,
}: BotonTactilProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-label={etiquetaAccesible}
      className={`min-h-11 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${CLASES_VARIANTE[variante]} ${className}`}
    >
      {children}
    </button>
  );
}
