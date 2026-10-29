/**
 * Átomo de badge de estado por tono semántico (fase C, prompt 48).
 *
 * Consolida los 5 mapas tono→clases duplicados en la web
 * (orígenes pre-Olas 1–3: `TablaCartera.tsx`, `DetalleSesionEntrenamiento.tsx`,
 * `ProgresoPage.tsx`, `AlumnoDetallePage.tsx`,
 * `TablaEntrenadoresAdmin.tsx` y `PlantillasPage.tsx` para nivel; las líneas
 * citadas en la versión anterior ya no corresponden porque las Olas 1–3
 * extrajeron esos mapas a piezas propias —p. ej.
 * `tabla-cartera/BadgeCartera.tsx` (usaba `destructive` en vez de `danger`) fue
 * reemplazado por este átomo en UX-07b y eliminado; ya no es una copia vigente—).
 *
 * Decisiones de consolidación (ver reporte 48 §2):
 * - Ternario único `bg-{t}/15 text-{t} border-{t}/25` por tono.
 * - `danger` usa el token `danger` (existe en ambos temas, `index.css:28,67,102`).
 * - `info` usa el ternario `primary` (3 de 4 copias + `MetricCard.tsx:28`).
 * - `neutral` usa `bg-secondary text-muted-foreground border-border` (todas las copias).
 * - Tono desconocido cae en `neutral` (nunca clases crudas).
 *
 * §6: `text-[11px]` (piso exacto), `font-bold` (700), solo tokens con variante
 * claro/oscuro. Sin dominio ni datos (R9).
 * El texto del badge nunca se parte ni se encoge dentro de un flex (lote "Mis alumnos", 2026-10-19).
 */
import type { ReactNode } from 'react';
import type { TonoSemaforo } from '../../lib/adherencia';

const CLASES_TONO: Record<TonoSemaforo, string> = {
  success: 'bg-success/15 text-success border-success/25',
  warning: 'bg-warning/15 text-warning border-warning/25',
  danger: 'bg-danger/15 text-danger border-danger/25',
  info: 'bg-primary/15 text-primary border-primary/25',
  neutral: 'bg-secondary text-muted-foreground border-border',
};

export interface BadgeEstadoProps {
  tono: TonoSemaforo;
  className?: string;
  children: ReactNode;
}

export function BadgeEstado({ tono, className = '', children }: BadgeEstadoProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap shrink-0 px-2 py-0.5 rounded-full border text-[11px] font-bold uppercase tracking-wide ${
        CLASES_TONO[tono] ?? CLASES_TONO.neutral
      } ${className}`}
    >
      {children}
    </span>
  );
}
