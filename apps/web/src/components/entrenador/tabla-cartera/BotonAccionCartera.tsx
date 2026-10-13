/**
 * Botón de acción por fila de la tabla de cartera (prompt 85, Ola 3).
 *
 * Recorte verbatim de `components/entrenador/TablaCartera.tsx`: usa
 * `px-2.5 py-1.5 text-[11px]` (no `min-h-11` como `ui/BotonTactil`), así que
 * NO es sustituible de forma mecánica y queda como ÚNICO con CANDIDATO a
 * `BotonTactil` para el cierre. Sin dominio ni datos (R1).
 */
import React from 'react';

export function BotonAccionCartera({
  onClick,
  icono: Icono,
  texto,
  variante = 'secundario',
  deshabilitado = false,
}: {
  onClick: () => void;
  icono: React.ComponentType<{ className?: string }>;
  texto: string;
  variante?: 'primario' | 'secundario';
  deshabilitado?: boolean;
}) {
  const clase =
    variante === 'primario'
      ? 'bg-primary text-primary-foreground hover:brightness-110 shadow-sm shadow-primary/20'
      : 'bg-secondary/70 text-foreground hover:bg-secondary border border-border/70';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${clase}`}
    >
      <Icono className="h-3.5 w-3.5 shrink-0" />
      <span>{texto}</span>
    </button>
  );
}
