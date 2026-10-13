/**
 * Átomo de error con reintento (fase C, prompt 48).
 *
 * Consolida el bloque de error honesto duplicado en ≥10 vistas
 * (`PagosPage.tsx:573-586`, `AlumnosPage.tsx:764-777`,
 * `PlantillasPage.tsx:620-633`, `ProgresoPage.tsx:493-506`,
 * `CarteraPage.tsx:424-434`, `MonitorAdherenciaPage.tsx:671-686`,
 * `ConciliacionPage.tsx:317-328`, `AlumnoDetallePage.tsx:2139-2163`,
 * `AjustesPage.tsx:607-622`, `EntrenamientoPage.tsx:2009-2029`).
 *
 * Divergencias deliberadas respecto a las copias (ver reporte 48 §2):
 * - `role="alert"` siempre (la copia de nutrición `NutricionPage.tsx:707-718` no
 *   lo tenía; la del entrenador sí).
 * - El reintento usa `BotonTactil` (`min-h-11`, §6.8): las copias con `py-2.5`
 *   quedaban en ~40px.
 */
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { BotonTactil } from './BotonTactil';

export interface EstadoErrorProps {
  /** Título del bloque. Por defecto "No pudimos cargar la información". */
  titulo?: string;
  /** Detalle técnico o mensaje del fallo. */
  mensaje?: ReactNode;
  onReintentar: () => void;
  textoReintentar?: string;
}

export function EstadoError({
  titulo = 'No pudimos cargar la información',
  mensaje,
  onReintentar,
  textoReintentar = 'Reintentar',
}: EstadoErrorProps) {
  return (
    <div
      role="alert"
      className="p-5 rounded-3xl bg-card border border-destructive/30 text-center space-y-3"
    >
      <AlertTriangle aria-hidden="true" className="h-7 w-7 text-destructive mx-auto" />
      <h3 className="text-sm font-bold text-foreground">{titulo}</h3>
      {mensaje ? <p className="text-xs text-muted-foreground">{mensaje}</p> : null}
      <BotonTactil onClick={onReintentar}>{textoReintentar}</BotonTactil>
    </div>
  );
}
