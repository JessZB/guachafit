import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/auth-context';
import { apiClient } from '../../lib/api-client';
import { queueOfflineMutation, offlineDb } from '../../lib/offline-db';
import { RestTimer } from '../../components/common/RestTimer';
import { triggerHaptic } from '../../lib/haptics';
import {
  SesionEntrenamientoDetalleDTO,
  EstadoSesion,
  SemanaEntrenamientoProgresoDTO,
  BloqueSemanaProgresoDTO,
} from '@guachafit/shared';
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
  Calendar,
  Zap,
  RotateCcw,
  Sparkles,
  Coffee,
  ArrowRight,
} from 'lucide-react';

const DEMO_BLOQUES_CATALOGO = [
  {
    bloqueId: 'd1',
    titulo: 'Día 1 (Lunes): Empuje & Pectoral / Tríceps',
    enfoque: 'Hipertrofia e Intensidad RPE 8',
    diaSugerido: 1,
    completado: true,
    ejercicios: [
      {
        nombre: 'Press Plano con Mancuernas',
        grupoMuscular: 'Pectoral / Deltoides',
        series: 4,
        reps: '8-10',
        peso: '28.00',
        rpe: '8.0',
        descansoSegundos: 90,
      },
      {
        nombre: 'Press Inclinado en Multipower',
        grupoMuscular: 'Pectoral Superior',
        series: 3,
        reps: '10-12',
        peso: '60.00',
        rpe: '8.5',
        descansoSegundos: 90,
      },
      {
        nombre: 'Fondos en Paralelas Asistidos',
        grupoMuscular: 'Tríceps / Pecho',
        series: 3,
        reps: '12',
        peso: '0.00',
        rpe: '8.0',
        descansoSegundos: 90,
      },
      {
        nombre: 'Extensiones de Tríceps en Polea',
        grupoMuscular: 'Tríceps',
        series: 4,
        reps: '12-15',
        peso: '25.00',
        rpe: '9.0',
        descansoSegundos: 60,
      },
    ],
  },
  {
    bloqueId: 'd2',
    titulo: 'Día 2 (Miércoles): Tracción & Espalda / Bíceps',
    enfoque: 'Volumen y Control Escapular',
    diaSugerido: 3,
    completado: false,
    ejercicios: [
      {
        nombre: 'Jalón al Pecho Agarre Neutro',
        grupoMuscular: 'Dorsal Ancho',
        series: 4,
        reps: '10-12',
        peso: '65.00',
        rpe: '8.0',
        descansoSegundos: 90,
      },
      {
        nombre: 'Remo con Barra T apoyado',
        grupoMuscular: 'Espalda Media',
        series: 4,
        reps: '8-10',
        peso: '50.00',
        rpe: '8.5',
        descansoSegundos: 90,
      },
      {
        nombre: 'Face Pulls en Polea Alta',
        grupoMuscular: 'Deltoides Posterior',
        series: 3,
        reps: '15',
        peso: '20.00',
        rpe: '7.5',
        descansoSegundos: 60,
      },
      {
        nombre: 'Curl con Barra Z de Pie',
        grupoMuscular: 'Bíceps',
        series: 3,
        reps: '10-12',
        peso: '30.00',
        rpe: '8.5',
        descansoSegundos: 60,
      },
    ],
  },
  {
    bloqueId: 'd3',
    titulo: 'Día 3 (Viernes): Pierna & Enfoque Cuádriceps / Isquios',
    enfoque: 'Fuerza Controlada (Cuidar Rodilla)',
    diaSugerido: 5,
    completado: false,
    ejercicios: [
      {
        nombre: 'Sentadilla Trasera con Barra',
        grupoMuscular: 'Cuádriceps / Glúteos',
        series: 4,
        reps: '8-10',
        peso: '85.00',
        rpe: '8.0',
        descansoSegundos: 120,
      },
      {
        nombre: 'Prensa Inclinada 45°',
        grupoMuscular: 'Cuádriceps',
        series: 4,
        reps: '10-12',
        peso: '140.00',
        rpe: '8.0',
        descansoSegundos: 120,
      },
      {
        nombre: 'Curl Femoral Tumbado',
        grupoMuscular: 'Isquiosurales',
        series: 4,
        reps: '12',
        peso: '45.00',
        rpe: '8.5',
        descansoSegundos: 90,
      },
      {
        nombre: 'Elevación de Gemelos en Máquina',
        grupoMuscular: 'Pantorrillas',
        series: 4,
        reps: '15',
        peso: '60.00',
        rpe: '8.0',
        descansoSegundos: 60,
      },
    ],
  },
  {
    bloqueId: 'd4',
    titulo: 'Día 4 (Sábado): Full Body & Core',
    enfoque: 'Acondicionamiento y Estabilidad',
    diaSugerido: 6,
    completado: false,
    ejercicios: [
      {
        nombre: 'Peso Muerto Rumano con Mancuernas',
        grupoMuscular: 'Cadena Posterior',
        series: 4,
        reps: '10-12',
        peso: '32.00',
        rpe: '8.0',
        descansoSegundos: 90,
      },
      {
        nombre: 'Press Militar con Mancuernas',
        grupoMuscular: 'Hombros',
        series: 3,
        reps: '10-12',
        peso: '20.00',
        rpe: '8.5',
        descansoSegundos: 90,
      },
      {
        nombre: 'Plancha Abdominal Isométrica',
        grupoMuscular: 'Core',
        series: 3,
        reps: '45s',
        peso: '0.00',
        rpe: '8.0',
        descansoSegundos: 60,
      },
    ],
  },
];

