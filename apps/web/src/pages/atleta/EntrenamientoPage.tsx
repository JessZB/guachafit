import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/auth-context';
import { apiClient } from '../../lib/api-client';
import { queueOfflineMutation, offlineDb } from '../../lib/offline-db';
import { RestTimer } from '../../components/common/RestTimer';
import { triggerHaptic } from '../../lib/haptics';
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
  X,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';

export function EntrenamientoPage() {
  const { user } = useAuth();
  const [sesion, setSesion] = useState<SesionEntrenamientoDetalleDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestTimerOpen, setIsRestTimerOpen] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(90);
  const [activeSerieKey, setActiveSerieKey] = useState<{ ejercicioIndex: number; serieIndex: number } | null>(null);

  // Modal de Finalización y Feedback al Coach
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [rpeSesion, setRpeSesion] = useState(8);
  const [molestia, setMolestia] = useState('Ninguna 👍');
  const [notasCoachInput, setNotasCoachInput] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);

  const getRpeDescription = (val: number): string => {
    if (val <= 3) return 'Descarga / Muy ligero';
    if (val <= 5) return 'Ligero / Cómodo';
    if (val === 6) return 'Exigencia media';
    if (val === 7) return 'Esfuerzo notable';
    if (val === 8) return 'Óptimo (RIR 2)';
    if (val === 9) return 'Casi al límite (RIR 1-0)';
    return 'Fallo muscular (10/10)';
  };

  // Accesibilidad: Cierre de modal con Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFinishModalOpen) {
        setIsFinishModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFinishModalOpen]);

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

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Caracas';
    const initPayload = { timezoneCliente: tz, fechaInicioUtc: nowUtc };

    if (navigator.onLine) {
      try {
        await apiClient(`/sesiones/${sesion.id}/iniciar`, {
          method: 'POST',
          body: JSON.stringify(initPayload),
        });
      } catch (err) {
        await queueOfflineMutation(`/sesiones/${sesion.id}/iniciar`, 'POST', initPayload, 'Iniciar sesión');
      }
    } else {
      await queueOfflineMutation(`/sesiones/${sesion.id}/iniciar`, 'POST', initPayload, 'Iniciar sesión');
    }
  };

  // Notificación de cambio de duración en el temporizador (Alumno ajusta descanso)
  const handleRestDurationChange = useCallback(
    async (newSeconds: number) => {
      setTimerSeconds(newSeconds);
      if (!activeSerieKey || !sesion) return;
      const { ejercicioIndex, serieIndex } = activeSerieKey;
      const ejercicio = sesion.ejercicios[ejercicioIndex];
      if (!ejercicio) return;
      const serie = ejercicio.series[serieIndex];
      if (!serie) return;

      if (serie.descansoSegundos === newSeconds) return;

      const updated = { ...sesion };
      updated.ejercicios[ejercicioIndex].series[serieIndex].descansoSegundos = newSeconds;
      setSesion(updated);

      offlineDb.rutinaHoy.put({
        id: updated.id,
        alumnoId: user?.id || '',
        fechaProgramada: updated.fechaProgramada,
        sesion: updated,
        updatedAt: Date.now(),
      }).catch(() => {});

      if (navigator.onLine) {
        try {
          await apiClient(`/sesiones/${sesion.id}/series`, {
            method: 'PUT',
            body: JSON.stringify({
              series: [
                {
                  serieId: serie.id,
                  repsLogradas: serie.repsLogradas ?? serie.repsObjetivo,
                  pesoKg: serie.pesoKg,
                  rpe: serie.rpe,
                  descansoSegundos: newSeconds,
                  completada: serie.completada,
                  timestampCompletadaUtc: serie.timestampCompletadaUtc,
                },
              ],
            }),
          });
        } catch {}
      }
    },
    [activeSerieKey, sesion, user]
  );

  // Toggle set completion and trigger rest timer
  const handleToggleSet = async (ejercicioIndex: number, serieIndex: number) => {
    if (!sesion) return;
    const updated = { ...sesion };
    const serie = updated.ejercicios[ejercicioIndex].series[serieIndex];
    const willBeCompleted = !serie.completada;

    serie.completada = willBeCompleted;
    if (willBeCompleted) {
      serie.timestampCompletadaUtc = new Date().toISOString();
      triggerHaptic('success');

      // Pre-rellenado inteligente: si la siguiente serie del ejercicio no tiene peso asignado,
      // hereda automáticamente el peso y repeticiones de la serie que se acaba de completar
      const seriesDelEjercicio = updated.ejercicios[ejercicioIndex].series;
      const nextSerie = seriesDelEjercicio[serieIndex + 1];
      if (
        nextSerie &&
        !nextSerie.completada &&
        (!nextSerie.pesoKg || nextSerie.pesoKg === '0.00' || nextSerie.pesoKg === '')
      ) {
        if (serie.pesoKg && serie.pesoKg !== '0.00') {
          nextSerie.pesoKg = serie.pesoKg;
        }
        if (serie.repsLogradas !== null && serie.repsLogradas !== undefined) {
          nextSerie.repsLogradas = serie.repsLogradas;
        }
      }

      // Descanso prescrito para este ejercicio (o 90s por defecto)
      const prescrito = updated.ejercicios[ejercicioIndex].descansoPrescritoSegundos || 90;
      serie.descansoSegundos = serie.descansoSegundos ?? prescrito;

      // Iniciar el temporizador con el tiempo del ejercicio
      setTimerSeconds(serie.descansoSegundos);
      setActiveSerieKey({ ejercicioIndex, serieIndex });
      setIsRestTimerOpen(true);
    } else {
      triggerHaptic('light');
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
          descansoSegundos: serie.descansoSegundos ?? null,
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

    // Auto-guardado inmediato en IndexedDB
    offlineDb.rutinaHoy.put({
      id: updated.id,
      alumnoId: user?.id || '',
      fechaProgramada: updated.fechaProgramada,
      sesion: updated,
      updatedAt: Date.now(),
    }).catch(() => {});
  };

  // Step set value (+ / -) for weight and reps with haptic feedback
  const handleStepSerieValue = (
    ejercicioIndex: number,
    serieIndex: number,
    field: 'pesoKg' | 'repsLogradas',
    delta: number
  ) => {
    if (!sesion) return;
    triggerHaptic('light');
    const updated = { ...sesion };
    const serie = updated.ejercicios[ejercicioIndex].series[serieIndex];
    if (field === 'pesoKg') {
      const current = parseFloat(serie.pesoKg || '0') || 0;
      const next = Math.max(0, Math.round((current + delta) * 100) / 100);
      serie.pesoKg = next > 0 ? String(next) : '';
    } else if (field === 'repsLogradas') {
      const current = serie.repsLogradas ?? serie.repsObjetivo ?? 0;
      const next = Math.max(0, current + delta);
      serie.repsLogradas = next;
    }
    setSesion(updated);

    // Auto-guardado inmediato en IndexedDB
    offlineDb.rutinaHoy.put({
      id: updated.id,
      alumnoId: user?.id || '',
      fechaProgramada: updated.fechaProgramada,
      sesion: updated,
      updatedAt: Date.now(),
    }).catch(() => {});
  };

  // Finish session handlers (Modal de Feedback)
  const handleOpenFinishModal = () => {
    setIsFinishModalOpen(true);
  };

  const confirmFinishSession = async () => {
    if (!sesion) return;
    setIsFinishing(true);

    // Cálculo comparativo de descansos (Prescrito vs. Real)
    let totalDescansoReal = 0;
    let countSeriesDescanso = 0;
    let totalDescansoPrescrito = 0;

    sesion.ejercicios.forEach((ej) => {
      const prescrito = ej.descansoPrescritoSegundos || 90;
      ej.series.forEach((s) => {
        if (s.completada && s.descansoSegundos) {
          totalDescansoReal += s.descansoSegundos;
          totalDescansoPrescrito += prescrito;
          countSeriesDescanso++;
        }
      });
    });

    let descansoTag: string | null = null;
    if (countSeriesDescanso > 0) {
      const avgReal = Math.round(totalDescansoReal / countSeriesDescanso);
      const avgPrescrito = Math.round(totalDescansoPrescrito / countSeriesDescanso);
      const diff = avgReal - avgPrescrito;
      const diffStr = diff > 0 ? `+${diff}s` : diff < 0 ? `${diff}s` : 'exacto';
      descansoTag = `[Descanso prom: ${avgReal}s (prescrito: ${avgPrescrito}s • ${diffStr})]`;
    }

    const notasCompletas = [
      `[RPE: ${rpeSesion}/10]`,
      molestia !== 'Ninguna 👍' ? `[Molestia: ${molestia}]` : null,
      descansoTag,
      notasCoachInput.trim() ? notasCoachInput.trim() : null,
    ]
      .filter(Boolean)
      .join(' • ');

    const updated: SesionEntrenamientoDetalleDTO = {
      ...sesion,
      estado: EstadoSesion.COMPLETADA,
      fechaFinUtc: new Date().toISOString(),
      notasAlumno: notasCompletas,
    };
    setSesion(updated);

    const payload = {
      notasAlumno: notasCompletas,
      fechaFinUtc: new Date().toISOString(),
    };

    let finalUpdated = updated;
    if (navigator.onLine) {
      try {
        const res: any = await apiClient(`/sesiones/${sesion.id}/finalizar`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (res?.sesion) {
          finalUpdated = res.sesion;
          setSesion(res.sesion);
        }
      } catch {
        await queueOfflineMutation(`/sesiones/${sesion.id}/finalizar`, 'POST', payload, 'Finalizar sesión con feedback');
      }
    } else {
      await queueOfflineMutation(`/sesiones/${sesion.id}/finalizar`, 'POST', payload, 'Finalizar sesión con feedback');
    }

    if (sesion.id) {
      await offlineDb.rutinaHoy.put({
        id: sesion.id,
        alumnoId: user?.id || '',
        fechaProgramada: sesion.fechaProgramada,
        sesion: finalUpdated,
        updatedAt: Date.now(),
      });
    }

    setIsFinishing(false);
    setIsFinishModalOpen(false);
    triggerHaptic('success');
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
            <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-secondary/60 border border-border">
              <Flame
                className={`h-6 w-6 ${
                  sesion.cumpleReglaRacha ? 'text-amber-500 fill-amber-500 animate-pulse' : 'text-muted-foreground'
                }`}
              />
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
                  Progreso
                </span>
                <span className="text-base sm:text-lg font-black font-mono">
                  {sesion.porcentajeCumplimiento}%
                </span>
              </div>
            </div>

            {sesion.volumenTotalKg && sesion.volumenTotalKg !== '0.00' && (
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-secondary/60 border border-border">
                <Dumbbell className="h-6 w-6 text-primary" />
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
                    Volumen
                  </span>
                  <span className="text-base sm:text-lg font-black font-mono text-foreground">
                    {sesion.volumenTotalKg} kg
                  </span>
                </div>
              </div>
            )}

            {/* Quick Rest Timer Trigger */}
            <button
              onClick={() => setIsRestTimerOpen(!isRestTimerOpen)}
              className="p-3 rounded-2xl bg-secondary/60 border border-border hover:border-primary/50 text-foreground transition-colors flex items-center gap-2 cursor-pointer"
              title="Abrir cronómetro de descanso"
            >
              <Timer className="h-6 w-6 text-primary" />
              <span className="text-xs font-bold hidden sm:inline">Descanso</span>
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
              <span>Entrenamiento activo. Marca tus series y pesos al completarlas.</span>
            </div>
            <button
              onClick={handleOpenFinishModal}
              className="py-2.5 px-5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-md hover:bg-emerald-500 active:scale-95 transition-all cursor-pointer"
            >
              Finalizar Entrenamiento
            </button>
          </div>
        )}

        {isCompleted && (
          <div className="space-y-3">
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

            {sesion.notasAlumno && (
              <div className="p-3.5 rounded-2xl bg-secondary/50 border border-border/80 text-xs space-y-1">
                <span className="font-bold text-muted-foreground text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="h-3 w-3 text-primary" />
                  Sensaciones y notas enviadas a tu coach:
                </span>
                <p className="text-foreground font-medium">{sesion.notasAlumno}</p>
              </div>
            )}
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
                <span className="text-xs font-black text-primary uppercase tracking-wider">
                  Ejercicio {ejIdx + 1}
                </span>
                <h3 className="font-black text-lg sm:text-xl text-foreground tracking-tight mt-0.5">
                  {ejercicioSesion.ejercicio?.nombre || `Ejercicio #${ejIdx + 1}`}
                </h3>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs sm:text-sm text-muted-foreground font-semibold">
                    {ejercicioSesion.ejercicio?.grupoMuscular}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-secondary text-foreground border border-border">
                    <Timer className="h-3 w-3 text-primary" />
                    <span>Descanso: {ejercicioSesion.descansoPrescritoSegundos || 90}s</span>
                  </span>
                </div>
              </div>
              {ejercicioSesion.notasCoach && (
                <div className="p-2.5 rounded-2xl bg-secondary/60 text-muted-foreground flex items-center gap-2 max-w-xs text-xs">
                  <Info className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">{ejercicioSesion.notasCoach}</span>
                </div>
              )}
            </div>

            {/* Sets Grid */}
            <div className="space-y-2.5">
              <div className="grid grid-cols-12 gap-1.5 sm:gap-2.5 text-xs font-black text-muted-foreground uppercase tracking-wider px-2">
                <span className="col-span-1 text-center">#</span>
                <span className="col-span-4 text-center">Peso (kg)</span>
                <span className="col-span-3 text-center">Reps</span>
                <span className="col-span-2 text-center" title="Nivel de esfuerzo percibido (1 a 10)">RPE</span>
                <span className="col-span-2 text-center">Listo</span>
              </div>

              {ejercicioSesion.series.map((serie, sIdx) => (
                <div
                  key={serie.id}
                  className={`grid grid-cols-12 gap-1.5 sm:gap-2.5 items-center p-2 sm:p-2.5 rounded-2xl border transition-all ${
                    serie.completada
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-secondary/30 border-border hover:border-primary/40'
                  }`}
                >
                  <span className="col-span-1 text-center font-mono font-black text-sm sm:text-base text-foreground">
                    #{serie.numeroSerie}
                  </span>

                  {/* Weight Input with Steppers (- / + 2.5kg) */}
                  <div className="col-span-4">
                    <div className="flex items-center rounded-xl bg-background border border-border focus-within:border-primary overflow-hidden transition-colors h-10 sm:h-11 shadow-2xs">
                      <button
                        type="button"
                        tabIndex={-1}
                        disabled={isCompleted || isPlanned}
                        onClick={() => handleStepSerieValue(ejIdx, sIdx, 'pesoKg', -2.5)}
                        aria-label="Restar 2.5 kg"
                        className="h-full w-8 sm:w-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:bg-secondary transition-colors cursor-pointer text-sm sm:text-base font-black shrink-0 select-none disabled:opacity-30"
                      >
                        -
                      </button>
                      <input
                        type="text"
                        inputMode="decimal"
                        disabled={isCompleted || isPlanned}
                        value={serie.pesoKg || ''}
                        onChange={(e) =>
                          handleUpdateSerieValue(ejIdx, sIdx, 'pesoKg', e.target.value)
                        }
                        placeholder="kg"
                        className="w-full min-w-0 text-center py-2 px-0.5 bg-transparent text-sm sm:text-base font-mono font-black text-foreground focus:outline-hidden"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        disabled={isCompleted || isPlanned}
                        onClick={() => handleStepSerieValue(ejIdx, sIdx, 'pesoKg', 2.5)}
                        aria-label="Sumar 2.5 kg"
                        className="h-full w-8 sm:w-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:bg-secondary transition-colors cursor-pointer text-sm sm:text-base font-black shrink-0 select-none disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Reps Input with Steppers (- / + 1 rep) */}
                  <div className="col-span-3">
                    <div className="flex items-center rounded-xl bg-background border border-border focus-within:border-primary overflow-hidden transition-colors h-10 sm:h-11 shadow-2xs">
                      <button
                        type="button"
                        tabIndex={-1}
                        disabled={isCompleted || isPlanned}
                        onClick={() => handleStepSerieValue(ejIdx, sIdx, 'repsLogradas', -1)}
                        aria-label="Restar 1 repetición"
                        className="h-full w-7 sm:w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:bg-secondary transition-colors cursor-pointer text-sm sm:text-base font-black shrink-0 select-none disabled:opacity-30"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        disabled={isCompleted || isPlanned}
                        value={serie.repsLogradas ?? serie.repsObjetivo}
                        onChange={(e) =>
                          handleUpdateSerieValue(ejIdx, sIdx, 'repsLogradas', e.target.value)
                        }
                        className="w-full min-w-0 text-center py-2 px-0.5 bg-transparent text-sm sm:text-base font-mono font-black text-foreground focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        disabled={isCompleted || isPlanned}
                        onClick={() => handleStepSerieValue(ejIdx, sIdx, 'repsLogradas', 1)}
                        aria-label="Sumar 1 repetición"
                        className="h-full w-7 sm:w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:bg-secondary transition-colors cursor-pointer text-sm sm:text-base font-black shrink-0 select-none disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
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
                      className="w-full text-center py-2 px-1 rounded-xl bg-background border border-border text-xs sm:text-sm font-mono font-bold text-foreground focus:outline-hidden focus:border-primary h-10 sm:h-11 shadow-2xs"
                    />
                  </div>

                  {/* Complete Checkbox */}
                  <div className="col-span-2 flex justify-center">
                    <button
                      type="button"
                      disabled={isPlanned || isCompleted}
                      onClick={() => handleToggleSet(ejIdx, sIdx)}
                      aria-label={`Marcar serie ${serie.numeroSerie} como ${serie.completada ? 'pendiente' : 'completada'}`}
                      className={`h-10 w-10 sm:h-11 sm:w-11 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                        serie.completada
                          ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25 scale-105'
                          : 'bg-background border-2 border-border text-muted-foreground hover:border-primary'
                      }`}
                    >
                      {serie.completada && <Check className="h-5 w-5 sm:h-6 sm:w-6 stroke-[3.5]" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Modal de Finalización y Feedback al Coach */}
      {isFinishModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsFinishModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-finish-title"
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
                    Finalizar Entrenamiento
                  </h3>
                  <p className="text-[11px] text-muted-foreground">Feedback directo para tu entrenador</p>
                </div>
              </div>
              <button
                onClick={() => setIsFinishModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* RPE Global de la Sesión (Escala completa 1-10) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-foreground">
                  Esfuerzo Percibido Global (RPE)
                </label>
                <span className="text-primary font-mono font-black text-sm">
                  {rpeSesion} / 10 · <span className="text-[11px] font-semibold text-muted-foreground">{getRpeDescription(rpeSesion)}</span>
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setRpeSesion(val);
                    }}
                    className={`py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      rpeSesion === val
                        ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25 scale-105'
                        : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {val === 1 ? '1 (Bajo)' : val === 8 ? '8 (Ideal)' : val === 10 ? '10 (Max)' : val}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground px-1 font-medium">
                <span>1-4: Descarga / Ligero</span>
                <span>5-6: Moderado</span>
                <span>7-8: Óptimo</span>
                <span>9-10: Al límite</span>
              </div>
            </div>

            {/* Molestias o dolores articulares */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground">
                ¿Sentiste alguna molestia articular o dolor?
              </label>
              <div className="flex flex-wrap gap-1.5">
                {['Ninguna 👍', 'Hombro', 'Rodilla', 'Lumbar', 'Codo', 'Muñeca', 'Otra'].map((zona) => (
                  <button
                    key={zona}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setMolestia(zona);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      molestia === zona
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-xs'
                        : 'bg-secondary/40 text-muted-foreground hover:text-foreground border border-transparent'
                    }`}
                  >
                    {zona}
                  </button>
                ))}
              </div>
            </div>

            {/* Notas para el coach */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center justify-between">
                <span>Notas u observaciones para tu coach</span>
                <span className="text-[10px] text-muted-foreground font-normal">Opcional</span>
              </label>
              <textarea
                rows={3}
                value={notasCoachInput}
                onChange={(e) => setNotasCoachInput(e.target.value)}
                placeholder="Ej: Tuve que usar mancuernas porque la barra estaba ocupada. Sentí buena energía en sentadillas..."
                className="w-full p-3 rounded-2xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-primary resize-none"
              />
            </div>

            {/* Resumen comparativo de descansos */}
            {(() => {
              if (!sesion) return null;
              let totalReal = 0;
              let totalPresc = 0;
              let count = 0;
              sesion.ejercicios.forEach((ej) => {
                const prescrito = ej.descansoPrescritoSegundos || 90;
                ej.series.forEach((s) => {
                  if (s.completada && s.descansoSegundos) {
                    totalReal += s.descansoSegundos;
                    totalPresc += prescrito;
                    count++;
                  }
                });
              });
              if (count === 0) return null;
              const avgReal = Math.round(totalReal / count);
              const avgPresc = Math.round(totalPresc / count);
              const diff = avgReal - avgPresc;

              return (
                <div className="p-3 rounded-2xl bg-secondary/40 border border-border/70 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Timer className="h-4 w-4 text-primary" />
                    <div>
                      <span className="font-bold text-foreground block">Descanso Promedio</span>
                      <span className="text-[11px] text-muted-foreground">Prescrito: {avgPresc}s</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-black text-sm text-foreground">{avgReal}s</span>
                    <span
                      className={`text-[10px] font-bold block ${
                        diff > 15
                          ? 'text-amber-400'
                          : diff < -15
                          ? 'text-sky-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {diff > 0 ? `+${diff}s extra` : diff < 0 ? `${diff}s menos` : 'Adherido al plan'}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Botón de Enviar */}
            <button
              onClick={confirmFinishSession}
              disabled={isFinishing}
              className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wide shadow-md shadow-emerald-600/25 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isFinishing ? 'Guardando entrenamiento...' : 'Guardar y Enviar al Coach'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Rest Timer */}
      <RestTimer
        isOpen={isRestTimerOpen}
        initialSeconds={timerSeconds}
        onDurationChange={handleRestDurationChange}
        onClose={() => {
          setIsRestTimerOpen(false);
          setActiveSerieKey(null);
        }}
      />
    </div>
  );
}
