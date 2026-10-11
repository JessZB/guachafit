/**
 * RF-004 RN-02: comparador fotográfico real del entrenador.
 *
 * Flujo: elegir alumno → cargar sus controles APROBADOS (endpoint de evolución) → elegir las
 * fechas A y B → elegir perspectiva → consultar `GET /antropometria/comparador/:alumnoId`.
 * En modo demo se usa el roster y el fixture local (ADR-012), sin llamadas API.
 *
 * Estados honestos: carga, vacío explícito (sin alumnos / sin dos controles aprobados / sin
 * fotos comparables) y error con reintento. Las perspectivas sin foto en alguna fecha se
 * inhabilitan con el aviso de RF-004 §6.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Camera, Loader2, Users } from 'lucide-react';
import {
  AnguloFoto,
  type ComparativaAngularDTO,
  type ControlAntropometricoDetalleDTO,
  type DirectorioAlumnosDTO,
  type EvolucionCorporalDTO,
  type PerfilAlumnoDetalleDTO,
} from '@guachafit/shared';
import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';
import { ROSTER_DEMO_DIRECTORIO } from '../../lib/directorio-alumnos';
import { crearEvolucionDemo } from '../../lib/demo-evolucion';
import { formatFechaCalendario } from '../../lib/date-format';
import {
  angulosComparables,
  construirComparativa,
  normalizarComparativaApi,
  type ComparativaFotos,
} from '../../lib/comparador-fotos';
import { ComparadorFotos } from '../common/ComparadorFotos';

function nombreAlumno(alumno: PerfilAlumnoDetalleDTO): string {
  return `${alumno.nombres} ${alumno.apellidos}`;
}

export function ComparadorAntropometrico() {
  const { isDemoMode } = useAuth();

  const [alumnos, setAlumnos] = useState<PerfilAlumnoDetalleDTO[]>([]);
  const [alumnoId, setAlumnoId] = useState('');
  const [cargandoAlumnos, setCargandoAlumnos] = useState(false);
  const [errorAlumnos, setErrorAlumnos] = useState<string | null>(null);

  const [evolucion, setEvolucion] = useState<EvolucionCorporalDTO | null>(null);
  const [cargandoEvolucion, setCargandoEvolucion] = useState(false);
  const [errorEvolucion, setErrorEvolucion] = useState<string | null>(null);

  const [controlAId, setControlAId] = useState('');
  const [controlBId, setControlBId] = useState('');
  const [angulo, setAngulo] = useState<AnguloFoto>(AnguloFoto.FRONTAL);

  const [comparativa, setComparativa] = useState<ComparativaFotos | null>(null);
  const [cargandoComparativa, setCargandoComparativa] = useState(false);
  const [errorComparativa, setErrorComparativa] = useState<string | null>(null);
  const [reintento, setReintento] = useState(0);

  const controles = evolucion?.evaluaciones ?? [];

  const controlA = useMemo(
    () => controles.find((control) => control.id === controlAId) ?? null,
    [controles, controlAId]
  );
  const controlB = useMemo(
    () => controles.find((control) => control.id === controlBId) ?? null,
    [controles, controlBId]
  );

  const angulosDisponibles = useMemo(
    () => angulosComparables(controlA, controlB),
    [controlA, controlB]
  );

  /** Carga del directorio del coach (o roster demo). */
  const cargarAlumnos = useCallback(async () => {
    if (isDemoMode) {
      setAlumnos(ROSTER_DEMO_DIRECTORIO);
      setAlumnoId((actual) => actual || ROSTER_DEMO_DIRECTORIO[0]?.usuarioId || '');
      setErrorAlumnos(null);
      return;
    }

    setCargandoAlumnos(true);
    setErrorAlumnos(null);
    try {
      const data = await apiClient<DirectorioAlumnosDTO>('/alumnos?limit=100');
      setAlumnos(data.items);
      setAlumnoId((actual) => actual || data.items[0]?.usuarioId || '');
    } catch (err: any) {
      setAlumnos([]);
      setErrorAlumnos(err?.message || 'No se pudo cargar la lista de alumnos.');
    } finally {
      setCargandoAlumnos(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    cargarAlumnos();
  }, [cargarAlumnos]);

  /** Carga de la serie aprobada del alumno elegido. */
  const cargarEvolucion = useCallback(
    async (usuarioId: string) => {
      if (!usuarioId) {
        setEvolucion(null);
        return;
      }

      if (isDemoMode) {
        const demo = crearEvolucionDemo(usuarioId);
        setEvolucion(demo);
        setControlAId(demo.evaluaciones[0]?.id ?? '');
        setControlBId(demo.evaluaciones[demo.evaluaciones.length - 1]?.id ?? '');
        setErrorEvolucion(null);
        return;
      }

      setCargandoEvolucion(true);
      setErrorEvolucion(null);
      try {
        const data = await apiClient<EvolucionCorporalDTO>(`/antropometria/evolucion/${usuarioId}`);
        setEvolucion(data);
        setControlAId(data.evaluaciones[0]?.id ?? '');
        setControlBId(data.evaluaciones[data.evaluaciones.length - 1]?.id ?? '');
      } catch (err: any) {
        setEvolucion(null);
        setErrorEvolucion(
          err?.message || 'No se pudieron cargar los controles aprobados de este alumno.'
        );
      } finally {
        setCargandoEvolucion(false);
      }
    },
    [isDemoMode]
  );

  useEffect(() => {
    setComparativa(null);
    cargarEvolucion(alumnoId);
  }, [alumnoId, cargarEvolucion]);

  /** Si la perspectiva elegida deja de estar disponible, salta a la primera comparable. */
  useEffect(() => {
    if (angulosDisponibles.length === 0) return;
    if (!angulosDisponibles.includes(angulo)) setAngulo(angulosDisponibles[0]);
  }, [angulosDisponibles, angulo]);

  const parValido = Boolean(controlA && controlB && controlA.id !== controlB.id);

  /** Comparativa: local en demo, endpoint real en sesión autenticada. */
  const cargarComparativa = useCallback(async () => {
    if (!parValido || !controlA || !controlB || !alumnoId) {
      setComparativa(null);
      return;
    }
    if (angulosDisponibles.length === 0) {
      setComparativa(null);
      return;
    }

    if (isDemoMode) {
      setComparativa(construirComparativa(controlA, controlB, angulo));
      setErrorComparativa(null);
      return;
    }

    setCargandoComparativa(true);
    setErrorComparativa(null);
    try {
      const parametros = new URLSearchParams({
        controlIdA: controlA.id,
        controlIdB: controlB.id,
        angulo,
      });
      const data = await apiClient<ComparativaAngularDTO & { fotoDisponible?: boolean }>(
        `/antropometria/comparador/${alumnoId}?${parametros.toString()}`
      );
      setComparativa(normalizarComparativaApi(data));
    } catch (err: any) {
      setComparativa(null);
      setErrorComparativa(
        err?.message || 'No se pudo cargar la comparación fotográfica. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setCargandoComparativa(false);
    }
  }, [alumnoId, angulo, angulosDisponibles, controlA, controlB, isDemoMode, parValido]);

  useEffect(() => {
    cargarComparativa();
  }, [cargarComparativa, reintento]);

  const alumnoSeleccionado = alumnos.find((alumno) => alumno.usuarioId === alumnoId) ?? null;

  return (
    <div className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-md space-y-5">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="font-bold text-lg text-foreground">Comparador Antes / Después</h2>
      </div>

      {errorAlumnos && (
        <div role="alert" className="p-4 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorAlumnos}</span>
          <button
            type="button"
            onClick={() => cargarAlumnos()}
            className="ml-auto px-3 py-1.5 rounded-xl bg-destructive/15 font-bold cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {cargandoAlumnos ? (
        <div className="py-10 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
        </div>
      ) : !errorAlumnos && alumnos.length === 0 ? (
        <div className="p-10 rounded-3xl border border-dashed border-border text-center space-y-2">
          <Camera className="h-9 w-9 text-muted-foreground mx-auto opacity-40" />
          <p className="text-xs font-bold text-foreground">Aún no tienes alumnos activos</p>
          <p className="text-[11px] text-muted-foreground">
            Cuando tengas alumnos con controles aprobados podrás comparar su evolución fotográfica.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Alumno
              </span>
              <select
                value={alumnoId}
                onChange={(evento) => setAlumnoId(evento.target.value)}
                className="w-full min-h-11 px-3 rounded-xl bg-background border border-border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary"
              >
                {alumnos.map((alumno) => (
                  <option key={alumno.usuarioId} value={alumno.usuarioId}>
                    {nombreAlumno(alumno)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Toma A (antes)
              </span>
              <select
                value={controlAId}
                onChange={(evento) => setControlAId(evento.target.value)}
                disabled={cargandoEvolucion || controles.length === 0}
                className="w-full min-h-11 px-3 rounded-xl bg-background border border-border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary disabled:opacity-50"
              >
                {controles.map((control) => (
                  <option key={control.id} value={control.id} disabled={control.id === controlBId}>
                    {`${formatFechaCalendario(control.fechaEvaluacion) ?? control.fechaEvaluacion} · ${control.pesoKg} kg`}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Toma B (después)
              </span>
              <select
                value={controlBId}
                onChange={(evento) => setControlBId(evento.target.value)}
                disabled={cargandoEvolucion || controles.length === 0}
                className="w-full min-h-11 px-3 rounded-xl bg-background border border-border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary disabled:opacity-50"
              >
                {controles.map((control) => (
                  <option key={control.id} value={control.id} disabled={control.id === controlAId}>
                    {`${formatFechaCalendario(control.fechaEvaluacion) ?? control.fechaEvaluacion} · ${control.pesoKg} kg`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {cargandoEvolucion ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
            </div>
          ) : errorEvolucion ? (
            <div role="alert" className="p-6 rounded-3xl bg-destructive/10 border border-destructive/30 text-center space-y-3">
              <AlertCircle className="h-7 w-7 text-destructive mx-auto" />
              <p className="text-xs text-muted-foreground">{errorEvolucion}</p>
              <button
                type="button"
                onClick={() => cargarEvolucion(alumnoId)}
                className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : controles.length < 2 ? (
            <div className="p-8 rounded-3xl border border-dashed border-border text-center space-y-2">
              <Camera className="h-9 w-9 text-muted-foreground mx-auto opacity-40" />
              <p className="text-xs font-bold text-foreground">
                {alumnoSeleccionado
                  ? `${nombreAlumno(alumnoSeleccionado)} no tiene dos controles aprobados`
                  : 'Este alumno no tiene dos controles aprobados'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                La comparativa necesita al menos dos evaluaciones aprobadas en fechas distintas.
              </p>
            </div>
          ) : angulosDisponibles.length === 0 ? (
            <div className="p-8 rounded-3xl border border-dashed border-border text-center space-y-2">
              <Camera className="h-9 w-9 text-muted-foreground mx-auto opacity-40" />
              <p className="text-xs font-bold text-foreground">
                Ninguna perspectiva coincide en las dos fechas
              </p>
              <p className="text-[11px] text-muted-foreground">
                Foto no disponible para esta fecha. Prueba con otras tomas o pide al alumno nuevas
                fotografías de progreso.
              </p>
            </div>
          ) : comparativa ? (
            <ComparadorFotos
              comparativa={comparativa}
              angulo={angulo}
              onCambiarAngulo={setAngulo}
              angulosDisponibles={angulosDisponibles}
              cargando={cargandoComparativa}
              error={errorComparativa}
              onReintentar={() => setReintento((n) => n + 1)}
            />
          ) : (
            <div className="py-12 flex items-center justify-center">
              {cargandoComparativa ? (
                <Loader2 className="h-6 w-6 text-primary animate-spin" />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {errorComparativa ?? 'Elige dos fechas distintas para comparar.'}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
