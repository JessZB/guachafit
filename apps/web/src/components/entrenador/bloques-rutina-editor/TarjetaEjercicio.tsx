/**
 * Módulo `bloques-rutina-editor` (Ola 2, prompt 74) · tarjeta de un ejercicio del día.
 *
 * Origen: `BloquesRutinaEditor.tsx:396-607` (cabecera con renombre inline, pods de
 * prescripción series/reps/peso/RPE/descanso y notas técnicas opcionales).
 * Componente único de la vista (R3: el pod de `ContenidoRutinaSemanal.tsx:280-387`
 * usa steppers de 28px sin `aria-label` y otra estructura, así que la sustitución no
 * es mecánica). Solo props y callbacks (R1): sin `useQuery` ni `api-client` (R9).
 * Conserva roles, labels, títulos y textos que usan los specs (R5). El estado de
 * renombre inline vive aquí: al cambiar de día las filas se desmontan (claves por
 * `ej.id`), así que no hace falta el reset que hacía el contenedor.
 *
 * §6: español claro, `filtrarEntradaRepsPrescritas`/`filtrarEntradaRpe` + `inputMode`
 * en numéricos, `formatearSegundos` en descansos, controles 44px (`min-h-11`/`h-11`),
 * piso 11px, tokens con variante claro/oscuro, pesos ≤ 700.
 */
