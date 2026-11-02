import type { RefObject } from 'react';
import { Award, CheckCircle2, Timer, X } from 'lucide-react';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { describirEsfuerzo } from '../../../lib/entrenamiento-textos';
import { formatearSegundos } from '../../../lib/sesion-tiempos';
import { resumirDescansos } from '../../../lib/entrenamiento-descansos';
import { triggerHaptic } from '../../../lib/haptics';

export interface ModalFinalizarSesionProps {
  sesion: SesionEntrenamientoDetalleDTO;
  rpeSesion: number | null;
  onRpeChange: (valor: number) => void;
  molestia: string;
  onMolestiaChange: (zona: string) => void;
  notasCoachInput: string;
  onNotasChange: (texto: string) => void;
  isFinishing: boolean;
  onClose: () => void;
  onConfirm: () => void;
  dialogRef: RefObject<HTMLDivElement | null>;
}

/** Modal de finalización y feedback al entrenador (ÚNICO: RPE 1–10 + molestias + notas). */
export function ModalFinalizarSesion({
  sesion,
  rpeSesion,
  onRpeChange,
  molestia,
  onMolestiaChange,
  notasCoachInput,
  onNotasChange,
  isFinishing,
  onClose,
  onConfirm,
  dialogRef,
}: ModalFinalizarSesionProps) {
  const resumenDescansos = resumirDescansos(sesion.ejercicios);

  const totalSeries = sesion.ejercicios.reduce(
    (acc, ej) => acc + ej.series.length,
    0
  );
  const seriesCompletadas = sesion.ejercicios.reduce(
    (acc, ej) => acc + ej.series.filter((s) => s.completada).length,
    0
  );
  const seriesPendientes = Math.max(0, totalSeries - seriesCompletadas);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-finish-title"
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border/80 shadow-2xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
      >
        {/* Header del Modal */}
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/15 text-primary">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h3 id="modal-finish-title" className="font-bold text-base text-foreground leading-tight">
                Finalizar entrenamiento
              </h3>
              <p className="text-xs text-muted-foreground">Cuéntale a tu entrenador cómo te fue</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar sin finalizar"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Resumen honesto de series (ENT-02) */}
        <div
          role="status"
          className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-2 ${
            seriesPendientes === 0
              ? 'bg-success/10 border-success/30 text-success'
              : 'bg-warning/10 border-warning/30 text-warning-foreground'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              {seriesPendientes === 0
                ? `Completaste todas las series (${totalSeries} de ${totalSeries}).`
                : seriesPendientes === 1
                ? `Hiciste ${seriesCompletadas} de ${totalSeries} series. 1 serie quedará sin completar.`
                : `Hiciste ${seriesCompletadas} de ${totalSeries} series. Las otras ${seriesPendientes} quedarán sin completar.`}
            </span>
          </div>
        </div>

        {/* Esfuerzo global de la sesión (escala completa 1-10) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span id="finalizar-esfuerzo-titulo" className="text-xs font-bold text-foreground">
              ¿Qué tan duro fue? (1 a 10)
            </span>
            {rpeSesion !== null ? (
              <span className="text-primary font-mono font-bold text-sm text-right">
                {rpeSesion} / 10 · <span className="text-xs font-semibold text-muted-foreground">{describirEsfuerzo(rpeSesion)}</span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground font-medium">Sin seleccionar (opcional)</span>
            )}
          </div>
          <div
            role="group"
            aria-labelledby="finalizar-esfuerzo-titulo"
            className="grid grid-cols-5 gap-2"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
              <button
                key={val}
                type="button"
                aria-pressed={rpeSesion === val}
                aria-label={`Esfuerzo ${val} de 10: ${describirEsfuerzo(val)}`}
                onClick={() => {
                  triggerHaptic('light');
                  onRpeChange(val);
                }}
                className={`min-h-11 py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  rpeSesion === val
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25 scale-105'
                    : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                }`}
              >
                {val}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground px-1 font-medium">
            <span>1-4: Suave</span>
            <span>5-6: Moderado</span>
            <span>7-8: Exigente</span>
            <span>9-10: Al límite</span>
          </div>
        </div>

        {/* Molestias o dolores articulares */}
        <div className="space-y-2">
          <span id="finalizar-molestia-titulo" className="block text-xs font-bold text-foreground">
            ¿Sentiste alguna molestia o dolor?
          </span>
          <div
            role="group"
            aria-labelledby="finalizar-molestia-titulo"
            className="flex flex-wrap gap-2"
          >
            {['Ninguna 👍', 'Hombro', 'Rodilla', 'Lumbar', 'Codo', 'Muñeca', 'Otra'].map((zona) => (
              <button
                key={zona}
                type="button"
                aria-pressed={molestia === zona}
                onClick={() => {
                  triggerHaptic('light');
                  onMolestiaChange(zona);
                }}
                className={`min-h-11 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  molestia === zona
                    ? 'bg-warning/20 text-warning border border-warning/40 shadow-xs'
                    : 'bg-secondary/40 text-muted-foreground hover:text-foreground border border-transparent'
                }`}
              >
                {zona}
              </button>
            ))}
          </div>
        </div>

        {/* Notas para tu entrenador */}
        <div className="space-y-1.5">
          <label
            htmlFor="finalizar-notas-entrenador"
            className="text-xs font-bold text-foreground flex items-center justify-between"
          >
            <span>Notas para tu entrenador</span>
            <span className="text-xs text-muted-foreground font-normal">Opcional</span>
          </label>
          <textarea
            id="finalizar-notas-entrenador"
            rows={3}
            value={notasCoachInput}
            onChange={(e) => onNotasChange(e.target.value)}
            placeholder="Ej: Tuve que usar mancuernas porque la barra estaba ocupada. Sentí buena energía en sentadillas..."
            className="w-full p-3 rounded-2xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-primary resize-none"
          />
        </div>

        {/* Resumen comparativo de descansos */}
        {resumenDescansos && (
          <div className="p-3 rounded-2xl bg-secondary/40 border border-border/70 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" />
              <div>
                <span className="font-bold text-foreground block">Descanso promedio</span>
                <span className="text-[11px] text-muted-foreground">Planificado: {formatearSegundos(resumenDescansos.avgPrescrito)}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="font-mono font-bold text-sm text-foreground">{formatearSegundos(resumenDescansos.avgReal)}</span>
              <span
                className={`text-[11px] font-bold block ${
                  resumenDescansos.diff > 15
                    ? 'text-warning'
                    : resumenDescansos.diff < -15
                    ? 'text-info'
                    : 'text-success'
                }`}
              >
                {resumenDescansos.diff > 0
                  ? `+${formatearSegundos(resumenDescansos.diff)} extra`
                  : resumenDescansos.diff < 0
                  ? `${formatearSegundos(-resumenDescansos.diff)} menos`
                  : 'Adherido al plan'}
              </span>
            </div>
          </div>
        )}

        {/* Botón de Enviar */}
        <button
          type="button"
          onClick={onConfirm}
          disabled={isFinishing}
          className="w-full min-h-11 py-3 px-4 rounded-2xl bg-primary hover:brightness-110 text-primary-foreground font-bold text-sm tracking-wide shadow-md shadow-primary/25 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>{isFinishing ? 'Guardando entrenamiento...' : 'Guardar y enviar a mi entrenador'}</span>
        </button>
      </div>
    </div>
  );
}
