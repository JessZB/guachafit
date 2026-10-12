import React from 'react';
import { AlertTriangle, Check, Play, Zap } from 'lucide-react';
import type { SerieRegistroDetalleDTO } from '@guachafit/shared';
import { extraerNumeroPegado, filtrarEntradaPeso, filtrarEntradaReps, filtrarEntradaRpe } from '../../lib/entrada-numerica';
import { formatearPesoConUnidad, pasoPesoEnUnidad, type UnidadPeso } from '../../lib/weight-unit';
import { formatFechaHoraLocal } from '../../lib/date-format';
import { formatearDeltaSegundos } from '../../lib/sesion-tiempos';
import { pluralizar } from '../../lib/pluralizar';

/** Campo editable de una serie, con el nombre del contrato. */
export type CampoSerieEditable = 'pesoKg' | 'repsLogradas' | 'rpe';

/** Campos con steppers (+/-). */
export type CampoConStepper = Extract<CampoSerieEditable, 'pesoKg' | 'repsLogradas'>;

/**
 * Fila editable de una serie del alumno (RF-001): peso, repeticiones y esfuerzo con sus filtros
 * al teclear, steppers, marcado, "Iniciar serie", descanso real y error inline.
 *
 * Presentacional: la página calcula los valores mostrados (borrador o valor guardado) y los
 * errores, y recibe cada cambio por los handlers. Los filtros de entrada viven aquí porque
 * deciden qué llega a escribirse en el campo.
 */