import { useState } from 'react';
import { Check, Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { DESCANSO_OPCIONES, type EjercicioEdicion } from '../../../lib/rutina-bloques';
import { triggerHaptic } from '../../../lib/haptics';
import { formatearSegundos } from '../../../lib/sesion-tiempos';
import { filtrarEntradaRepsPrescritas, filtrarEntradaRpe } from '../../../lib/entrada-numerica';
import { CampoPesoPrescrito } from '../CampoPesoPrescrito';

interface TarjetaEjercicioProps {
  ejercicio: EjercicioEdicion;
  indice: number;
  idBase: string;
  mostrarNotas: boolean;
  onActualizarCampo: (campo: string, valor: unknown) => void;
  onCambiarSeries: (delta: number) => void;
  onPedirBorrar: () => void;
}

export function TarjetaEjercicio({
  ejercicio: ej,
  indice: ejIdx,
  idBase,
  mostrarNotas,
  onActualizarCampo,
  onCambiarSeries,
  onPedirBorrar,
}: TarjetaEjercicioProps) {
  const [editandoNombre, setEditandoNombre] = useState(false);

  return (
    <div className="p-3.5 rounded-2xl bg-card border border-border/80 text-xs shadow-2xs hover:border-primary/40 transition-all space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <span className="h-6 w-6 rounded-lg bg-primary/10 text-primary font-mono font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
            {ejIdx + 1}
          </span>
          <div className="flex-1 min-w-0">
            {editandoNombre ? (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <input
                  type="text"
                  aria-label={`Nombre del ejercicio ${ejIdx + 1}`}
                  value={ej.nombre}
                  onChange={(e) => onActualizarCampo('nombre', e.target.value)}
                  onBlur={() => setEditandoNombre(false)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditandoNombre(false)}
                  autoFocus
                  className="w-full px-2 py-1 rounded-lg bg-background border border-primary text-xs font-bold text-foreground focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setEditandoNombre(false)}
                  className="min-h-11 min-w-11 flex items-center justify-center rounded-lg text-primary hover:bg-primary/10 cursor-pointer shrink-0"
                  title="Confirmar nombre"
                  aria-label="Confirmar nombre"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group/name flex-wrap">
                <h4
                  title={ej.nombre}
                  className="font-bold text-foreground text-sm sm:text-base leading-snug break-words"
                >
                  {ej.nombre}
                </h4>
                <button
                  type="button"
                  onClick={() => setEditandoNombre(true)}
                  title="Editar el nombre del ejercicio"
                  aria-label={`Editar el nombre de ${ej.nombre}`}
                  className="min-h-11 min-w-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer shrink-0"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onPedirBorrar();
          }}
          title="Eliminar este ejercicio"
          aria-label={`Eliminar ${ej.nombre}`}
          className="min-h-11 min-w-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 flex-wrap pt-2 border-t border-border/40">
        <div className="flex items-center gap-2 p-1.5 rounded-xl bg-secondary/30 border border-border/50">
          <div className="flex flex-col items-center">
            <span
              id={`${idBase}-ej-${ejIdx}-series`}
              className="text-xs font-medium text-muted-foreground block mb-0.5"
            >
              Series
            </span>
            <div
              role="group"
              aria-labelledby={`${idBase}-ej-${ejIdx}-series`}
              className="flex items-center gap-1 rounded-lg bg-background border border-border p-0.5"
            >
              <button
                type="button"
                onClick={() => onCambiarSeries(-1)}
                disabled={(ej.series || 1) <= 1}
                title="Reducir series"
                aria-label="Reducir series"
                className="h-11 w-11 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <span
                aria-live="polite"
                className="w-6 text-center font-mono font-bold text-xs text-foreground select-none"
              >
                {ej.series || 1}
              </span>
              <button
                type="button"
                onClick={() => onCambiarSeries(1)}
                disabled={(ej.series || 1) >= 20}
                title="Aumentar series"
                aria-label="Aumentar series"
                className="h-11 w-11 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <label
              htmlFor={`${idBase}-ej-${ejIdx}-reps`}
              className="text-xs font-medium text-muted-foreground block mb-0.5"
            >
              Repeticiones
            </label>
            <input
              id={`${idBase}-ej-${ejIdx}-reps`}
              type="text"
              inputMode="text"
              value={ej.reps}
              onChange={(e) => {
                const filtrado = filtrarEntradaRepsPrescritas(e.target.value, ej.reps);
                if (filtrado !== ej.reps) onActualizarCampo('reps', filtrado);
              }}
              placeholder="8-12"
              title="Un número (10), un rango (8-10) o segundos (45 s)"
              className="h-11 sm:h-9 w-16 sm:w-20 px-2 rounded-lg bg-background border border-border text-center font-mono font-semibold text-sm text-foreground focus:outline-hidden focus:border-primary transition-colors"
            />
          </div>

          <CampoPesoPrescrito
            valor={ej.peso ?? ''}
            onChange={(nuevoValor) => onActualizarCampo('peso', nuevoValor)}
          />
        </div>

        <div className="flex items-center gap-2 p-1.5 rounded-xl bg-secondary/30 border border-border/50">
          <div className="flex flex-col items-center">
            <label
              htmlFor={`${idBase}-ej-${ejIdx}-rpe`}
              title="Esfuerzo percibido de 1 a 10"
              className="text-xs font-medium text-muted-foreground block mb-0.5"
            >
              Esfuerzo (1-10)
            </label>
            <input
              id={`${idBase}-ej-${ejIdx}-rpe`}
              type="text"
              inputMode="decimal"
              value={ej.rpe || ''}
              onChange={(e) => {
                const anterior = ej.rpe || '';
                const filtrado = filtrarEntradaRpe(e.target.value, anterior);
                if (filtrado !== anterior) onActualizarCampo('rpe', filtrado);
              }}
              placeholder="8"
              className="h-11 sm:h-9 w-14 sm:w-16 px-1.5 rounded-lg bg-background border border-border text-center font-mono font-semibold text-sm text-foreground focus:outline-hidden focus:border-primary transition-colors"
            />
          </div>

          <div className="flex flex-col items-center">
            <label
              htmlFor={`${idBase}-ej-${ejIdx}-descanso`}
              className="text-xs font-medium text-muted-foreground block mb-0.5"
            >
              Descanso
            </label>
            <select
              id={`${idBase}-ej-${ejIdx}-descanso`}
              value={ej.descansoSegundos || 90}
              onChange={(e) =>
                onActualizarCampo('descansoSegundos', parseInt(e.target.value, 10))
              }
              className="h-8 px-2 rounded-lg bg-background border border-border text-center font-mono font-bold text-xs text-foreground focus:outline-hidden focus:border-primary transition-colors cursor-pointer"
            >
              {DESCANSO_OPCIONES.map((segundos) => (
                <option key={segundos} value={segundos}>
                  {formatearSegundos(segundos)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {mostrarNotas && (
        <div className="pt-2 border-t border-border/40">
          <label
            htmlFor={`${idBase}-ej-${ejIdx}-notas`}
            className="text-xs font-medium text-muted-foreground block mb-1"
          >
            Notas técnicas para tu alumno (opcional)
          </label>
          <input
            id={`${idBase}-ej-${ejIdx}-notas`}
            type="text"
            value={ej.notas || ''}
            onChange={(e) => onActualizarCampo('notas', e.target.value)}
            maxLength={500}
            placeholder="ej. Controlar la bajada 3 segundos y no bloquear codos"
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary transition-colors"
          />
        </div>
      )}
    </div>
  );
}
