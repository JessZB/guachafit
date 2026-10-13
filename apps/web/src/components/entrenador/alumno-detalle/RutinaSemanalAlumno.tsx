/**
 * Rutina semanal asignada en lectura (organismo ÚNICO).
 *
 * Presentacional: bloques, flag de archivado y callbacks por props (R1). Extraída de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-6). Conserva idénticos el título
 * `Rutina Semanal Asignada`, el conteo (`1 ejercicio`), los botones `Editar rutina semanal`
 * y `Cargar desde plantilla`, y el estado vacío que consultan los specs.
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import type { BloqueDiaRutinaDTO } from '@guachafit/shared';
import { ClipboardList, Pencil } from 'lucide-react';
import { pluralizar } from '../../../lib/pluralizar';
import { FilaEjercicioPrescrito } from './FilaEjercicioPrescrito';

export interface RutinaSemanalAlumnoProps {
  bloques: BloqueDiaRutinaDTO[];
  /** Archivado: no se puede asignar plantilla sin restaurar antes. */
  archivado: boolean;
  onCargarPlantilla: () => void;
  onEditarRutina: () => void;
}

export function RutinaSemanalAlumno({
  bloques: rutinaSemanal,
  archivado: isArchived,
  onCargarPlantilla,
  onEditarRutina,
}: RutinaSemanalAlumnoProps) {
  return (
    <div
      id="seccion-rutina-semanal"
      className="scroll-mt-24 pt-6 border-t border-border/70 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">Rutina Semanal Asignada</h3>
          <p className="text-xs text-muted-foreground">
            Estructura de días, ejercicios, series, repeticiones y cargas asignadas al alumno.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* WU6b: RF-017 Escenario 2 — clonar una plantilla del banco con ajuste de cargas */}
          <button
            type="button"
            onClick={onCargarPlantilla}
            disabled={isArchived}
            title={
              isArchived
                ? 'Restaura al alumno para asignarle una plantilla'
                : 'Selecciona una plantilla y ajusta cargas antes de confirmar'
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground font-bold text-xs border border-border transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ClipboardList className="h-3.5 w-3.5 text-primary" />
            <span>Cargar desde plantilla</span>
          </button>

          <button
            type="button"
            onClick={onEditarRutina}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Editar rutina semanal</span>
          </button>
        </div>
      </div>

      {rutinaSemanal.length === 0 ? (
        <div className="p-8 rounded-2xl bg-card border border-dashed border-border/70 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
          <p className="text-xs text-muted-foreground">
            Este alumno aún no tiene una rutina semanal activa. Usa «Editar / Asignar
            Rutina» para crear su planificación.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
        {rutinaSemanal.map((bloque) => (
          <div
            key={bloque.diaId}
            className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <div>
                <h4 className="font-bold text-sm text-foreground">{bloque.titulo}</h4>
                <p className="text-[11px] text-muted-foreground">{bloque.enfoque}</p>
              </div>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border">
                {pluralizar(bloque.ejercicios.length, 'ejercicio', 'ejercicios')}
              </span>
            </div>

            <div className="space-y-2">
              {bloque.ejercicios.map((ej, ejIdx: number) => (
                <FilaEjercicioPrescrito
                  key={ej.id ?? `${bloque.diaId}-${ejIdx}`}
                  ejercicio={ej}
                  indice={ejIdx}
                />
              ))}
            </div>
          </div>
        ))}
        </div>
      )}
    </div>
  );
}
