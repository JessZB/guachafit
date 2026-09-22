import React from 'react';
import { normalizarPesoPrescritoTexto } from '../../lib/weight-unit';

/**
 * Campo de carga prescrita (WU5): acepta vacío (prescripción cualitativa), normaliza la
 * coma decimal y muestra el error inline sin bloquear la escritura. Compartido por el
 * modal de prescripción del Expediente 360° y el editor de plantillas del banco (WU6b).
 */
export function CampoPesoPrescrito({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (nuevoValor: string) => void;
}) {
  const { error } = normalizarPesoPrescritoTexto(valor);
  return (
    <div className="flex flex-col items-center">
      <label className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">
        Peso
      </label>
      <input
        type="text"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="60 o vacío"
        aria-invalid={Boolean(error)}
        title="Carga prescrita: número (60 o 60.5) o texto cualitativo (Corporal). Vacío = sin carga."
        className={`h-8 w-18 sm:w-22 px-2 rounded-lg bg-background border text-center font-mono font-bold text-xs text-foreground focus:outline-hidden focus:border-primary transition-colors ${
          error ? 'border-destructive/70' : 'border-border'
        }`}
      />
      {error && (
        <span className="text-[11px] font-bold text-destructive text-center mt-0.5 max-w-24 leading-tight">
          {error}
        </span>
      )}
    </div>
  );
}