export function FilaSerieEdicion({
  serie,
  unidadPeso,
  soloLectura,
  pesoMostrado,
  repsMostradas,
  rpeMostrado,
  pesoPrescritoKg,
  descansoRealSegundos,
  errorPeso,
  errorReps,
  errorRpe,
  errorSerie,
  onCambiar,
  onPaso,
  onSalirPeso,
  onSalirReps,
  onSalirRpe,
  onMarcar,
  onIniciar,
}: {
  serie: SerieRegistroDetalleDTO;
  unidadPeso: UnidadPeso;
  soloLectura: boolean;
  /** Texto del campo: el borrador si existe o el valor guardado ya formateado. */
  pesoMostrado: string;
  repsMostradas: string;
  rpeMostrado: string;
  /** Peso del plan en kg (texto del contrato), o `null` si la serie no trae uno con carga. */
  pesoPrescritoKg: string | null;
  /** Descanso real antes de esta serie; `null` si no hay medición. */
  descansoRealSegundos: number | null;
  errorPeso?: string;
  errorReps?: string;
  errorRpe?: string;
  /** Primer error visible de la serie (campo o rechazo del envío). */
  errorSerie: string | null;
  onCambiar: (campo: CampoSerieEditable, texto: string) => void;
  onPaso: (campo: CampoConStepper, delta: number) => void;
  onSalirPeso: () => void;
  onSalirReps: () => void;
  onSalirRpe: () => void;
  onMarcar: () => void;
  onIniciar: () => void;
}) {
  const pasoVisible = pasoPesoEnUnidad(unidadPeso);
  return (
    <div
      className={`p-2 sm:p-2.5 rounded-2xl border transition-all ${
        serie.completada
          ? 'bg-success/10 border-success/30'
          : 'bg-secondary/30 border-border hover:border-primary/40'
      }`}
    >
      {/* Móvil: una columna por campo (input legible + steppers táctiles). Desktop: grid de 12. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-12 sm:gap-2.5 sm:items-start">
        <span className="col-span-2 sm:col-span-1 self-center text-left sm:text-center font-mono font-bold text-sm sm:text-base text-foreground">
          #{serie.numeroSerie}
        </span>

        {/* Peso con steppers (unidad visible: kg/lb; el contrato siempre va en kg) */}
        <div className="col-span-2 sm:col-span-4">
          <span className="sm:hidden mb-1 block text-xs font-medium text-muted-foreground">
            Peso ({unidadPeso})
          </span>
          <div className="flex items-center rounded-xl bg-background border border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 overflow-hidden transition-colors h-12 sm:h-11 shadow-2xs">
            <button
              type="button"
              disabled={soloLectura}
              onClick={() => onPaso('pesoKg', -1)}
              aria-label={`Restar ${pasoVisible} ${unidadPeso}`}
              className="h-full w-11 sm:w-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:bg-secondary transition-colors cursor-pointer text-base font-bold shrink-0 select-none disabled:opacity-30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:text-primary"
            >
              -
            </button>
            <input
              type="text"
              inputMode="decimal"
              disabled={soloLectura}
              value={pesoMostrado}
              onChange={(e) => {
                // Lote E3: lo que no es un peso válido (letras, >999 kg) no llega a escribirse.
                const filtrado = filtrarEntradaPeso(e.target.value, pesoMostrado, unidadPeso);
                if (filtrado !== pesoMostrado) onCambiar('pesoKg', filtrado);
              }}
              onPaste={(e) => {
                // Lote E7: '60 kg' pegado (p. ej. desde el plan) escribe 60.
                const numero = extraerNumeroPegado(e.clipboardData.getData('text'));
                if (numero === null) return;
                e.preventDefault();
                const filtrado = filtrarEntradaPeso(numero, pesoMostrado, unidadPeso);
                if (filtrado !== pesoMostrado) onCambiar('pesoKg', filtrado);
              }}
              onBlur={() => onSalirPeso()}
              placeholder={unidadPeso}
              aria-label={`Peso real en ${unidadPeso}, serie ${serie.numeroSerie}`}
              aria-invalid={Boolean(errorPeso)}
              className={`w-full min-w-0 text-center py-2 px-1 bg-transparent text-base font-mono font-bold text-foreground focus:outline-hidden ${
                errorPeso ? 'text-destructive' : ''
              }`}
            />
            <button
              type="button"
              disabled={soloLectura}
              onClick={() => onPaso('pesoKg', 1)}
              aria-label={`Sumar ${pasoVisible} ${unidadPeso}`}
              className="h-full w-11 sm:w-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:bg-secondary transition-colors cursor-pointer text-base font-bold shrink-0 select-none disabled:opacity-30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:text-primary"
            >
              +
            </button>
          </div>
          {/* Referencia prescrita por serie: permanece visible mientras el alumno edita */}
          {pesoPrescritoKg && (
            <span
              className="block text-center text-xs font-medium text-muted-foreground leading-tight mt-1 sm:mt-0.5 truncate"
              title={`Plan: ${formatearPesoConUnidad(pesoPrescritoKg, unidadPeso)}`}
            >
              Plan: {formatearPesoConUnidad(pesoPrescritoKg, unidadPeso)}
            </span>
          )}
        </div>

        {/* Repeticiones con steppers (- / + 1) */}
        <div className="col-span-2 sm:col-span-3">
          <span className="sm:hidden mb-1 block text-xs font-medium text-muted-foreground">
            Repeticiones
          </span>
          <div className="flex items-center rounded-xl bg-background border border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 overflow-hidden transition-colors h-12 sm:h-11 shadow-2xs">
            <button
              type="button"
              disabled={soloLectura}
              onClick={() => onPaso('repsLogradas', -1)}
              aria-label="Restar 1 repetición"
              className="h-full w-11 sm:w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:bg-secondary transition-colors cursor-pointer text-base font-bold shrink-0 select-none disabled:opacity-30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:text-primary"
            >
              -
            </button>
            <input
              type="text"
              inputMode="numeric"
              disabled={soloLectura}
              value={repsMostradas}
              onChange={(e) => {
                // Sin ceros a la izquierda ('05' → '5'); fuera de 0–200 no se escribe.
                const nuevo = e.target.value.replace(/^0+(?=\d)/, '');
                const filtrado = filtrarEntradaReps(nuevo, repsMostradas);
                if (filtrado !== repsMostradas) onCambiar('repsLogradas', filtrado);
              }}
              onBlur={() => onSalirReps()}
              aria-label={`Repeticiones hechas, serie ${serie.numeroSerie}`}
              aria-invalid={Boolean(errorReps)}
              className={`w-full min-w-0 text-center py-2 px-1 bg-transparent text-base font-mono font-bold text-foreground focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                errorReps ? 'text-destructive' : ''
              }`}
            />
            <button
              type="button"
              disabled={soloLectura}
              onClick={() => onPaso('repsLogradas', 1)}
              aria-label="Sumar 1 repetición"
              className="h-full w-11 sm:w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:bg-secondary transition-colors cursor-pointer text-base font-bold shrink-0 select-none disabled:opacity-30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:text-primary"
            >
              +
            </button>
          </div>
          <span className="block text-center text-xs font-medium text-muted-foreground leading-tight mt-1 sm:mt-0.5">
            Objetivo: {pluralizar(serie.repsObjetivo, 'repetición', 'repeticiones')}
          </span>
        </div>

        {/* Esfuerzo (1-10, validado contra el contrato) */}
        <div className="col-span-1 sm:col-span-2">
          <span className="sm:hidden mb-1 block text-xs font-medium text-muted-foreground">
            Esfuerzo (1-10)
          </span>
          <input
            type="text"
            inputMode="decimal"
            disabled={soloLectura}
            value={rpeMostrado}
            onChange={(e) => {
              const filtrado = filtrarEntradaRpe(e.target.value, rpeMostrado);
              if (filtrado !== rpeMostrado) onCambiar('rpe', filtrado);
            }}
            onBlur={() => onSalirRpe()}
            placeholder="8.5"
            aria-label={`Esfuerzo de 1 a 10, serie ${serie.numeroSerie}`}
            aria-invalid={Boolean(errorRpe)}
            className={`w-full text-center py-2 px-1 rounded-xl bg-background border text-base sm:text-sm font-mono font-bold text-foreground focus:outline-hidden focus:border-primary focus:ring-2 focus:ring-primary/25 h-12 sm:h-11 shadow-2xs ${
              errorRpe ? 'border-destructive text-destructive' : 'border-border'
            }`}
          />
        </div>

        {/* Marcar la serie como completada */}
        <div className="col-span-1 sm:col-span-2">
          <span className="sm:hidden mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Listo
          </span>
          <div className="flex sm:justify-center">
            <button
              type="button"
              disabled={soloLectura}
              onClick={() => onMarcar()}
              aria-label={`Marcar serie ${serie.numeroSerie} como ${serie.completada ? 'pendiente' : 'completada'}`}
              className={`h-12 w-12 sm:h-11 sm:w-11 rounded-2xl flex items-center justify-center transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${
                serie.completada
                  ? 'bg-success-strong text-white shadow-md shadow-success-strong/25 scale-105'
                  : 'bg-background border-2 border-border text-muted-foreground hover:border-primary'
              }`}
            >
              {serie.completada && <Check className="h-5 w-5 sm:h-6 sm:w-6 stroke-[3.5]" />}
            </button>
          </div>
        </div>
      </div>

      {/* WU17: captura sin fricción del inicio real (mide el descanso de la próxima serie) */}
      {!soloLectura && !serie.completada && !serie.timestampInicioUtc && (
        <button
          type="button"
          onClick={() => onIniciar()}
          title="Marca el inicio de esta serie para medir tu descanso real"
          className="mt-2 w-full min-h-11 py-2 rounded-xl inline-flex items-center justify-center gap-1.5 text-xs font-bold bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 transition-colors cursor-pointer active:scale-95"
        >
          <Play className="h-3 w-3 fill-current" />
          <span>Iniciar serie</span>
        </button>
      )}
      {!soloLectura && !serie.completada && serie.timestampInicioUtc && (
        <p className="mt-1.5 px-1 text-xs font-mono font-bold text-primary">
          Iniciada {formatFechaHoraLocal(serie.timestampInicioUtc) ?? ''}
        </p>
      )}
      {/* WU17: feedback inmediato del descanso real al cerrar la serie */}
      {serie.completada && descansoRealSegundos !== null && (
        <p className="mt-1.5 px-1 text-xs font-mono font-bold text-primary flex items-center gap-1">
          <Zap className="h-3 w-3 shrink-0" />
          <span>Descanso real: {formatearDeltaSegundos(descansoRealSegundos)}</span>
        </p>
      )}

      {/* WU3b: error inline, nunca silencioso */}
      {errorSerie && (
        <p
          role="alert"
          className="mt-1.5 px-1 text-xs font-bold text-destructive flex items-center gap-1"
        >
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{errorSerie}</span>
        </p>
      )}
    </div>
  );
}
