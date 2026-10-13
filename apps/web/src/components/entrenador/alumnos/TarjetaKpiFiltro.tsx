/**
 * Módulo `alumnos` (fase B, prompt 53) · tarjeta KPI-filtro del directorio.
 *
 * Extraído del patrón ×6 de `pages/entrenador/AlumnosPage.tsx:456-580`
 * (ver inventario 42 §3, `TarjetaKpiFiltro` ~45 líneas).
 * Clasificación: CANDIDATO (hoy único: equivalente no interactivo `MetricCard` en
 * `components/common/MetricCard.tsx:16`, usada en `DashboardPage.tsx:163` y
 * `CarteraPage.tsx:380`; la versión con `onClick`/`active` no existe fuera → único
 * hoy; convergencia en D según guía 48 filas 25 y M3).
 *
 * R5: el nombre accesible del botón es "{título} {valor}" (los specs consultan
 * `/Total Cartera 3/`, `En Mora 1`...); la estructura título + valor se conserva.
 * §6: texto ≥ 12px, peso ≤ 700. Presentacional: solo props, sin datos (R1).
 */

import type { ReactNode } from 'react';
import { triggerHaptic } from '../../../lib/haptics';

export type TonoKpiFiltro = 'primary' | 'success' | 'warning' | 'danger' | 'muted';

const CLASES_ACTIVO: Record<TonoKpiFiltro, string> = {
  primary: 'bg-secondary/80 border-primary/50 shadow-xs ring-1 ring-primary/30',
  success: 'bg-success/10 border-success/50 shadow-xs ring-1 ring-success/30',
  warning: 'bg-warning/10 border-warning/50 shadow-xs ring-1 ring-warning/30',
  danger: 'bg-danger/10 border-danger/50 shadow-xs ring-1 ring-danger/30',
  muted: 'bg-secondary/80 border-border shadow-xs ring-1 ring-border',
};

const CLASES_VALOR: Record<TonoKpiFiltro, string> = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  muted: 'text-muted-foreground',
};

const CLASES_VALOR_NEUTRO = 'text-foreground';

export interface TarjetaKpiFiltroProps {
  titulo: string;
  valor: number;
  activo: boolean;
  tono: TonoKpiFiltro;
  /** Variante neutra del valor (solo "Total Cartera" pinta el número en foreground). */
  valorNeutro?: boolean;
  /** Encabezado a medida (solo "En Mora" combina título + punto pulsante). */
  encabezado?: ReactNode;
  onClick: () => void;
}

export function TarjetaKpiFiltro({
  titulo,
  valor,
  activo,
  tono,
  valorNeutro = false,
  encabezado,
  onClick,
}: TarjetaKpiFiltroProps) {
  return (
    <button
      type="button"
      onClick={() => {
        triggerHaptic('light');
        onClick();
      }}
      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer space-y-1 hover:scale-[1.02] active:scale-[0.98] ${
        activo
          ? CLASES_ACTIVO[tono]
          : 'bg-secondary/30 border-border/40 hover:bg-secondary/50 hover:border-border/80'
      }`}
    >
      {encabezado ?? (
        <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider block">
          {titulo}
        </span>
      )}
      <p
        className={`font-mono font-bold text-xl sm:text-2xl tracking-tight ${
          valorNeutro ? CLASES_VALOR_NEUTRO : CLASES_VALOR[tono]
        }`}
      >
        {valor}
      </p>
    </button>
  );
}
