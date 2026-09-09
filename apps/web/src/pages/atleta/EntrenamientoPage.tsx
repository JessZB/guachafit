import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { apiClient } from '../../lib/api-client';
import { queueOfflineMutation, offlineDb } from '../../lib/offline-db';
import { RestTimer } from '../../components/common/RestTimer';
import { SesionEntrenamientoDetalleDTO, EstadoSesion } from '@guachafit/shared';
import {
  Dumbbell,
  Play,
  CheckCircle2,
  Flame,
  Clock,
  Timer,
  Info,
  Check,
  Award,
} from 'lucide-react';

export function EntrenamientoPage() {
  const { user } = useAuth();
  const [sesion, setSesion] = useState<SesionEntrenamientoDetalleDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestTimerOpen, setIsRestTimerOpen] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(90);

  // Load session (from API or IndexedDB fallback)
  useEffect(() => {
    async function loadTodaySession() {
      setIsLoading(true);
      try {
        if (navigator.onLine) {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Caracas';
          const data = await apiClient<SesionEntrenamientoDetalleDTO | null>(
            `/alumnos/me/sesiones/hoy?timezone=${encodeURIComponent(tz)}`
          );
          if (data) {
            setSesion(data);
            // Cache in IndexedDB
            if (data.id) {
              await offlineDb.rutinaHoy.put({
                id: data.id,
                alumnoId: user?.id || '',
                fechaProgramada: data.fechaProgramada,
                sesion: data,
                updatedAt: Date.now(),
              });
            }
          } else {
            setSesion(null);
          }
        } else {
          // Offline fallback
          const cached = await offlineDb.rutinaHoy.toCollection().last();
          if (cached) {
            setSesion(cached.sesion);
          } else {
            setSesion(null);
          }
        }
      } catch (err) {
        console.warn('Fallback a datos locales o simulación de sesión:', err);
        // Fallback demo session so the user can test the UI offline or without backend
        const demoSesion: SesionEntrenamientoDetalleDTO = {
          id: 'sesion-demo-001',
          alumnoId: user?.id || 'demo-alumno',
          fechaProgramada: new Date().toISOString().split('T')[0],
          estado: EstadoSesion.PLANIFICADA,
          timezoneCliente: 'America/Caracas',
          porcentajeCumplimiento: '0.00',
          ejercicios: [
            {
              id: 'es-1',
              sesionId: 'sesion-demo-001',
              ejercicioId: 'ej-1',
              orden: 1,
              notasCoach: 'Enfoque en pausa de 1s abajo',
              ejercicio: {
                id: 'ej-1',
                nombre: 'Sentadilla Trasera con Barra',
                grupoMuscular: 'Cuádriceps / Glúteos',
                activo: true,
                createdAtUtc: new Date().toISOString(),
              },
              series: [
                { id: 's-1', ejercicioSesionId: 'es-1', numeroSerie: 1, repsObjetivo: 8, repsLogradas: 8, pesoKg: '80.00', rpe: '7.5', completada: false },
                { id: 's-2', ejercicioSesionId: 'es-1', numeroSerie: 2, repsObjetivo: 8, repsLogradas: 8, pesoKg: '85.00', rpe: '8.0', completada: false },
                { id: 's-3', ejercicioSesionId: 'es-1', numeroSerie: 3, repsObjetivo: 8, repsLogradas: 8, pesoKg: '85.00', rpe: '8.5', completada: false },
              ],
            },
            {
              id: 'es-2',
              sesionId: 'sesion-demo-001',
              ejercicioId: 'ej-2',
              orden: 2,
              notasCoach: 'Codos pegados a 45 grados',
              ejercicio: {
                id: 'ej-2',
                nombre: 'Press de Banca Plano',
                grupoMuscular: 'Pectoral / Tríceps',
                activo: true,
                createdAtUtc: new Date().toISOString(),
              },
              series: [
                { id: 's-4', ejercicioSesionId: 'es-2', numeroSerie: 1, repsObjetivo: 10, repsLogradas: 10, pesoKg: '60.00', rpe: '7.0', completada: false },
                { id: 's-5', ejercicioSesionId: 'es-2', numeroSerie: 2, repsObjetivo: 10, repsLogradas: 10, pesoKg: '65.00', rpe: '8.0', completada: false },
                { id: 's-6', ejercicioSesionId: 'es-2', numeroSerie: 3, repsObjetivo: 10, repsLogradas: 9, pesoKg: '65.00', rpe: '9.0', completada: false },
              ],
            },
          ],
          createdAtUtc: new Date().toISOString(),
          updatedAtUtc: new Date().toISOString(),
        };
        setSesion(demoSesion);
      } finally {
        setIsLoading(false);
      }
    }

    loadTodaySession();
  }, [user]);

  // Start workout session
  const handleStartSession = async () => {
    if (!sesion) return;
    const nowUtc = new Date().toISOString();
    const updated: SesionEntrenamientoDetalleDTO = {
      ...sesion,
      estado: EstadoSesion.EN_PROGRESO,
      fechaInicioUtc: nowUtc,
    };
    setSesion(updated);

    if (navigator.onLine) {
      try {
        await apiClient(`/sesiones/${sesion.id}/iniciar`, { method: 'POST' });
      } catch (err) {
        await queueOfflineMutation(`/sesiones/${sesion.id}/iniciar`, 'POST', {}, 'Iniciar sesión');
      }
    } else {
      await queueOfflineMutation(`/sesiones/${sesion.id}/iniciar`, 'POST', {}, 'Iniciar sesión');
    }
  };

  // Toggle set completion and trigger rest timer
  const handleToggleSet = async (ejercicioIndex: number, serieIndex: number) => {
    if (!sesion) return;
    const updated = { ...sesion };
    const serie = updated.ejercicios[ejercicioIndex].series[serieIndex];
    const willBeCompleted = !serie.completada;

    serie.completada = willBeCompleted;
    if (willBeCompleted) {
      serie.timestampCompletadaUtc = new Date().toISOString();
      // Trigger rest timer
      setTimerSeconds(90);
      setIsRestTimerOpen(true);
    }

    // Recompute compliance percentage
    let totalSeries = 0;
    let completedSeries = 0;
    updated.ejercicios.forEach((e) => {
      e.series.forEach((s) => {
        totalSeries++;
        if (s.completada) completedSeries++;
      });
    });
    const pct = totalSeries > 0 ? ((completedSeries / totalSeries) * 100).toFixed(2) : '0.00';
    updated.porcentajeCumplimiento = pct;
    updated.cumpleReglaRacha = Number(pct) >= 70;

    setSesion(updated);

    // Save to IndexedDB
    await offlineDb.rutinaHoy.put({
      id: updated.id,
      alumnoId: user?.id || '',
      fechaProgramada: updated.fechaProgramada,
      sesion: updated,
      updatedAt: Date.now(),
    });

    // Sync or queue outbox batch
    const payload = {
      series: [
        {
          serieId: serie.id,
          repsLogradas: serie.repsLogradas ?? serie.repsObjetivo,
          pesoKg: serie.pesoKg,
          rpe: serie.rpe,
          completada: willBeCompleted,
          timestampCompletadaUtc: serie.timestampCompletadaUtc,
        },
      ],
    };

    if (navigator.onLine) {
      try {
        await apiClient(`/sesiones/${sesion.id}/series`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } catch {
        await queueOfflineMutation(
          `/sesiones/${sesion.id}/series`,
          'PUT',
          payload,
          `Sync serie ${serie.numeroSerie}`
        );
      }
    } else {
      await queueOfflineMutation(
        `/sesiones/${sesion.id}/series`,
        'PUT',
        payload,
        `Sync serie ${serie.numeroSerie}`
      );
    }
  };

  // Update set values (weight, reps, rpe)
  const handleUpdateSerieValue = (
    ejercicioIndex: number,
    serieIndex: number,
    field: 'pesoKg' | 'repsLogradas' | 'rpe',
    value: string
  ) => {
    if (!sesion) return;
    const updated = { ...sesion };
    const serie = updated.ejercicios[ejercicioIndex].series[serieIndex];
    if (field === 'pesoKg') serie.pesoKg = value;
    if (field === 'rpe') serie.rpe = value;
    if (field === 'repsLogradas') serie.repsLogradas = Number(value) || 0;
    setSesion(updated);
  };

  // Finish session
  const handleFinishSession = async () => {
    if (!sesion) return;
    const updated: SesionEntrenamientoDetalleDTO = {
      ...sesion,
      estado: EstadoSesion.COMPLETADA,
      fechaFinUtc: new Date().toISOString(),
    };
    setSesion(updated);

    if (navigator.onLine) {
      try {
        await apiClient(`/sesiones/${sesion.id}/finalizar`, { method: 'POST' });
      } catch {
        await queueOfflineMutation(`/sesiones/${sesion.id}/finalizar`, 'POST', {}, 'Finalizar sesión');
      }
    } else {
      await queueOfflineMutation(`/sesiones/${sesion.id}/finalizar`, 'POST', {}, 'Finalizar sesión');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (!sesion) {
    return (
      <div className="p-8 text-center space-y-3 bg-card rounded-2xl border border-border">
        <Dumbbell className="h-10 w-10 text-muted-foreground mx-auto" />
        <h3 className="font-bold text-base">No hay entrenamiento programado para hoy</h3>
        <p className="text-xs text-muted-foreground">
          Disfruta tu día de descanso o consulta con tu entrenador.
        </p>
      </div>
    );
  }

  const isCompleted = sesion.estado === EstadoSesion.COMPLETADA;
  const isInProgress = sesion.estado === EstadoSesion.EN_PROGRESO;
  const isPlanned = sesion.estado === EstadoSesion.PLANIFICADA;

  return (
    <div className="space-y-6">
      {/* Session Hero Banner */}
      <div className="p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                  isCompleted
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                    : isInProgress
                    ? 'bg-primary/15 text-primary border border-primary/20'
                    : 'bg-secondary text-muted-foreground border border-border'
                }`}
              >
                {isCompleted ? 'Completada' : isInProgress ? 'En Progreso' : 'Planificada'}
              </span>
              <span className="text-xs text-muted-foreground">{sesion.fechaProgramada}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-1">
              Checklist de Entrenamiento
            </h1>
          </div>

          {/* Compliance & Streak Badge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-secondary/60 border border-border">
              <Flame
                className={`h-5 w-5 ${
                  sesion.cumpleReglaRacha ? 'text-amber-500 fill-amber-500 animate-pulse' : 'text-muted-foreground'
                }`}
              />
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                  Progreso
                </span>
                <span className="text-sm font-extrabold font-mono">
                  {sesion.porcentajeCumplimiento}%
                </span>
              </div>
            </div>

            {/* Quick Rest Timer Trigger */}
            <button
              onClick={() => setIsRestTimerOpen(!isRestTimerOpen)}
              className="p-2.5 rounded-2xl bg-secondary/60 border border-border hover:border-primary/50 text-foreground transition-colors flex items-center gap-1.5"
              title="Abrir cronómetro de descanso"
            >
              <Timer className="h-5 w-5 text-primary" />
              <span className="text-xs font-bold hidden sm:inline">Cronómetro</span>
            </button>
          </div>
        </div>

        {/* Action Button: Start or Finish */}
        {isPlanned && (
          <button
            onClick={handleStartSession}
            className="w-full py-3.5 px-4 rounded-2xl bg-primary text-primary-foreground font-black text-sm tracking-wide shadow-lg shadow-primary/25 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="h-5 w-5 fill-primary-foreground" />
            <span>COMENZAR ENTRENAMIENTO</span>
          </button>
        )}

        {isInProgress && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-primary animate-spin" />
              <span>Sesión activa. Marca tus series y pesos al completarlas.</span>
            </div>
            <button
              onClick={handleFinishSession}
              className="py-2.5 px-5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-md hover:bg-emerald-500 active:scale-95 transition-all cursor-pointer"
            >
              Finalizar Rutina
            </button>
          </div>
        )}

        {isCompleted && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-3">
            <Award className="h-6 w-6 shrink-0" />
            <div>
              <p className="text-xs font-bold">¡Sesión de entrenamiento finalizada con éxito!</p>
              <p className="text-[11px] text-emerald-400/80">
                {Number(sesion.porcentajeCumplimiento) >= 70
                  ? 'Cumpliste la regla del 70% de volumen. Tu racha se ha incrementado.'
                  : 'Buen esfuerzo. No superó el 70% prescrito para racha, pero cada repetición cuenta.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Exercises List */}
      <div className="space-y-4">
        {sesion.ejercicios.map((ejercicioSesion, ejIdx) => (
          <div
            key={ejercicioSesion.id}
            className="p-4 sm:p-5 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3"
          >
            {/* Exercise Header */}
            <div className="flex items-start justify-between gap-2 border-b border-border/50 pb-3">
              <div>
                <span className="text-[11px] font-bold text-primary uppercase tracking-wider">
                  Ejercicio {ejIdx + 1}
                </span>
                <h3 className="font-extrabold text-base sm:text-lg text-foreground">
                  {ejercicioSesion.ejercicio?.nombre || `Ejercicio #${ejIdx + 1}`}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {ejercicioSesion.ejercicio?.grupoMuscular}
                </span>
              </div>
              {ejercicioSesion.notasCoach && (
                <div className="p-2 rounded-xl bg-secondary/60 text-muted-foreground flex items-center gap-1.5 max-w-xs text-[11px]">
                  <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">{ejercicioSesion.notasCoach}</span>
                </div>
              )}
            </div>

            {/* Sets Grid */}
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-2">
                <span className="col-span-2 text-center">Set</span>
                <span className="col-span-3 text-center">Peso (kg)</span>
                <span className="col-span-3 text-center">Reps</span>
                <span className="col-span-2 text-center">RPE</span>
                <span className="col-span-2 text-center">Listo</span>
              </div>

              {ejercicioSesion.series.map((serie, sIdx) => (
                <div
                  key={serie.id}
                  className={`grid grid-cols-12 gap-2 items-center p-2 rounded-xl border transition-all ${
                    serie.completada
                      ? 'bg-emerald-500/10 border-emerald-500/25'
                      : 'bg-secondary/30 border-border hover:border-primary/40'
                  }`}
                >
                  <span className="col-span-2 text-center font-mono font-bold text-xs text-foreground">
                    #{serie.numeroSerie}
                  </span>

                  {/* Weight Input */}
                  <div className="col-span-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={isCompleted || isPlanned}
                      value={serie.pesoKg || ''}
                      onChange={(e) =>
                        handleUpdateSerieValue(ejIdx, sIdx, 'pesoKg', e.target.value)
                      }
                      placeholder="kg"
                      className="w-full text-center py-1.5 px-2 rounded-lg bg-background border border-border text-xs font-mono font-semibold text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>

                  {/* Reps Input */}
                  <div className="col-span-3">
                    <input
                      type="number"
                      inputMode="numeric"
                      disabled={isCompleted || isPlanned}
                      value={serie.repsLogradas ?? serie.repsObjetivo}
                      onChange={(e) =>
                        handleUpdateSerieValue(ejIdx, sIdx, 'repsLogradas', e.target.value)
                      }
                      className="w-full text-center py-1.5 px-2 rounded-lg bg-background border border-border text-xs font-mono font-semibold text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>

                  {/* RPE Input */}
                  <div className="col-span-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={isCompleted || isPlanned}
                      value={serie.rpe || ''}
                      onChange={(e) =>
                        handleUpdateSerieValue(ejIdx, sIdx, 'rpe', e.target.value)
                      }
                      placeholder="8.5"
                      className="w-full text-center py-1.5 px-1 rounded-lg bg-background border border-border text-xs font-mono font-semibold text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>

                  {/* Complete Checkbox */}
                  <div className="col-span-2 flex justify-center">
                    <button
                      type="button"
                      disabled={isPlanned || isCompleted}
                      onClick={() => handleToggleSet(ejIdx, sIdx)}
                      aria-label={`Marcar serie ${serie.numeroSerie} como ${serie.completada ? 'pendiente' : 'completada'}`}
                      className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                        serie.completada
                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25 scale-105'
                          : 'bg-background border-2 border-border text-muted-foreground hover:border-primary'
                      }`}
                    >
                      {serie.completada && <Check className="h-5 w-5 stroke-[3]" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Floating Rest Timer */}
      <RestTimer
        isOpen={isRestTimerOpen}
        initialSeconds={timerSeconds}
        onClose={() => setIsRestTimerOpen(false)}
      />
    </div>
  );
}
