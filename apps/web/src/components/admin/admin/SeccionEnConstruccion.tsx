/**
 * RF-010 (WU Admin): capacidades administrativas pendientes con copy honesto.
 *
 * Componente presentacional puro (sin datos): declara lo que aún no existe sin fabricar
 * pantallas ni datos. Recorte verbatim de `AdminPage`.
 */
import React from 'react';
import { Clock } from 'lucide-react';

export interface SeccionEnConstruccionProps {
  capacidades: string[];
}

export function SeccionEnConstruccion({ capacidades }: SeccionEnConstruccionProps) {
  return (
    <section className="p-5 rounded-2xl bg-card/60 border border-border/70 space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-warning" />
        <h2 className="text-sm font-bold text-foreground">En construcción</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Estas capacidades de administración todavía no están disponibles:
      </p>
      <ul className="space-y-1.5">
        {capacidades.map((capacidad) => (
          <li key={capacidad} className="text-xs text-muted-foreground flex gap-2">
            <span className="text-muted-foreground/70">•</span>
            <span>{capacidad}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
