/**
 * Badge de tono semántico de la tabla de cartera (prompt 85, Ola 3).
 *
 * Recorte verbatim de `components/entrenador/TablaCartera.tsx`: el mapa de
 * tonos usa `destructive` (no `danger` como `ui/BadgeEstado`), así que NO es
 * sustituible de forma mecánica y queda como ÚNICO con CANDIDATO a
 * `BadgeEstado` para el cierre. Sin dominio ni datos (R1).
 */
import React from 'react';

const CLASES_TONO: Record<string, string> = {
  success: 'bg-success/15 text-success border-success/25',
  warning: 'bg-warning/15 text-warning border-warning/25',
  danger: 'bg-destructive/15 text-destructive border-destructive/25',
  info: 'bg-primary/15 text-primary border-primary/25',
  neutral: 'bg-secondary text-muted-foreground border-border',
};

export function BadgeCartera({
  tono,
  children,
}: {
  tono: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold uppercase tracking-wide ${
        CLASES_TONO[tono] ?? CLASES_TONO.neutral
      }`}
    >
      {children}
    </span>
  );
}
