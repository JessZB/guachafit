import { describe, expect, it } from 'vitest';
import { EstadoSesion, MotivoOmision } from '@guachafit/shared';
import { crearMonitorAdherenciaDemo } from './demo-monitor-adherencia';
import { CATALOGO_DEMO } from './demo-plantillas';
import { sesionesDemoAlumno } from './demo-sesiones';
import { deltasEntreEjercicios, deltasEntreSeries, descansosRealesEntreEjercicios, descansosRealesEntreSeries, duracionesEjecucionSeries } from './sesion-tiempos';

const AHORA = new Date('2026-09-20T12:00:00.000Z');
const ALUMNOS_DEMO = ['al-001', 'al-002', 'al-003', 'al-004', 'al-005', 'al-006', 'al-007', 'al-008'];

function todosLosHistoriales(ahora: Date = AHORA) {
  return ALUMNOS_DEMO.flatMap((id) => sesionesDemoAlumno(id, ahora));
}

describe('sesionesDemoAlumno (WU15: fixtures demo de historial)', () => {
  it('acepta el id de perfil y el de usuario con idéntico historial', () => {
    for (const perfil of ALUMNOS_DEMO) {
      const usuario = `demo-u-${perfil.slice(-3)}`;
      expect(sesionesDemoAlumno(perfil, AHORA)).toEqual(sesionesDemoAlumno(usuario, AHORA));
    }
  });

  it('cada alumno demo tiene 2-3 sesiones, de la más reciente a la más antigua', () => {
    for (const id of ALUMNOS_DEMO) {
      const sesiones = sesionesDemoAlumno(id, AHORA);
      expect(sesiones.length).toBeGreaterThanOrEqual(2);
      expect(sesiones.length).toBeLessThanOrEqual(3);
      for (let i = 1; i < sesiones.length; i += 1) {
        expect(new Date(sesiones[i - 1].createdAtUtc).getTime()).toBeGreaterThanOrEqual(
          new Date(sesiones[i].createdAtUtc).getTime()
        );
      }
    }
  });

  it('la sesión más reciente coincide con `ultimaSesionUtc` del monitor demo', () => {
    for (const alumno of crearMonitorAdherenciaDemo(AHORA)) {
      const sesiones = sesionesDemoAlumno(alumno.alumnoId, AHORA);
      expect(sesiones.length).toBeGreaterThan(0);
      expect(sesiones[0].fechaInicioUtc).toBe(alumno.ultimaSesionUtc);
    }
  });

  it('un id desconocido cae al roster de al-001 (la ficha demo hidrata para cualquier id)', () => {
    expect(sesionesDemoAlumno('id-arbitrario', AHORA)).toEqual(sesionesDemoAlumno('al-001', AHORA));
  });

  it('recalcula los timestamps relativos a "ahora" en cada llamada', () => {
    const manana = new Date(AHORA.getTime() + 24 * 60 * 60 * 1000);
    const antes = sesionesDemoAlumno('al-001', AHORA)[0].fechaInicioUtc;
    const despues = sesionesDemoAlumno('al-001', manana)[0].fechaInicioUtc;
    expect(new Date(despues!).getTime() - new Date(antes!).getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe('sesionesDemoAlumno: contrato del DTO', () => {
  it('cada sesión respeta los campos y tipos de SesionEntrenamientoDetalleDTO', () => {
    for (const sesion of todosLosHistoriales()) {
      expect(sesion.id).toBeTruthy();
      expect(sesion.alumnoId).toMatch(/^demo-u-00[1-8]$/);
      expect(sesion.fechaProgramada).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(sesion.timezoneCliente).toBe('America/Caracas');
      expect(Object.values(EstadoSesion)).toContain(sesion.estado);
      expect(Number.isFinite(Number(sesion.porcentajeCumplimiento))).toBe(true);
      expect(sesion.volumenTotalKg).toMatch(/^\d+\.\d{2}$/);
      expect(Number.isNaN(new Date(sesion.createdAtUtc).getTime())).toBe(false);
      expect(Number.isNaN(new Date(sesion.updatedAtUtc).getTime())).toBe(false);
      if (sesion.estado === EstadoSesion.COMPLETADA) {
        expect(sesion.motivoOmision ?? null).toBeNull();
      }
      if (sesion.estado === EstadoSesion.OMITIDA) {
        expect(sesion.motivoOmision).not.toBeNull();
      }
    }
  });

  it('todas las sesiones son anteriores a "ahora"', () => {
    for (const sesion of todosLosHistoriales()) {
      expect(new Date(sesion.createdAtUtc).getTime()).toBeLessThan(AHORA.getTime());
    }
  });
});

describe('sesionesDemoAlumno: sesiones enriquecidas', () => {
  it('usa ejercicios del catálogo demo (sin ejercicios fantasma)', () => {
    const idsCatalogo = new Set(CATALOGO_DEMO.map((ejercicio) => ejercicio.id));
    for (const sesion of todosLosHistoriales()) {
      for (const ejercicio of sesion.ejercicios) {
        expect(idsCatalogo.has(ejercicio.ejercicioId)).toBe(true);
        expect(ejercicio.ejercicio?.id).toBe(ejercicio.ejercicioId);
        expect(ejercicio.ejercicio?.nombre).toBeTruthy();
      }
    }
  });

  it('las sesiones con series traen 2+ ejercicios y 3-4 series por ejercicio con todos los datos', () => {
    const sesionesConSeries = todosLosHistoriales().filter((sesion) => sesion.ejercicios.length > 0);
    expect(sesionesConSeries.length).toBeGreaterThanOrEqual(14);

    for (const sesion of sesionesConSeries) {
      expect(sesion.ejercicios.length).toBeGreaterThanOrEqual(2);
      expect(sesion.ejercicios.some((ejercicio) => Boolean(ejercicio.notasCoach))).toBe(true);

      for (const ejercicio of sesion.ejercicios) {
        expect(ejercicio.descansoPrescritoSegundos).toBeGreaterThan(0);
        expect(ejercicio.series.length).toBeGreaterThanOrEqual(3);
        expect(ejercicio.series.length).toBeLessThanOrEqual(4);

        for (const serie of ejercicio.series) {
          expect(serie.repsObjetivo).toBeGreaterThan(0);
          if (serie.pesoPrescritoKg != null) {
            expect(serie.pesoPrescritoKg).toMatch(/^\d+\.\d{2}$/);
          }
          if (!serie.completada) {
            expect(serie.repsLogradas).toBeNull();
            expect(serie.timestampCompletadaUtc).toBeNull();
            continue;
          }
          expect(typeof serie.repsLogradas).toBe('number');
          expect(serie.pesoKg).toMatch(/^\d+\.\d{2}$/);
          expect(serie.rpe).toMatch(/^\d+(\.\d)?$/);
          expect(serie.descansoSegundos).toBeGreaterThan(0);
          expect(Number.isNaN(new Date(serie.timestampCompletadaUtc!).getTime())).toBe(false);
        }
      }
    }
  });

  it('cubre estados variados: completadas y omitidas con motivo (descanso e incompleto)', () => {
    const sesiones = todosLosHistoriales();
    expect(sesiones.some((sesion) => sesion.estado === EstadoSesion.COMPLETADA)).toBe(true);

    const omitidas = sesiones.filter((sesion) => sesion.estado === EstadoSesion.OMITIDA);
    expect(omitidas.length).toBeGreaterThanOrEqual(3);
    expect(new Set(omitidas.map((sesion) => sesion.motivoOmision))).toEqual(
      new Set([MotivoOmision.DESCANSO, MotivoOmision.INCOMPLETO])
    );

    const descanso = omitidas.find((sesion) => sesion.motivoOmision === MotivoOmision.DESCANSO);
    expect(descanso?.esDiaDescansoOriginal).toBe(true);
    expect(descanso?.ejercicios).toEqual([]);
    expect(descanso?.fechaInicioUtc).toBeNull();
  });
});

describe('sesionesDemoAlumno: tiempos y volumen derivables', () => {
  it('las marcas de cada ejercicio van en orden cronológico', () => {
    for (const sesion of todosLosHistoriales()) {
      for (const ejercicio of sesion.ejercicios) {
        const marcas = ejercicio.series
          .filter((serie) => Boolean(serie.timestampCompletadaUtc))
          .map((serie) => new Date(serie.timestampCompletadaUtc!).getTime());
        for (let i = 1; i < marcas.length; i += 1) {
          expect(marcas[i]).toBeGreaterThanOrEqual(marcas[i - 1]);
        }
      }
    }
  });

  it('produce deltas reales legibles (ejemplo: primera sesión de al-001)', () => {
    const sesion = sesionesDemoAlumno('al-001', AHORA)[0];
    expect(deltasEntreSeries(sesion.ejercicios[0].series)).toEqual([null, 95, 105, 115]);
    expect(deltasEntreEjercicios(sesion.ejercicios)).toEqual([null, 335, 295]);
  });

  it('ningún delta derivado es negativo y hay suficientes para poblar la UI', () => {
    let deltasDerivados = 0;
    for (const sesion of todosLosHistoriales()) {
      for (const ejercicio of sesion.ejercicios) {
        for (const delta of deltasEntreSeries(ejercicio.series)) {
          if (delta !== null) {
            expect(delta).toBeGreaterThanOrEqual(0);
            deltasDerivados += 1;
          }
        }
      }
      for (const delta of deltasEntreEjercicios(sesion.ejercicios)) {
        if (delta !== null) {
          expect(delta).toBeGreaterThanOrEqual(0);
          deltasDerivados += 1;
        }
      }
    }
    expect(deltasDerivados).toBeGreaterThan(50);
  });

  it('el volumen declarado coincide con kg × reps de las series registradas', () => {
    for (const sesion of todosLosHistoriales()) {
      const esperado = sesion.ejercicios
        .flatMap((ejercicio) => ejercicio.series)
        .reduce((acumulado, serie) => {
          const peso = Number(serie.pesoKg ?? 0);
          const reps = serie.repsLogradas ?? 0;
          return Number.isFinite(peso) ? acumulado + peso * reps : acumulado;
        }, 0);
      expect(sesion.volumenTotalKg).toBe(esperado.toFixed(2));
    }
  });

  it('WU17: toda serie completada trae inicio real anterior a su completada; la pendiente no lo trae', () => {
    for (const sesion of todosLosHistoriales()) {
      for (const ejercicio of sesion.ejercicios) {
        for (const serie of ejercicio.series) {
          if (!serie.completada) {
            expect(serie.timestampInicioUtc ?? null).toBeNull();
            continue;
          }
          expect(Number.isNaN(new Date(serie.timestampInicioUtc!).getTime())).toBe(false);
          expect(new Date(serie.timestampInicioUtc!).getTime()).toBeLessThan(
            new Date(serie.timestampCompletadaUtc!).getTime()
          );
        }
      }
    }
  });

  it('WU17: deriva descanso real y ejecución de las fixtures (ejemplo: primera sesión de al-001)', () => {
    const sesion = sesionesDemoAlumno('al-001', AHORA)[0];
    const primero = sesion.ejercicios[0].series;

    expect(descansosRealesEntreSeries(primero)).toEqual([null, 65, 78, 91]);
    expect(duracionesEjecucionSeries(primero)).toEqual([36, 30, 27, 24]);
    expect(descansosRealesEntreEjercicios(sesion.ejercicios)).toEqual([null, 305, 250]);
  });

  it('WU17: todos los descansos reales derivados son medibles (>= 0) y abundan para la UI', () => {
    let restsReales = 0;
    let ejecuciones = 0;
    for (const sesion of todosLosHistoriales()) {
      for (const ejercicio of sesion.ejercicios) {
        for (const rest of descansosRealesEntreSeries(ejercicio.series)) {
          if (rest !== null) {
            expect(rest).toBeGreaterThanOrEqual(0);
            restsReales += 1;
          }
        }
        for (const ejecucion of duracionesEjecucionSeries(ejercicio.series)) {
          if (ejecucion !== null) {
            expect(ejecucion).toBeGreaterThan(0);
            ejecuciones += 1;
          }
        }
      }
      for (const rest of descansosRealesEntreEjercicios(sesion.ejercicios)) {
        if (rest !== null) {
          expect(rest).toBeGreaterThanOrEqual(0);
          restsReales += 1;
        }
      }
    }
    expect(restsReales).toBeGreaterThan(80);
    expect(ejecuciones).toBeGreaterThan(30);
  });
});
