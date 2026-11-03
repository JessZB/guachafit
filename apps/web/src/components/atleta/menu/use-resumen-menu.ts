import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EstadoCuota,
  type ResumenFinancieroAlumnoDTO,
  type SemanaEntrenamientoProgresoDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../../lib/acceso-alumno';
import { buildDemoSemanaProgreso } from '../../../lib/entrenamiento-demo';
import type { ResumenParaBadge } from '../../../lib/estado-cuota';

/**
 * MEN-05: Saludo honesto con el primer nombre del alumno desde su perfil.
 * Si no hay perfil o nombre, muestra un "Hola" limpio sin nombres de correo ni emojis.
 */
export function saludoAlumnoDesdePerfil(nombres?: string | null): string {
  const primerNombre = (nombres ?? '').trim().split(/\s+/)[0] ?? '';
  return primerNombre ? `Hola, ${primerNombre}` : 'Hola';
}

export interface EstadoEntrenamientoHoy {
  texto: string;
  tono: 'warning' | 'neutral' | 'info' | 'success';
}

/**
 * MEN-02: Deriva el estado honesto del entrenamiento de hoy según bloqueo, carga, error o progreso.
 */
export function derivarEstadoEntrenamientoHoy(args: {
  bloqueo: BloqueoAlumno | null;
  cargandoSemana: boolean;
  errorSemana: boolean;
  semanaProgreso: SemanaEntrenamientoProgresoDTO | null;
}): EstadoEntrenamientoHoy {
  const { bloqueo, cargandoSemana, errorSemana, semanaProgreso } = args;
  if (bloqueo) {
    return { texto: 'Planificación bloqueada', tono: 'warning' };
  }
  if (cargandoSemana) {
    return { texto: 'Cargando entrenamiento…', tono: 'neutral' };
  }
  if (errorSemana || !semanaProgreso) {
    return { texto: 'Sin datos', tono: 'neutral' };
  }
  if (semanaProgreso.esDiaDescansoHoy) {
    return { texto: 'Día de descanso (recuperación activa)', tono: 'info' };
  }
  if (semanaProgreso.totalBloques === 0) {
    return { texto: 'Sin entrenamiento asignado', tono: 'neutral' };
  }
  const bloques = semanaProgreso.bloques ?? [];
  // Solo "Completado hoy" si el bloque sugerido para hoy está completado.
  const bloqueHoyCompletado = bloques.some(
    (b) =>
      b.esSugeridoHoy &&
      (b.completado ||
        (typeof b.estadoSesion === 'string' && b.estadoSesion.toLowerCase() === 'completada'))
  );
  if (bloqueHoyCompletado) {
    return { texto: 'Completado hoy', tono: 'success' };
  }
  // Semana entera completa sin bloque de hoy completado: no se afirma "Completado hoy".
  if (
    semanaProgreso.totalBloques > 0 &&
    semanaProgreso.bloquesCompletados >= semanaProgreso.totalBloques
  ) {
    return { texto: 'Semana completada', tono: 'success' };
  }
  const enProgreso = bloques.some(
    (b) =>
      b.esSugeridoHoy &&
      typeof b.estadoSesion === 'string' &&
      b.estadoSesion.toLowerCase() === 'en_progreso'
  );
  if (enProgreso) {
    return { texto: 'Entrenamiento en progreso', tono: 'info' };
  }
  return { texto: 'Listo para iniciar', tono: 'success' };
}

/**
 * MEN-01, MEN-02, MEN-03, MEN-05: Hook para el resumen de rutina semanal, racha, finanzas y bloqueo del menú.
 */
