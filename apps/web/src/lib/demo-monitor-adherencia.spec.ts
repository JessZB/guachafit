import { describe, expect, it } from 'vitest';
import { SemaforoAdherencia } from '@guachafit/shared';
import { crearMonitorAdherenciaDemo } from './demo-monitor-adherencia';
import { etiquetaMonitorAdherencia } from './adherencia';

const AHORA = new Date('2026-09-20T12:00:00.000Z');

describe('crearMonitorAdherenciaDemo (WU14: fixture demo del monitor de adherencia)', () => {
  it('devuelve un roster con ids únicos de usuario y perfil (enlace al expediente)', () => {
    const alumnos = crearMonitorAdherenciaDemo(AHORA);
    expect(alumnos.length).toBe(8);
    expect(new Set(alumnos.map((a) => a.alumnoId)).size).toBe(alumnos.length);
    expect(new Set(alumnos.map((a) => a.alumnoPerfilId)).size).toBe(alumnos.length);
    for (const alumno of alumnos) {
      expect(alumno.alumnoPerfilId.trim().length).toBeGreaterThan(0);
      expect(alumno.nombreCompleto.trim().length).toBeGreaterThan(0);
    }
  });

  it('cubre los tres semáforos y los dos estados neutrales (sin plan / sin pendientes)', () => {
    const alumnos = crearMonitorAdherenciaDemo(AHORA);
    const semaforos = new Set(
      alumnos
        .filter((a) => a.tienePlanActivo && !a.sinPendientesSemana)
        .map((a) => a.semaforoAdherencia)
    );
    expect(semaforos).toEqual(
      new Set([SemaforoAdherencia.VERDE, SemaforoAdherencia.AMARILLO, SemaforoAdherencia.ROJO])
    );

    const etiquetas = alumnos.map((a) => etiquetaMonitorAdherencia(a).texto);
    expect(etiquetas.filter((texto) => texto === 'Sin plan')).toHaveLength(1);
    expect(etiquetas.filter((texto) => texto === 'Al día — sin pendientes')).toHaveLength(1);
    expect(etiquetas.filter((texto) => texto === 'Verde').length).toBeGreaterThanOrEqual(2);
  });

  it('las últimas sesiones son anteriores a "ahora" y el porcentaje es numérico', () => {
    for (const alumno of crearMonitorAdherenciaDemo(AHORA)) {
      expect(alumno.ultimaSesionUtc).toBeTruthy();
      expect(new Date(alumno.ultimaSesionUtc!).getTime()).toBeLessThan(AHORA.getTime());
      expect(alumno.diasInactivo).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(Number(alumno.porcentajeCumplimientoSemanal))).toBe(true);
    }
  });

  it('el porcentaje declarado coincide con completadas/prescritas (semántica de la API)', () => {
    for (const alumno of crearMonitorAdherenciaDemo(AHORA)) {
      if (alumno.sesionesPrescritas > 0) {
        expect(alumno.porcentajeCumplimientoSemanal).toBe(
          ((alumno.sesionesCompletadas / alumno.sesionesPrescritas) * 100).toFixed(2)
        );
      } else {
        expect(alumno.porcentajeCumplimientoSemanal).toBe('0.00');
      }
    }
  });

  it('coherencia plan/pendientes: sin plan no prescribe; con pendientes sí prescribe', () => {
    for (const alumno of crearMonitorAdherenciaDemo(AHORA)) {
      if (!alumno.tienePlanActivo) {
        expect(alumno.sesionesPrescritas).toBe(0);
        expect(alumno.sinPendientesSemana).toBe(false);
      } else if (alumno.sinPendientesSemana) {
        expect(alumno.sesionesPrescritas).toBe(0);
      } else {
        expect(alumno.sesionesPrescritas).toBeGreaterThan(0);
      }
    }
  });

  it('recalcula las fechas en cada llamada (el monitor demo nunca queda viejo)', () => {
    const unDiaDespues = new Date(AHORA.getTime() + 24 * 60 * 60 * 1000);
    const primero = crearMonitorAdherenciaDemo(AHORA)[0].ultimaSesionUtc;
    const segundo = crearMonitorAdherenciaDemo(unDiaDespues)[0].ultimaSesionUtc;
    expect(segundo).not.toBe(primero);
    expect(new Date(segundo!).getTime()).toBeGreaterThan(new Date(primero!).getTime());
  });
});
