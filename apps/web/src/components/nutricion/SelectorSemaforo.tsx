/**
 * Módulo 3 · Nutrición: semáforo del día del alumno.
 *
 * Grupo con nombre (`fieldset`/`legend`); cada opción anuncia si está elegida (`aria-pressed`).
 * El grupo puede recibir el foco (`tabIndex=-1`) para llevar al alumno hasta aquí cuando intenta
 * guardar sin elegir, y el error se muestra junto al grupo.
 */
import React, { type Ref } from 'react';
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { SemaforoNutricional } from '@guachafit/shared';
import { ETIQUETA_SEMAFORO } from '../../lib/nutricion-checkin';

/** Opciones del semáforo del día: color, icono y texto que explica cada nivel. */
const OPCIONES_SEMAFORO = [
  {
    valor: SemaforoNutricional.CUMPLIDO,
    titulo: 'Cumplido',
    detalle: 'Seguí mi plan (90 % o más)',
    Icono: CheckCircle2,
    claseIcono: 'text-success',
    claseActiva: 'bg-success/20 border-success text-success shadow-lg shadow-success/20 scale-102',
    claseInactiva: 'bg-card border-border hover:border-success/40 text-muted-foreground',
  },
  {
    valor: SemaforoNutricional.PARCIAL,
    titulo: 'Parcial',
    detalle: 'Desvío menor',
    Icono: AlertCircle,
    claseIcono: 'text-warning',
    claseActiva: 'bg-warning/20 border-warning text-warning shadow-lg shadow-warning/20 scale-102',
    claseInactiva: 'bg-card border-border hover:border-warning/40 text-muted-foreground',
  },
  {
    valor: SemaforoNutricional.NO_CUMPLIDO,
    titulo: 'No Cumplido',
    detalle: 'Fuera de plan',
    Icono: XCircle,
    claseIcono: 'text-destructive',
    claseActiva:
      'bg-destructive/20 border-destructive text-destructive shadow-lg shadow-destructive/20 scale-102',
    claseInactiva: 'bg-card border-border hover:border-destructive/40 text-muted-foreground',
  },
] as const;

const ID_ERROR = 'semaforo-error';

export interface SelectorSemaforoProps {
  valor: SemaforoNutricional | null;
  onCambiar: (valor: SemaforoNutricional) => void;
  deshabilitado: boolean;
  /** Error visible junto al grupo (p. ej. se intentó guardar sin elegir). */
  error: string | null;
  /** Texto bajo la pregunta (p. ej. el reporte ya quedó registrado). */
  nota?: string | null;
  refGrupo?: Ref<HTMLFieldSetElement>;
}

export function SelectorSemaforo({
  valor,
  onCambiar,
  deshabilitado,
  error,
  nota = null,
  refGrupo,
}: SelectorSemaforoProps) {
  return (
    <fieldset
      ref={refGrupo}
      tabIndex={-1}
      aria-describedby={error ? ID_ERROR : undefined}
      className="space-y-3 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
        {ETIQUETA_SEMAFORO}
      </legend>
      {nota && <p className="px-1 text-xs text-muted-foreground">{nota}</p>}
      <div className="grid grid-cols-3 gap-3">
        {OPCIONES_SEMAFORO.map(
          ({ valor: opcion, titulo, detalle, Icono, claseIcono, claseActiva, claseInactiva }) => (
            <button
              key={opcion}
              type="button"
              aria-pressed={valor === opcion}
              disabled={deshabilitado}
              onClick={() => onCambiar(opcion)}
              className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                valor === opcion ? claseActiva : claseInactiva
              }`}
            >
              <Icono className={`h-8 w-8 mb-1 ${claseIcono}`} aria-hidden="true" />
              <span className="font-extrabold text-sm text-foreground">{titulo}</span>
              <span className="text-xs text-muted-foreground mt-0.5 text-center">{detalle}</span>
            </button>
          )
        )}
      </div>
      {error && (
        <p id={ID_ERROR} role="alert" className="px-1 text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