export function useResumenMenu(
  user: { id?: string } | null | undefined,
  isDemoMode: boolean
) {
  const [semanaProgreso, setSemanaProgreso] = useState<SemanaEntrenamientoProgresoDTO | null>(null);
  const [cargandoSemana, setCargandoSemana] = useState<boolean>(!isDemoMode);
  const [errorSemana, setErrorSemana] = useState<boolean>(false);
  const [sinConexionSemana, setSinConexionSemana] = useState<boolean>(false);
  const [rachaNoDisponible, setRachaNoDisponible] = useState<boolean>(false);
  const [resumenFinanciero, setResumenFinanciero] = useState<ResumenParaBadge | null>(null);
  const [bloqueo, setBloqueo] = useState<BloqueoAlumno | null>(null);

  const solicitudRef = useRef(0);
  const montadoRef = useRef(true);
  const resumenFinancieroRef = useRef(resumenFinanciero);
  resumenFinancieroRef.current = resumenFinanciero;
  const claveSesionRef = useRef<string | null>(null);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  const recargarSemana = useCallback(() => {
    const turno = ++solicitudRef.current;

    // RSK-01: al cambiar de usuario o de modo demo no se reutiliza el resumen financiero previo.
    const claveSesion = `${isDemoMode ? 'demo' : 'real'}:${user?.id ?? ''}`;
    if (claveSesionRef.current !== null && claveSesionRef.current !== claveSesion) {
      resumenFinancieroRef.current = null;
      setResumenFinanciero(null);
    }
    claveSesionRef.current = claveSesion;

    if (isDemoMode) {
      setSemanaProgreso(buildDemoSemanaProgreso());
      setCargandoSemana(false);
      setErrorSemana(false);
      setSinConexionSemana(false);
      setRachaNoDisponible(false);
      setBloqueo(null);
      setResumenFinanciero({
        cuotaMesActual: {
          id: 'cuota-demo-001',
          periodo: '2026-09',
          montoTotalUsd: '50.00',
          montoPagadoUsd: '20.00',
          saldoPendienteUsd: '30.00',
          estado: EstadoCuota.ABONADA_PARCIAL,
          fechaVencimiento: new Date(Date.now() + 86400000 * 5).toISOString(),
        },
        saldoPendienteTotalUsd: '30.00',
      });
      return;
    }

    setCargandoSemana(true);
    setErrorSemana(false);
    setSinConexionSemana(false);

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Caracas';
    apiClient<SemanaEntrenamientoProgresoDTO>(
      `/alumnos/me/rutina/semana-actual?timezone=${encodeURIComponent(tz)}`
    )
      .then((data) => {
        if (!montadoRef.current || turno !== solicitudRef.current) return;
        setSemanaProgreso(data ?? null);
        setRachaNoDisponible(false);
        setBloqueo(null);
        setCargandoSemana(false);
        setErrorSemana(false);
        setSinConexionSemana(false);
      })
      .catch((err) => {
        if (!montadoRef.current || turno !== solicitudRef.current) return;
        const bloqueoDetectado = resolverBloqueoAlumno(err);
        setBloqueo(bloqueoDetectado);
        setSemanaProgreso(null);
        setRachaNoDisponible(true);
        setCargandoSemana(false);
        setErrorSemana(bloqueoDetectado === null);
        setSinConexionSemana(typeof navigator !== 'undefined' && navigator.onLine === false);
      });

    if (user?.id && resumenFinancieroRef.current === null) {
      apiClient<ResumenFinancieroAlumnoDTO>(`/finanzas/clientes/${user.id}/historial`)
        .then((resumen) => {
          if (!montadoRef.current || turno !== solicitudRef.current) return;
          setResumenFinanciero(resumen ?? null);
        })
        .catch(() => {
          if (!montadoRef.current || turno !== solicitudRef.current) return;
          setResumenFinanciero(null);
        });
    }
  }, [isDemoMode, user?.id]);

  useEffect(() => {
    recargarSemana();
  }, [recargarSemana]);

  return {
    semanaProgreso,
    cargandoSemana,
    errorSemana,
    sinConexionSemana,
    rachaNoDisponible,
    resumenFinanciero,
    bloqueo,
    recargarSemana,
  };
}
