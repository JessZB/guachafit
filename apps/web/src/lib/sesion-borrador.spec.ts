import { describe, expect, it } from 'vitest';
import {
  EstadoSesion,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { combinarSeriesPendientesLocales } from './sesion-borrador';

describe('sesion-borrador · combinarSeriesPendientesLocales (puro)', () => {
  const SESION_ID = 'sesion-borrador-123';
  const ALUMNO_ID = 'alumno-456';

  const crearSesionBase = (): SesionEntrenamientoDetalleDTO => ({
    id: SESION_ID,
    alumnoId: ALUMNO_ID,
    bloqueId: 'bloque-1',
    fechaProgramada: '2026-11-04',
    timezoneCliente: 'America/Caracas',
    estado: EstadoSesion.EN_PROGRESO,
    porcentajeCumplimiento: '0.00',
    createdAtUtc: '2026-11-04T12:00:00.000Z',
    updatedAtUtc: '2026-11-04T12:00:00.000Z',
    ejercicios: [
      {
        id: 'ej-sesion-1',
        sesionId: SESION_ID,
        ejercicioId: 'ej-1',
        orden: 1,
        ejercicio: {
          id: 'ej-1',
          nombre: 'Sentadilla',
          grupoMuscular: 'Piernas',
          activo: true,
          createdAtUtc: '2026-11-01T00:00:00.000Z',
        },
        series: [
          {
            id: 'serie-1',
            ejercicioSesionId: 'ej-sesion-1',
            numeroSerie: 1,
            repsObjetivo: 10,
            repsLogradas: null,
            pesoKg: null,
            pesoPrescritoKg: '60.00',
            rpe: null,
            descansoSegundos: 90,
            completada: false,
          },
          {
            id: 'serie-2',
            ejercicioSesionId: 'ej-sesion-1',
            numeroSerie: 2,
            repsObjetivo: 10,
            repsLogradas: 10,
            pesoKg: '60.00',
            pesoPrescritoKg: '60.00',
            rpe: '8',
            descansoSegundos: 90,
            completada: true,
          },
        ],
      },
    ],
  });

  it('devuelve una copia y no muta los objetos recibidos', () => {
    const servidor = crearSesionBase();
    const local = crearSesionBase();
    local.ejercicios[0].series[0].pesoKg = '65.00';
    local.ejercicios[0].series[0].repsLogradas = 8;
    local.ejercicios[0].series[0].rpe = '9';

    const copiaServidorJson = JSON.stringify(servidor);
    const copiaLocalJson = JSON.stringify(local);

    const resultado = combinarSeriesPendientesLocales(servidor, local);

    expect(JSON.stringify(servidor)).toBe(copiaServidorJson);
    expect(JSON.stringify(local)).toBe(copiaLocalJson);
    expect(resultado).not.toBe(servidor);
  });

  it('devuelve réplica del servidor si local es null', () => {
    const servidor = crearSesionBase();
    const resultado = combinarSeriesPendientesLocales(servidor, null);
    expect(resultado).toEqual(servidor);
    expect(resultado).not.toBe(servidor);
  });

  it('devuelve réplica del servidor si el id de la sesión local difiere del servidor', () => {
    const servidor = crearSesionBase();
    const local = crearSesionBase();
    local.id = 'otra-sesion-distinta';
    local.ejercicios[0].series[0].pesoKg = '80.00';

    const resultado = combinarSeriesPendientesLocales(servidor, local);
    expect(resultado).toEqual(servidor);
    expect(resultado.ejercicios[0].series[0].pesoKg).toBeNull();
  });

  it('combina pesoKg, repsLogradas y rpe de series pendientes locales en series pendientes del servidor', () => {
    const servidor = crearSesionBase();
    const local = crearSesionBase();
    local.ejercicios[0].series[0].pesoKg = '62.50';
    local.ejercicios[0].series[0].repsLogradas = 8;
    local.ejercicios[0].series[0].rpe = '7.5';

    const resultado = combinarSeriesPendientesLocales(servidor, local);
    const serie1 = resultado.ejercicios[0].series[0];

    expect(serie1.pesoKg).toBe('62.50');
    expect(serie1.repsLogradas).toBe(8);
    expect(serie1.rpe).toBe('7.5');
    expect(serie1.completada).toBe(false);
  });

  it('valores locales vacíos (null, undefined o cadena vacía) no borran los datos del servidor', () => {
    const servidor = crearSesionBase();
    servidor.ejercicios[0].series[0].pesoKg = '55.00';
    servidor.ejercicios[0].series[0].repsLogradas = 10;
    servidor.ejercicios[0].series[0].rpe = '7';

    const local = crearSesionBase();
    local.ejercicios[0].series[0].pesoKg = '';
    local.ejercicios[0].series[0].repsLogradas = null;
    local.ejercicios[0].series[0].rpe = undefined as unknown as null;

    const resultado = combinarSeriesPendientesLocales(servidor, local);
    const serie1 = resultado.ejercicios[0].series[0];

    expect(serie1.pesoKg).toBe('55.00');
    expect(serie1.repsLogradas).toBe(10);
    expect(serie1.rpe).toBe('7');
  });

  it('gana el servidor si la serie está completada en el servidor (no se sobreescribe con local)', () => {
    const servidor = crearSesionBase();
    // serie-2 está completada con peso 60.00 y reps 10
    expect(servidor.ejercicios[0].series[1].completada).toBe(true);

    const local = crearSesionBase();
    local.ejercicios[0].series[1].pesoKg = '75.00';
    local.ejercicios[0].series[1].repsLogradas = 5;
    local.ejercicios[0].series[1].rpe = '10';

    const resultado = combinarSeriesPendientesLocales(servidor, local);
    const serie2 = resultado.ejercicios[0].series[1];

    expect(serie2.pesoKg).toBe('60.00');
    expect(serie2.repsLogradas).toBe(10);
    expect(serie2.rpe).toBe('8');
    expect(serie2.completada).toBe(true);
  });

  it('si la serie local tiene completada en true pero el servidor la tiene en false, no se toman sus datos de borrador', () => {
    const servidor = crearSesionBase();
    const local = crearSesionBase();
    local.ejercicios[0].series[0].completada = true;
    local.ejercicios[0].series[0].pesoKg = '99.00';

    const resultado = combinarSeriesPendientesLocales(servidor, local);
    expect(resultado.ejercicios[0].series[0].pesoKg).toBeNull();
  });

  it('series que no existen en el servidor no se añaden', () => {
    const servidor = crearSesionBase();
    const local = crearSesionBase();
    local.ejercicios[0].series.push({
      id: 'serie-fantasma-extra',
      ejercicioSesionId: 'ej-sesion-1',
      numeroSerie: 3,
      repsObjetivo: 10,
      repsLogradas: 10,
      pesoKg: '100.00',
      pesoPrescritoKg: '100.00',
      rpe: null,
      descansoSegundos: 90,
      completada: false,
    });

    const resultado = combinarSeriesPendientesLocales(servidor, local);
    expect(resultado.ejercicios[0].series).toHaveLength(2);
    expect(resultado.ejercicios[0].series.some((s: { id: string }) => s.id === 'serie-fantasma-extra')).toBe(false);
  });

  it('no modifica campos de sesión como estado, fechaProgramada o descansoSegundos de las series', () => {
    const servidor = crearSesionBase();
    const local = crearSesionBase();
    local.estado = EstadoSesion.COMPLETADA;
    local.ejercicios[0].series[0].descansoSegundos = 180;

    const resultado = combinarSeriesPendientesLocales(servidor, local);
    expect(resultado.estado).toBe(EstadoSesion.EN_PROGRESO);
    expect(resultado.ejercicios[0].series[0].descansoSegundos).toBe(90);
  });
});
