/**
 * Contenido del editor de rutina: días, configuración y ejercicios con prescripción.
 *
 * Recorte ÚNICO del modal de rutina para el tope R2 de 400 líneas (converger con
 * `BloquesRutinaEditor` está BLOQUEADO por R5: BLOCKER-51-1; D unifica el copy).
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import { Check, Minus, Pencil, Plus, Trash2 } from 'lucide-react';
import { triggerHaptic } from '../../../lib/haptics';
import {
  DESCANSO_OPCIONES,
  NOMBRES_DIAS_SEMANA,
  OPCIONES_DIAS_SEMANA,
} from '../../../lib/rutina-bloques';
import { filtrarEntradaRepsPrescritas, filtrarEntradaRpe } from '../../../lib/entrada-numerica';
import { formatearSegundos } from '../../../lib/sesion-tiempos';
import { CampoPesoPrescrito } from '../CampoPesoPrescrito';
import type { RetornoRutinaAlumno } from './use-rutina-alumno';

interface ContenidoRutinaSemanalProps {
  rutina: RetornoRutinaAlumno;
}

export function ContenidoRutinaSemanal({ rutina }: ContenidoRutinaSemanalProps) {
  const {
    bloquesRutinaEdit,
    activeDiaIdx,
    editingEjNombreIdx,
    setActiveDiaIdx,
    setEditingEjNombreIdx,
    actualizarConfiguracionDiaActivo,
    actualizarCampoEjercicio,
    cambiarSeriesEjercicio,
    agregarNuevoDiaRutina,
    setConfirmarBorradoRutina,
  } = rutina;

  return (
    <>
      {/* Pestañas de Días de la Rutina */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-border/60">
        {bloquesRutinaEdit.map((bloque, idx) => {
          const diaNum = bloque.diaNumero || idx + 1;
          const diaSugeridoNombre = bloque.diaSugerido ? NOMBRES_DIAS_SEMANA[bloque.diaSugerido] : undefined;
          const tabLabel = diaSugeridoNombre ? `Día ${diaNum} (${diaSugeridoNombre})` : `Día ${diaNum}`;
          return (
            <button
              key={bloque.diaId || idx}
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setActiveDiaIdx(idx);
                setEditingEjNombreIdx(null);
              }}
              className={`py-1.5 px-3 rounded-xl font-bold text-xs whitespace-nowrap transition-all cursor-pointer ${
                activeDiaIdx === idx
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {tabLabel}
            </button>
          );
        })}

        {bloquesRutinaEdit.length < 7 && (
          <button
            type="button"
            onClick={agregarNuevoDiaRutina}
            className="py-1.5 px-3 rounded-xl bg-secondary/80 hover:bg-secondary text-primary font-bold text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Añadir Día</span>
          </button>
        )}
      </div>

      {/* Configuración del Día Activo */}
      {bloquesRutinaEdit[activeDiaIdx] && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-secondary/30 border border-border/60 space-y-3.5">
            {/* Fila 1: Selectores Estructurados para Evitar Falla Humana */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* 1. Selector de Número de Día / Bloque */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Número de Bloque / Día
                </label>
                <select
                  value={bloquesRutinaEdit[activeDiaIdx].diaNumero || activeDiaIdx + 1}
                  onChange={(e) => {
                    triggerHaptic('selection');
                    actualizarConfiguracionDiaActivo({ diaNumero: parseInt(e.target.value, 10) });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary transition-colors cursor-pointer"
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                    <option key={num} value={num}>
                      Día {num}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Selector de Día Sugerido de la Semana */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Día Sugerido (Calendario)
                </label>
                <select
                  value={bloquesRutinaEdit[activeDiaIdx].diaSugerido || 0}
                  onChange={(e) => {
                    triggerHaptic('selection');
                    const val = parseInt(e.target.value, 10);
                    actualizarConfiguracionDiaActivo({ diaSugerido: val === 0 ? null : val });
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary transition-colors cursor-pointer"
                >
                  {OPCIONES_DIAS_SEMANA.map((d) => (
                    <option key={d.valor} value={d.valor}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Acción de Eliminar Bloque */}
              <div className="flex items-end justify-between sm:justify-start gap-2">
                <div className="flex-1 sm:flex-none">
                  {bloquesRutinaEdit.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmarBorradoRutina({ tipo: 'dia', indice: activeDiaIdx })
                      }
                      className="min-h-11 px-3 py-2 rounded-xl bg-destructive/10 hover:bg-destructive text-destructive hover:text-destructive-foreground text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Eliminar este día</span>
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground italic py-2 block">
                      Mínimo 1 día
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Fila 2: Anotaciones y Enfoque del Día */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/50">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Anotaciones en el Título
                </label>
                <input
                  type="text"
                  value={bloquesRutinaEdit[activeDiaIdx].anotacion ?? ''}
                  onChange={(e) => {
                    actualizarConfiguracionDiaActivo({ anotacion: e.target.value });
                  }}
                  placeholder="ej. Empuje & Pectoral / Tríceps"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary transition-colors"
                />
                <span className="text-[11px] text-muted-foreground block">
                  Se añade al título tras el día seleccionado para evitar errores manuales.
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Enfoque o Indicaciones (Opcional)
                </label>
                <input
                  type="text"
                  value={bloquesRutinaEdit[activeDiaIdx].enfoque || ''}
                  onChange={(e) => {
                    actualizarConfiguracionDiaActivo({ enfoque: e.target.value });
                  }}
                  placeholder="ej. Hipertrofia e Intensidad RPE 8"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary transition-colors"
                />
                <span className="text-[11px] text-muted-foreground block">
                  Instrucciones de esfuerzo o técnica para el alumno.
                </span>
              </div>
            </div>

            {/* Previsualización del Título Resultante */}
            <div className="px-3 py-2 rounded-xl bg-background/80 border border-border/70 flex items-center gap-2 text-xs">
              <span className="text-[11px] font-bold text-primary uppercase tracking-wider shrink-0">
                🏷️ Título generado:
              </span>
              <span className="font-bold text-foreground truncate">
                {bloquesRutinaEdit[activeDiaIdx].titulo}
              </span>
            </div>
          </div>

          {/* Lista de Ejercicios del Día Activo */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-foreground block">
              Ejercicios Asignados a este Día ({bloquesRutinaEdit[activeDiaIdx].ejercicios.length}):
            </span>

            {bloquesRutinaEdit[activeDiaIdx].ejercicios.length === 0 ? (
              <div className="p-4 rounded-xl bg-secondary/15 border border-dashed border-border text-center text-xs text-muted-foreground">
                Aún no has agregado ejercicios a este bloque. Elige uno del catálogo abajo.
              </div>
            ) : (
              <div className="space-y-2.5">
                {bloquesRutinaEdit[activeDiaIdx].ejercicios.map((ej, ejIdx) => (
                  <div
                    key={ej.id || ejIdx}
                    className="p-3.5 rounded-2xl bg-card border border-border/80 text-xs shadow-2xs hover:border-primary/40 transition-all space-y-2.5"
                  >
                    {/* Fila Superior: Número de orden, Nombre completo (sin truncar), Edición inline y Eliminar */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <span className="h-6 w-6 rounded-lg bg-primary/10 text-primary font-mono font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                          {ejIdx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          {editingEjNombreIdx === ejIdx ? (
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <input
                                type="text"
                                value={ej.nombre}
                                onChange={(e) => actualizarCampoEjercicio(ejIdx, 'nombre', e.target.value)}
                                onBlur={() => setEditingEjNombreIdx(null)}
                                onKeyDown={(e) => e.key === 'Enter' && setEditingEjNombreIdx(null)}
                                autoFocus
                                className="w-full px-2 py-1 rounded-lg bg-background border border-primary text-xs font-bold text-foreground focus:outline-hidden"
                              />
                              <button
                                type="button"
                                onClick={() => setEditingEjNombreIdx(null)}
                                className="p-1 rounded-md text-primary hover:bg-primary/10 cursor-pointer"
                                title="Confirmar nombre"
                              >
                                <Check className="h-3.5 w-3.5" />
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
                                onClick={() => setEditingEjNombreIdx(ejIdx)}
                                title="Editar o personalizar nombre del ejercicio"
                                className="opacity-0 group-hover/name:opacity-100 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-opacity cursor-pointer shrink-0"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setConfirmarBorradoRutina({ tipo: 'ejercicio', indice: ejIdx });
                        }}
                        title="Eliminar este ejercicio"
                        aria-label={`Eliminar ${ej.nombre || 'este ejercicio'}`}
                        className="min-h-11 min-w-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    {/* Fila Inferior: Pods de Carga (Series, Reps, Peso, RPE, Descanso) */}
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap pt-2 border-t border-border/40">
                      {/* Bloque A: Volumen & Cargas */}
                      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-secondary/30 border border-border/50">
                        {/* Series Stepper */}
                        <div className="flex flex-col items-center">
                          <label className="text-xs font-medium text-muted-foreground block mb-0.5">
                            Series
                          </label>
                          <div className="flex items-center h-8 rounded-lg bg-background border border-border p-0.5">
                            <button
                              type="button"
                              onClick={() => cambiarSeriesEjercicio(ejIdx, -1)}
                              disabled={(ej.series || 1) <= 1}
                              title="Reducir series"
                              className="h-7 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center font-mono font-bold text-xs text-foreground select-none">
                              {ej.series || 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => cambiarSeriesEjercicio(ejIdx, 1)}
                              disabled={(ej.series || 1) >= 20}
                              title="Aumentar series"
                              className="h-7 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        {/* Reps */}
                        <div className="flex flex-col items-center">
                          <label
                            htmlFor={`rutina-d${activeDiaIdx}-ej${ejIdx}-reps`}
                            className="text-xs font-medium text-muted-foreground block mb-0.5"
                          >
                            Repeticiones
                          </label>
                          <input
                            id={`rutina-d${activeDiaIdx}-ej${ejIdx}-reps`}
                            type="text"
                            value={ej.reps}
                            onChange={(e) => {
                              const filtrado = filtrarEntradaRepsPrescritas(e.target.value, ej.reps ?? '');
                              if (filtrado !== ej.reps) actualizarCampoEjercicio(ejIdx, 'reps', filtrado);
                            }}
                            placeholder="8-12"
                            title="Un número (10), un rango (8-10) o segundos (45 s)"
                            className="h-11 sm:h-9 w-16 sm:w-20 px-2 rounded-lg bg-background border border-border text-center font-mono font-semibold text-sm text-foreground focus:outline-hidden focus:border-primary transition-colors"
                          />
                        </div>

                        {/* Peso */}
                        <CampoPesoPrescrito
                          valor={ej.peso ?? ''}
                          onChange={(nuevoValor) =>
                            actualizarCampoEjercicio(ejIdx, 'peso', nuevoValor)
                          }
                        />
                      </div>

                      {/* Bloque B: Intensidad & Descanso */}
                      <div className="flex items-center gap-2 p-1.5 rounded-xl bg-secondary/30 border border-border/50">
                        {/* RPE */}
                        <div className="flex flex-col items-center">
                          <label
                            htmlFor={`rutina-d${activeDiaIdx}-ej${ejIdx}-rpe`}
                            className="text-xs font-medium text-muted-foreground block mb-0.5"
                          >
                            Esfuerzo (1-10)
                          </label>
                          <input
                            id={`rutina-d${activeDiaIdx}-ej${ejIdx}-rpe`}
                            type="text"
                            inputMode="decimal"
                            value={ej.rpe || ''}
                            onChange={(e) => {
                              const anterior = ej.rpe || '';
                              const filtrado = filtrarEntradaRpe(e.target.value, anterior);
                              if (filtrado !== anterior) actualizarCampoEjercicio(ejIdx, 'rpe', filtrado);
                            }}
                            placeholder="8"
                            className="h-11 sm:h-9 w-14 sm:w-16 px-1.5 rounded-lg bg-background border border-border text-center font-mono font-semibold text-sm text-foreground focus:outline-hidden focus:border-primary transition-colors"
                          />
                        </div>

                        {/* Descanso */}
                        <div className="flex flex-col items-center">
                          <label className="text-xs font-medium text-muted-foreground block mb-0.5">
                            Descanso
                          </label>
                          <select
                            value={ej.descansoSegundos || 90}
                            onChange={(e) => actualizarCampoEjercicio(ejIdx, 'descansoSegundos', parseInt(e.target.value, 10))}
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
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
