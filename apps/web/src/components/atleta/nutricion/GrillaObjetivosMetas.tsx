/**
 * Módulo 6 · Nutrición: grilla de objetivos de metas (REUTILIZABLE, R3.1).
 *
 * Copia idéntica en la vista del entrenador
 * (`components/entrenador/PanelNutricionAlumno.tsx:550–561`: mismas clases y mismo
 * `resumenMetas`). Extraída a la carpeta propia en fase B (R6: `common/` no se toca en
 * paralelo); se promueve en la fase D.
 *
 * §6: tiles con label + `text-base` (≥11px), tokens con variante clara/oscura.
 */
import type { ObjetivoMeta } from '../../../lib/nutricion-metas';

export interface GrillaObjetivosMetasProps {
  objetivos: ObjetivoMeta[];
}

export function GrillaObjetivosMetas({ objetivos }: GrillaObjetivosMetasProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {objetivos.map((objetivo) => (
        <div
          key={objetivo.etiqueta}
          className="p-3 rounded-2xl bg-secondary/40 border border-border"
        >
          <span className="block text-xs font-semibold uppercase text-muted-foreground">
            {objetivo.etiqueta}
          </span>
          <p className="text-base font-bold font-mono text-foreground mt-0.5">
            {objetivo.valor}
          </p>
        </div>
      ))}
    </div>
  );
}