export function buildDemoSemanaProgreso(selectedBloqueId?: string): SemanaEntrenamientoProgresoDTO {
  const activoId = selectedBloqueId || 'd2';
  return {
    semanaIso: '2026-W38',
    inicioSemana: '14 sep',
    finSemana: '20 sep',
    totalBloques: 4,
    bloquesCompletados: 1,
    porcentajeCumplimiento: '25.00',
    siguienteBloqueSugeridoId: 'd2',
    esDiaDescansoHoy: false,
    bloques: DEMO_BLOQUES_CATALOGO.map((b) => ({
      bloqueId: b.bloqueId,
      titulo: b.titulo,
      enfoque: b.enfoque,
      diaSugerido: b.diaSugerido,
      totalEjercicios: b.ejercicios.length,
      completado: b.bloqueId === 'd1',
      esSugeridoHoy: b.bloqueId === activoId,
    })),
  };
}

function buildDemoSesion(bloqueId: string = 'd2', alumnoId: string = 'demo-alumno'): SesionEntrenamientoDetalleDTO {
  const b = DEMO_BLOQUES_CATALOGO.find((x) => x.bloqueId === bloqueId) || DEMO_BLOQUES_CATALOGO[1];
  const fechaHoy = new Date().toISOString().split('T')[0];

  return {
    id: `sesion-demo-${b.bloqueId}`,
    alumnoId,
    bloqueId: b.bloqueId,
    esDiaDescansoOriginal: b.diaSugerido === 6,
    fechaProgramada: fechaHoy,
    estado: b.completado ? EstadoSesion.COMPLETADA : EstadoSesion.PLANIFICADA,
    timezoneCliente: 'America/Caracas',
    porcentajeCumplimiento: b.completado ? '100.00' : '0.00',
    volumenTotalKg: b.completado ? '3420.00' : '0.00',
    ejercicios: b.ejercicios.map((ej, ejIdx) => ({
      id: `es-demo-${b.bloqueId}-${ejIdx}`,
      sesionId: `sesion-demo-${b.bloqueId}`,
      ejercicioId: `ej-demo-${b.bloqueId}-${ejIdx}`,
      orden: ejIdx + 1,
      notasCoach: `Enfoque técnico: ${ej.nombre} (${b.enfoque})`,
      descansoPrescritoSegundos: ej.descansoSegundos,
      ejercicio: {
        id: `ej-demo-${b.bloqueId}-${ejIdx}`,
        nombre: ej.nombre,
        grupoMuscular: ej.grupoMuscular,
        activo: true,
        createdAtUtc: new Date().toISOString(),
      },
      series: Array.from({ length: ej.series }, (_, sIdx) => ({
        id: `s-demo-${b.bloqueId}-${ejIdx}-${sIdx}`,
        ejercicioSesionId: `es-demo-${b.bloqueId}-${ejIdx}`,
        numeroSerie: sIdx + 1,
        repsObjetivo: parseInt(ej.reps.split('-')[0], 10) || 10,
        repsLogradas: b.completado ? parseInt(ej.reps.split('-')[0], 10) || 10 : 0,
        pesoKg: ej.peso,
        rpe: ej.rpe,
        completada: b.completado,
        descansoSegundos: ej.descansoSegundos,
      })),
    })),
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString(),
  };
}

