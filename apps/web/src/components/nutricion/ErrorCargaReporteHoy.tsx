/**
 * Módulo 3 · Nutrición: fallo al consultar el reporte de hoy (distinto de "aún no hay
 * reporte"), con opción de reintentar.
 */
import React from 'react';

export interface ErrorCargaReporteHoyProps {
  mensaje: string;
  onReintentar: () => void;
}

export function ErrorCargaReporteHoy({ mensaje, onReintentar }: ErrorCargaReporteHoyProps) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-destructive/10 border border-destructive/25"
    >
      <p className="text-xs text-destructive font-semibold">{mensaje}</p>
      <button
        type="button"
        onClick={onReintentar}
        className="shrink-0 min-h-11 px-3 rounded-xl bg-secondary text-foreground text-xs font-bold hover:bg-secondary/80 cursor-pointer"
      >
        Reintentar
      </button>
    </div>
  );
}
