import React, { useEffect, useId, useMemo, useState } from 'react';
import { EjercicioCatalogoDetalleDTO } from '@guachafit/shared';
import {
  DESCANSO_OPCIONES,
  NOMBRES_DIAS_SEMANA,
  OPCIONES_DIAS_SEMANA,
  actualizarConfiguracionBloque,
  crearBloqueEdicion,
  crearEjercicioEdicion,
  type BloqueEdicion,
} from '../../lib/rutina-bloques';
import { triggerHaptic } from '../../lib/haptics';
import { formatearSegundos } from '../../lib/sesion-tiempos';
import { pluralizar } from '../../lib/pluralizar';
import { filtrarEntradaRepsPrescritas, filtrarEntradaRpe } from '../../lib/entrada-numerica';
import { CampoPesoPrescrito } from './CampoPesoPrescrito';
import { DialogoConfirmacion } from '../common/DialogoConfirmacion';
import {
  AlertCircle,
  Check,
  FolderPlus,
  Minus,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';

export interface DatosEjercicioNuevo {
  nombre: string;
  grupoMuscular: string;
  patronMovimiento: string;
}

interface BloquesRutinaEditorProps {
  bloques: BloqueEdicion[];
  onCambiar: (bloques: BloqueEdicion[]) => void;
  catalogo: EjercicioCatalogoDetalleDTO[];
  /** Error de carga del catálogo (se muestra con acción de reintento en el picker). */
  catalogoError?: string | null;
  onReintentarCatalogo?: () => void;
  /** Alta rápida de ejercicio en el catálogo; devuelve null si falla. */
  onCrearEjercicio?: (datos: DatosEjercicioNuevo) => Promise<EjercicioCatalogoDetalleDTO | null>;
  /** RF-017 RN-01: muestra el campo de notas técnicas por ejercicio. */
  mostrarNotas?: boolean;
  /** Mínimo de días requerido (plantillas: 1). */
  minBloques?: number;
}

const GRUPOS_MUSCULARES = ['Todos', 'Pecho', 'Espalda', 'Piernas', 'Hombros', 'Brazos', 'Core'];

/**
 * Editor controlado de bloques de días con selectores estructurados (número de bloque,
 * día sugerido, anotación), pods de prescripción (series/reps/peso/RPE/descanso), notas
 * técnicas y picker del catálogo con búsqueda y estado "sin resultados".
 *
 * Replica el patrón del modal de prescripción del Expediente 360° (WU5) para reutilizarlo
 * en el banco de plantillas (RF-017) sin acoplarse a la página.
 */
export function BloquesRutinaEditor({
  bloques,
  onCambiar,
  catalogo,
  catalogoError,
  onReintentarCatalogo,
  onCrearEjercicio,
  mostrarNotas = false,
  minBloques = 1,
}: BloquesRutinaEditorProps) {
  const [activeDiaIdx, setActiveDiaIdx] = useState(0);
  const [grupo, setGrupo] = useState('Todos');
  const [filtro, setFiltro] = useState('');
  const [isCrearOpen, setIsCrearOpen] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoGrupo, setNuevoGrupo] = useState('Pecho');
  const [nuevoPatron, setNuevoPatron] = useState('Empuje');
  const [isCreando, setIsCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);
  const [editingNombreIdx, setEditingNombreIdx] = useState<number | null>(null);
  // C4: borrar un día o un ejercicio pide confirmación (acción destructiva).
  const [confirmarBorrado, setConfirmarBorrado] = useState<
    { tipo: 'dia'; indice: number } | { tipo: 'ejercicio'; indice: number } | null
  >(null);
  // C7: ids únicos para asociar cada etiqueta visible con su campo.
  const idBase = useId();

  // El editor puede recibir un set de bloques más corto (reset, eliminación externa).
  useEffect(() => {
    if (activeDiaIdx > bloques.length - 1) {
      setActiveDiaIdx(Math.max(0, bloques.length - 1));
    }
  }, [bloques.length, activeDiaIdx]);

  const diaActivo = bloques[activeDiaIdx];

  const catalogoFiltrado = useMemo(
    () =>
      catalogo.filter((ej) => {
        const matchGrupo =
          grupo === 'Todos' || ej.grupoMuscular.toLowerCase().includes(grupo.toLowerCase());
        const matchText =
          !filtro.trim() || ej.nombre.toLowerCase().includes(filtro.toLowerCase());
        return matchGrupo && matchText;
      }),
    [catalogo, grupo, filtro]
  );
  const hayFiltro = grupo !== 'Todos' || filtro.trim() !== '';

  const totales = useMemo(() => {
    const totalEjercicios = bloques.reduce((total, b) => total + b.ejercicios.length, 0);
    const totalSeries = bloques.reduce(
      (total, b) => total + b.ejercicios.reduce((suma, ej) => suma + (ej.series || 0), 0),
      0
    );
    return { totalDias: bloques.length, totalEjercicios, totalSeries };
  }, [bloques]);

  const agregarEjercicio = (nombre: string, ejercicioId?: string) => {
    triggerHaptic('selection');
    const actual = bloques[activeDiaIdx];
    if (!actual) return;
    const nuevos = [...bloques];
    nuevos[activeDiaIdx] = {
      ...actual,
      ejercicios: [...actual.ejercicios, crearEjercicioEdicion(nombre, ejercicioId)],
    };
    onCambiar(nuevos);
  };

  const removerEjercicio = (ejIdx: number) => {
    triggerHaptic('selection');
    const actual = bloques[activeDiaIdx];
    if (!actual) return;
    const nuevos = [...bloques];
    nuevos[activeDiaIdx] = {
      ...actual,
      ejercicios: actual.ejercicios.filter((_, idx) => idx !== ejIdx),
    };
    onCambiar(nuevos);
  };

  const actualizarCampoEjercicio = (ejIdx: number, campo: string, valor: unknown) => {
    const actual = bloques[activeDiaIdx];
    if (!actual) return;
    const ejercicios = [...actual.ejercicios];
    ejercicios[ejIdx] = { ...ejercicios[ejIdx], [campo]: valor };
    const nuevos = [...bloques];
    nuevos[activeDiaIdx] = { ...actual, ejercicios };
    onCambiar(nuevos);
  };

  const handleStepSeries = (ejIdx: number, delta: number) => {
    triggerHaptic('selection');
    const actual = bloques[activeDiaIdx];
    if (!actual) return;
    const ejercicios = [...actual.ejercicios];
    const siguiente = Math.max(1, Math.min(20, (ejercicios[ejIdx].series || 1) + delta));
    ejercicios[ejIdx] = { ...ejercicios[ejIdx], series: siguiente };
    const nuevos = [...bloques];
    nuevos[activeDiaIdx] = { ...actual, ejercicios };
    onCambiar(nuevos);
  };

  const agregarDia = () => {
    if (bloques.length >= 7) return;
    triggerHaptic('light');
    onCambiar([...bloques, crearBloqueEdicion(bloques.length + 1)]);
    setActiveDiaIdx(bloques.length);
  };

  const removerDia = (diaIdx: number) => {
    if (bloques.length <= minBloques) return;
    triggerHaptic('light');
    onCambiar(bloques.filter((_, idx) => idx !== diaIdx));
    setActiveDiaIdx(Math.max(0, diaIdx - 1));
  };

  const handleCrearEjercicio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre.trim() || !onCrearEjercicio) return;
    setIsCreando(true);
    setErrorCrear(null);
    const creado = await onCrearEjercicio({
      nombre: nuevoNombre.trim(),
      grupoMuscular: nuevoGrupo,
      patronMovimiento: nuevoPatron,
    });
    setIsCreando(false);
    if (!creado) {
      setErrorCrear('No se pudo crear el ejercicio en el catálogo. Revisa la conexión e inténtalo de nuevo.');
      return;
    }
    agregarEjercicio(creado.nombre, creado.id);
    setNuevoNombre('');
    setIsCrearOpen(false);
    triggerHaptic('success');
  };

  return (
    <div className="space-y-4">
      {/* Pestañas de días */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-border/60">
        {bloques.map((bloque, idx) => {
          const diaNum = bloque.diaNumero || idx + 1;
          const nombreDia = bloque.diaSugerido ? NOMBRES_DIAS_SEMANA[bloque.diaSugerido] : undefined;
          return (
            <button
              key={bloque.diaId || idx}
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setActiveDiaIdx(idx);
                setEditingNombreIdx(null);
              }}
              aria-pressed={activeDiaIdx === idx}
              className={`min-h-11 py-1.5 px-3 rounded-xl font-bold text-xs whitespace-nowrap transition-all cursor-pointer ${
                activeDiaIdx === idx
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {nombreDia ? `Día ${diaNum} (${nombreDia})` : `Día ${diaNum}`}
            </button>
          );
        })}

        {bloques.length < 7 && (
          <button
            type="button"
            onClick={agregarDia}
            className="min-h-11 py-1.5 px-3 rounded-xl bg-secondary/80 hover:bg-secondary text-primary font-bold text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Añadir día</span>
          </button>
        )}
      </div>

      {diaActivo && (
        <div className="space-y-4">
          {/* Configuración estructurada del día */}
          <div className="p-4 rounded-2xl bg-secondary/30 border border-border/60 space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor={`${idBase}-dia-numero`}
                  className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block"
                >
                  Número de día
                </label>
                <select
                  id={`${idBase}-dia-numero`}
                  value={diaActivo.diaNumero || activeDiaIdx + 1}
                  onChange={(e) => {
                    triggerHaptic('selection');
                    onCambiar(
                      actualizarConfiguracionBloque(bloques, activeDiaIdx, {
                        diaNumero: parseInt(e.target.value, 10),
                      })
                    );
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

              <div className="space-y-1">
                <label
                  htmlFor={`${idBase}-dia-sugerido`}
                  className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block"
                >
                  Día de la semana sugerido
                </label>
                <select
                  id={`${idBase}-dia-sugerido`}
                  value={diaActivo.diaSugerido || 0}
                  onChange={(e) => {
                    triggerHaptic('selection');
                    const val = parseInt(e.target.value, 10);
                    onCambiar(
                      actualizarConfiguracionBloque(bloques, activeDiaIdx, {
                        diaSugerido: val === 0 ? null : val,
                      })
                    );
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

              <div className="flex items-end justify-between sm:justify-start gap-2">
                <div className="flex-1 sm:flex-none">
                  {bloques.length > minBloques ? (
                    <button
                      type="button"
                      onClick={() => setConfirmarBorrado({ tipo: 'dia', indice: activeDiaIdx })}
                      className="min-h-11 px-3 py-2 rounded-xl bg-destructive/10 hover:bg-destructive text-destructive hover:text-destructive-foreground text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Eliminar este día</span>
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground italic py-2 block">
                      Mínimo {pluralizar(minBloques, 'día', 'días')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/50">
              <div className="space-y-1">
                <label
                  htmlFor={`${idBase}-anotacion`}
                  className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block"
                >
                  Nombre corto del día (opcional)
                </label>
                <input
                  id={`${idBase}-anotacion`}
                  type="text"
                  value={diaActivo.anotacion}
                  onChange={(e) =>
                    onCambiar(
                      actualizarConfiguracionBloque(bloques, activeDiaIdx, {
                        anotacion: e.target.value,
                      })
                    )
                  }
                  placeholder="ej. Empuje & Pectoral / Tríceps"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary transition-colors"
                />
                <span className="text-[11px] text-muted-foreground block">
                  Se añade después del día elegido, por ejemplo «Día 1 (Lunes): Empuje».
                </span>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor={`${idBase}-enfoque`}
                  className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block"
                >
                  Enfoque o indicaciones (opcional)
                </label>
                <input
                  id={`${idBase}-enfoque`}
                  type="text"
                  value={diaActivo.enfoque || ''}
                  onChange={(e) =>
                    onCambiar(
                      actualizarConfiguracionBloque(bloques, activeDiaIdx, {
                        enfoque: e.target.value,
                      })
                    )
                  }
                  placeholder="ej. Hipertrofia e Intensidad RPE 8"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary transition-colors"
                />
                <span className="text-[11px] text-muted-foreground block">
                  Instrucciones de esfuerzo o técnica para el alumno.
                </span>
              </div>
            </div>

            <div className="px-3 py-2 rounded-xl bg-background/80 border border-border/70 flex items-center gap-2 text-xs">
              <span className="text-[11px] font-bold text-primary uppercase tracking-wider shrink-0">
                Así lo verá tu alumno:
              </span>
              <span className="font-bold text-foreground truncate">{diaActivo.titulo}</span>
            </div>
          </div>

          {/* Ejercicios del día activo */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-foreground block">
              Ejercicios de este día ({diaActivo.ejercicios.length}):
            </span>

            {diaActivo.ejercicios.length === 0 ? (
              <div className="p-4 rounded-xl bg-secondary/15 border border-dashed border-border text-center text-xs text-muted-foreground">
                Aún no has agregado ejercicios a este día. Elige uno de la lista de abajo.
              </div>
            ) : (
              <div className="space-y-2.5">
                {diaActivo.ejercicios.map((ej, ejIdx) => (
                  <div
                    key={ej.id || ejIdx}
                    className="p-3.5 rounded-2xl bg-card border border-border/80 text-xs shadow-2xs hover:border-primary/40 transition-all space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <span className="h-6 w-6 rounded-lg bg-primary/10 text-primary font-mono font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                          {ejIdx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          {editingNombreIdx === ejIdx ? (
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <input
                                type="text"
                                aria-label={`Nombre del ejercicio ${ejIdx + 1}`}
                                value={ej.nombre}
                                onChange={(e) => actualizarCampoEjercicio(ejIdx, 'nombre', e.target.value)}
                                onBlur={() => setEditingNombreIdx(null)}
                                onKeyDown={(e) => e.key === 'Enter' && setEditingNombreIdx(null)}
                                autoFocus
                                className="w-full px-2 py-1 rounded-lg bg-background border border-primary text-xs font-bold text-foreground focus:outline-hidden"
                              />
                              <button
                                type="button"
                                onClick={() => setEditingNombreIdx(null)}
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
                                onClick={() => setEditingNombreIdx(ejIdx)}
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
                          setConfirmarBorrado({ tipo: 'ejercicio', indice: ejIdx });
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
                              onClick={() => handleStepSeries(ejIdx, -1)}
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
                              onClick={() => handleStepSeries(ejIdx, 1)}
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
                              if (filtrado !== ej.reps) actualizarCampoEjercicio(ejIdx, 'reps', filtrado);
                            }}
                            placeholder="8-12"
                            title="Un número (10), un rango (8-10) o segundos (45 s)"
                            className="h-11 sm:h-9 w-16 sm:w-20 px-2 rounded-lg bg-background border border-border text-center font-mono font-semibold text-sm text-foreground focus:outline-hidden focus:border-primary transition-colors"
                          />
                        </div>

                        <CampoPesoPrescrito
                          valor={ej.peso ?? ''}
                          onChange={(nuevoValor) => actualizarCampoEjercicio(ejIdx, 'peso', nuevoValor)}
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
                              if (filtrado !== anterior) actualizarCampoEjercicio(ejIdx, 'rpe', filtrado);
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
                              actualizarCampoEjercicio(
                                ejIdx,
                                'descansoSegundos',
                                parseInt(e.target.value, 10)
                              )
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
                          onChange={(e) => actualizarCampoEjercicio(ejIdx, 'notas', e.target.value)}
                          maxLength={500}
                          placeholder="ej. Controlar la bajada 3 segundos y no bloquear codos"
                          className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary transition-colors"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Picker del catálogo */}
          <div className="p-4 rounded-2xl bg-secondary/30 border border-border/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FolderPlus className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-foreground">Añadir ejercicio desde tu lista</span>
              </div>

              {onCrearEjercicio && (
                <button
                  type="button"
                  onClick={() => setIsCrearOpen(!isCrearOpen)}
                  aria-expanded={isCrearOpen}
                  className="min-h-11 text-xs font-bold text-primary hover:underline cursor-pointer flex items-center gap-1 self-start sm:self-auto"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isCrearOpen ? 'Ocultar' : 'Crear ejercicio nuevo'}</span>
                </button>
              )}
            </div>

            {isCrearOpen && onCrearEjercicio && (
              <form
                onSubmit={handleCrearEjercicio}
                className="p-3 rounded-xl bg-card border border-primary/30 space-y-3 animate-in zoom-in-95 duration-150"
              >
                <span className="text-[11px] font-bold text-primary uppercase tracking-wide block">
                  Nuevo ejercicio en tu lista
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Nombre (ej. Hip Thrust Mancuerna)"
                    aria-label="Nombre del ejercicio nuevo"
                    value={nuevoNombre}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
                  />
                  <select
                    aria-label="Grupo muscular"
                    value={nuevoGrupo}
                    onChange={(e) => setNuevoGrupo(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
                  >
                    {GRUPOS_MUSCULARES.filter((g) => g !== 'Todos').map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Tipo de movimiento"
                    value={nuevoPatron}
                    onChange={(e) => setNuevoPatron(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
                  >
                    <option value="Empuje">Empuje</option>
                    <option value="Tracción">Tracción</option>
                    <option value="Bisagra de Cadera">Bisagra de Cadera</option>
                    <option value="Dominante de Rodilla">Dominante de Rodilla</option>
                    <option value="Aislamiento">Aislamiento</option>
                  </select>
                </div>
                {errorCrear && (
                  <p role="alert" className="text-xs text-destructive font-semibold flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {errorCrear}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCrearOpen(false)}
                    className="min-h-11 px-3 py-1 rounded-lg bg-secondary text-muted-foreground text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isCreando}
                    className="min-h-11 px-3 py-1 rounded-lg bg-primary text-primary-foreground font-bold text-xs cursor-pointer disabled:opacity-50"
                  >
                    {isCreando ? 'Guardando...' : 'Crear y agregar a este día'}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {GRUPOS_MUSCULARES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setGrupo(g);
                    }}
                    aria-pressed={grupo === g}
                    className={`min-h-11 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      grupo === g
                        ? 'bg-primary text-primary-foreground font-bold'
                        : 'bg-background hover:bg-secondary text-muted-foreground'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar en tu lista de ejercicios..."
                  aria-label="Buscar ejercicio"
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
              {catalogoFiltrado.length === 0 ? (
                <div className="p-5 rounded-2xl bg-card border border-dashed border-border text-center space-y-2">
                  <Search className="h-5 w-5 text-muted-foreground mx-auto opacity-50" />
                  <p className="text-xs font-bold text-foreground">
                    {catalogoError ? 'No se pudo cargar el catálogo' : 'Sin resultados en el catálogo'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {catalogoError
                      ? catalogoError
                      : hayFiltro
                      ? 'Ajusta el grupo muscular o el término de búsqueda, o crea el ejercicio que falta.'
                      : 'Tu catálogo está vacío: crea tu primer ejercicio para asignarlo.'}
                  </p>
                  {catalogoError && onReintentarCatalogo ? (
                    <button
                      type="button"
                      onClick={onReintentarCatalogo}
                      className="min-h-11 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs transition-all cursor-pointer"
                    >
                      Reintentar carga
                    </button>
                  ) : onCrearEjercicio ? (
                    <button
                      type="button"
                      onClick={() => setIsCrearOpen(true)}
                      className="min-h-11 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 hover:bg-primary text-primary hover:text-primary-foreground font-bold text-xs transition-all cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      <span>
                        {filtro.trim() ? `Crear «${filtro.trim()}»` : 'Crear ejercicio nuevo'}
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : (
                catalogoFiltrado.map((ej) => (
                  <div
                    key={ej.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/60 hover:border-primary/40 transition-colors text-xs gap-2"
                  >
                    <div className="min-w-0 flex-1 pr-1">
                      <span className="font-bold text-foreground break-words block">{ej.nombre}</span>
                      <span className="text-[11px] text-muted-foreground">• {ej.grupoMuscular}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => agregarEjercicio(ej.nombre, ej.id)}
                      aria-label={`Añadir ${ej.nombre}`}
                      className="min-h-11 px-3 py-1 rounded-lg bg-primary/15 hover:bg-primary text-primary hover:text-primary-foreground font-bold text-xs flex items-center gap-1 transition-all cursor-pointer shrink-0"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Añadir</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
        <span>
          {totales.totalDias} día{totales.totalDias === 1 ? '' : 's'} · {totales.totalEjercicios}{' '}
          ejercicio{totales.totalEjercicios === 1 ? '' : 's'}
        </span>
        <span>{pluralizar(totales.totalSeries, 'serie prescrita', 'series prescritas')}</span>
      </div>

      {/* C4: confirmación antes de borrar un día o un ejercicio */}
      <DialogoConfirmacion
        abierto={confirmarBorrado !== null}
        idTitulo={`${idBase}-confirmar-borrado`}
        titulo={confirmarBorrado?.tipo === 'dia' ? '¿Eliminar este día?' : '¿Eliminar este ejercicio?'}
        detalle={
          confirmarBorrado?.tipo === 'dia'
            ? `Se quitará «${bloques[confirmarBorrado.indice]?.titulo ?? 'este día'}» con todos sus ejercicios.`
            : `Se quitará «${
                diaActivo?.ejercicios[confirmarBorrado?.indice ?? -1]?.nombre ?? 'este ejercicio'
              }» de este día.`
        }
        textoConfirmar="Sí, eliminar"
        variante="peligro"
        onCancelar={() => setConfirmarBorrado(null)}
        onConfirmar={() => {
          if (confirmarBorrado?.tipo === 'dia') removerDia(confirmarBorrado.indice);
          else if (confirmarBorrado?.tipo === 'ejercicio') removerEjercicio(confirmarBorrado.indice);
          setConfirmarBorrado(null);
        }}
      />
    </div>
  );
}