export function EntrenamientoPage() {
  const { user } = useAuth();
  const [sesion, setSesion] = useState<SesionEntrenamientoDetalleDTO | null>(null);
  const [semanaProgreso, setSemanaProgreso] = useState<SemanaEntrenamientoProgresoDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitchingBloque, setIsSwitchingBloque] = useState(false);
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

  // Cargar sesión de hoy y progreso semanal de bloques (con soporte de bloque específico)
  const loadSessionAndProgress = useCallback(
    async (selectedBloqueId?: string) => {
      setIsLoading(true);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Caracas';
      try {
        if (navigator.onLine) {
          // 1. Cargar progreso de la semana actual
          const progresoRes = await apiClient<SemanaEntrenamientoProgresoDTO>(
            `/alumnos/me/rutina/semana-actual?timezone=${encodeURIComponent(tz)}`
          ).catch(() => null);

          let activeBloqueId = selectedBloqueId;

          if (progresoRes && progresoRes.totalBloques > 0) {
            setSemanaProgreso(progresoRes);
            if (!activeBloqueId) {
              activeBloqueId = progresoRes.siguienteBloqueSugeridoId || undefined;
            }
          } else {
            // Si no hay rutina asignada en la BD o estamos en modo demo, proveer bloques demo
            const demoProgreso = buildDemoSemanaProgreso(selectedBloqueId);
            setSemanaProgreso(demoProgreso);
            if (!activeBloqueId) {
              activeBloqueId = demoProgreso.siguienteBloqueSugeridoId || 'd2';
            }
          }

          // 2. Cargar sesión de hoy (o del bloque seleccionado)
          const url = activeBloqueId
            ? `/alumnos/me/sesiones/hoy?timezone=${encodeURIComponent(tz)}&bloqueId=${encodeURIComponent(activeBloqueId)}`
            : `/alumnos/me/sesiones/hoy?timezone=${encodeURIComponent(tz)}`;

          const data = await apiClient<SesionEntrenamientoDetalleDTO | null>(url).catch(() => null);
          if (data) {
            setSesion(data);
            // Cache en IndexedDB
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
            // Fallback a sesión demo del bloque seleccionado
            const demoSes = buildDemoSesion(activeBloqueId || 'd2', user?.id);
            setSesion(demoSes);
          }
        } else {
          // Offline fallback
          const cached = await offlineDb.rutinaHoy.toCollection().last();
          if (cached) {
            setSesion(cached.sesion);
          } else {
            setSesion(buildDemoSesion(selectedBloqueId || 'd2', user?.id));
          }
          setSemanaProgreso((prev) => prev || buildDemoSemanaProgreso(selectedBloqueId));
        }
      } catch (err) {
        console.warn('Fallback a datos locales o simulación de sesión:', err);
        setSemanaProgreso(buildDemoSemanaProgreso(selectedBloqueId));
        setSesion(buildDemoSesion(selectedBloqueId || 'd2', user?.id));
      } finally {
        setIsLoading(false);
        setIsSwitchingBloque(false);
      }
    },
    [user]
  );

  useEffect(() => {
    loadSessionAndProgress();
  }, [loadSessionAndProgress]);

  const handleSelectBloque = async (bloqueId: string) => {
    triggerHaptic('selection');
    setIsSwitchingBloque(true);
    setSemanaProgreso((prev) => {
      if (!prev) return buildDemoSemanaProgreso(bloqueId);
      return {
        ...prev,
        bloques: prev.bloques.map((b) => ({
          ...b,
          esSugeridoHoy: b.bloqueId === bloqueId,
        })),
      };
    });
    await loadSessionAndProgress(bloqueId);
  };

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

    // Actualizar progreso semanal reactivo
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Caracas';
    apiClient<SemanaEntrenamientoProgresoDTO>(
      `/alumnos/me/rutina/semana-actual?timezone=${encodeURIComponent(tz)}`
    ).then((p) => {
      if (p) setSemanaProgreso(p);
    }).catch(() => {});

    setIsFinishing(false);
    setIsFinishModalOpen(false);
    triggerHaptic('success');
  };

  if (isLoading && !sesion && !semanaProgreso) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  const isCompleted = sesion?.estado === EstadoSesion.COMPLETADA;
  const isInProgress = sesion?.estado === EstadoSesion.EN_PROGRESO;
  const isPlanned = sesion?.estado === EstadoSesion.PLANIFICADA;

  return (
    <div className="space-y-6">
      {/* Barra de Progreso Semanal Interactiva */}
      {semanaProgreso && semanaProgreso.totalBloques > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-card border border-border/80 shadow-md space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-xs sm:text-sm font-bold text-foreground">
                  Planificación Semanal · {semanaProgreso.semanaIso}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Lunes {semanaProgreso.inicioSemana} al Domingo {semanaProgreso.finSemana}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-end sm:self-center">
              <div className="text-right">
                <span className="text-xs font-black font-mono text-foreground">
                  {semanaProgreso.bloquesCompletados}/{semanaProgreso.totalBloques} Bloques
                </span>
                <span className="text-[10px] text-muted-foreground ml-1.5 font-bold">
                  ({semanaProgreso.porcentajeCumplimiento}%)
                </span>
              </div>
              <div className="w-20 sm:w-24 h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, parseFloat(semanaProgreso.porcentajeCumplimiento)))}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Chips de Bloques de la Semana */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {semanaProgreso.bloques.map((b) => {
              const esActivo = sesion?.bloqueId === b.bloqueId;
              const esCompletado = b.completado;
              const esSugerido = b.esSugeridoHoy;

              let badgeStyle =
                'bg-secondary/60 text-muted-foreground border-border hover:bg-secondary hover:text-foreground';
              if (esCompletado) {
                badgeStyle = esActivo
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 ring-2 ring-emerald-500/30 font-extrabold'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 font-bold';
              } else if (esActivo) {
                badgeStyle =
                  'bg-primary text-primary-foreground border-primary font-black shadow-md shadow-primary/25 ring-2 ring-primary/30';
              } else if (esSugerido) {
                badgeStyle =
                  'bg-primary/15 text-primary border-primary/40 hover:bg-primary/25 font-extrabold';
              }

              return (
                <button
                  key={b.bloqueId}
                  type="button"
                  disabled={isSwitchingBloque}
                  onClick={() => handleSelectBloque(b.bloqueId)}
                  className={`py-2 px-3.5 rounded-2xl border text-xs whitespace-nowrap transition-all duration-200 flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50 ${badgeStyle}`}
                  title={`Seleccionar ${b.titulo}`}
                >
                  {esCompletado ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : esActivo ? (
                    <Zap className="h-3.5 w-3.5 shrink-0 fill-current" />
                  ) : esSugerido ? (
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  )}
                  <span className="font-semibold">{b.titulo.split(':')[0]}</span>
                  {esCompletado && <span className="text-[10px] font-bold opacity-80">✓</span>}
                  {esActivo && <span className="text-[10px] font-mono uppercase tracking-wider ml-0.5">Hoy</span>}
                  {!esCompletado && !esActivo && esSugerido && (
                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                      Sugerido
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Si NO hay sesión activa seleccionada (Día de descanso o semana completada) */}
      {!sesion && (
        <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border/80 shadow-md text-center space-y-5">
          <div className="h-16 w-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner">
            {semanaProgreso?.esDiaDescansoHoy ? (
              <Coffee className="h-8 w-8" />
            ) : (
              <Dumbbell className="h-8 w-8" />
            )}
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-xl font-black text-foreground">
              {semanaProgreso?.esDiaDescansoHoy
                ? 'Día de descanso según tu plan'
                : 'No hay sesión activa seleccionada'}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {semanaProgreso?.bloquesCompletados === semanaProgreso?.totalBloques &&
              (semanaProgreso?.totalBloques ?? 0) > 0
                ? '¡Excelente trabajo! Has completado el 100% de tus bloques semanales. Disfruta tu recuperación.'
                : 'Puedes descansar hoy o aprovechar el día para recuperar cualquiera de tus bloques semanales pendientes:'}
            </p>
          </div>

          {/* Bloques Pendientes para Recuperación con 1-Toque */}
          {semanaProgreso && semanaProgreso.bloques.filter((b) => !b.completado).length > 0 && (
            <div className="pt-3 border-t border-border/60 max-w-lg mx-auto space-y-2.5">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                Bloques pendientes de esta semana
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {semanaProgreso.bloques
                  .filter((b) => !b.completado)
                  .map((b) => (
                    <button
                      key={b.bloqueId}
                      type="button"
                      disabled={isSwitchingBloque}
                      onClick={() => handleSelectBloque(b.bloqueId)}
                      className="p-3.5 rounded-2xl bg-secondary/50 hover:bg-secondary border border-border hover:border-primary/50 text-left transition-all duration-200 active:scale-98 cursor-pointer flex flex-col justify-between group disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-black text-foreground group-hover:text-primary transition-colors">
                          {b.titulo}
                        </span>
                        {b.esSugeridoHoy && (
                          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-primary/20 text-primary">
                            Sugerido
                          </span>
                        )}
                      </div>
                      {b.enfoque && (
                        <span className="text-[11px] text-muted-foreground line-clamp-1">
                          {b.enfoque}
                        </span>
                      )}
                      <div className="mt-2.5 flex items-center justify-between text-[11px] font-bold text-primary">
                        <span>Entrenar este bloque hoy</span>
                        <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Si HAY sesión cargada */}
      {sesion && (
        <>
          {/* Session Hero Banner */}
          <div className="p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
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
                  <span className="text-xs text-muted-foreground font-mono">{sesion.fechaProgramada}</span>
                  {sesion.esDiaDescansoOriginal && (
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/25 flex items-center gap-1">
                      ⏱️ Recuperada en Descanso
                    </span>
                  )}
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
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <div className="relative flex items-center justify-center">
                <Clock className="h-4 w-4 text-primary" />
                <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
              </div>
              <span>Entrenamiento activo. Marca tus series y pesos al completarlas.</span>
            </div>
            <button
              onClick={handleOpenFinishModal}
              className="py-2.5 px-5 rounded-xl bg-primary hover:brightness-110 text-primary-foreground font-bold text-xs shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer"
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

            <div className="pt-2 flex items-center justify-end">
              <button
                type="button"
                disabled={isSwitchingBloque}
                onClick={() => handleSelectBloque(sesion.bloqueId || '')}
                className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1.5 py-1.5 px-3.5 rounded-xl bg-secondary/80 hover:bg-secondary border border-border/60 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5 text-primary" />
                <span>Volver a entrenar este bloque</span>
              </button>
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
              className="w-full py-3 px-4 rounded-2xl bg-primary hover:brightness-110 text-primary-foreground font-bold text-xs tracking-wide shadow-md shadow-primary/25 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isFinishing ? 'Guardando entrenamiento...' : 'Guardar y Enviar al Coach'}</span>
            </button>
          </div>
        </div>
      )}
      </>
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
