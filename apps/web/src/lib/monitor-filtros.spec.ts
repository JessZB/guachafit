import { describe, it, expect } from 'vitest';
import { SemaforoAdherencia, type MonitorAdherenciaSemanalDTO } from '@guachafit/shared';
import {
  normalizarTextoBusqueda,
  coincideFiltroSemaforo,
  filtrarMonitorAlumnos,
  hayFiltroMonitorActivo,
  aParametroSemaforoMonitor,
  calcularResumenMonitorAdherencia,
  type FiltroSemaforoMonitor,
} from './monitor-filtros';

function alumno(parcial: {
  nombreCompleto: string;
  tienePlanActivo?: boolean;
  sinPendientesSemana?: boolean;
  semaforoAdherencia?: SemaforoAdherencia;
}): MonitorAdherenciaSemanalDTO {
  return {
    alumnoId: parcial.nombreCompleto,
    alumnoPerfilId: `perfil-${parcial.nombreCompleto}`,
    nombreCompleto: parcial.nombreCompleto,
    sesionesPrescritas: 3,
    sesionesCompletadas: 1,
    porcentajeCumplimientoSemanal: '33.33',
    semaforoAdherencia: parcial.semaforoAdherencia ?? SemaforoAdherencia.ROJO,
    tienePlanActivo: parcial.tienePlanActivo ?? true,
    sinPendientesSemana: parcial.sinPendientesSemana ?? false,
    rachaDiasConsecutivos: 0,
    diasInactivo: 1,
    ultimaSesionUtc: null,
  };
}

describe('normalizarTextoBusqueda (WU19)', () => {
  it('pasa a minúsculas, quita acentos y colapsa espacios', () => {
    expect(normalizarTextoBusqueda('  María   GÓMEZ  ')).toBe('maria gomez');
    expect(normalizarTextoBusqueda('Andrés')).toBe('andres');
    expect(normalizarTextoBusqueda('Ñandú')).toBe('nandu');
  });

  it('tolera nulos, indefinidos y cadenas vacías', () => {
    expect(normalizarTextoBusqueda(null)).toBe('');
    expect(normalizarTextoBusqueda(undefined)).toBe('');
    expect(normalizarTextoBusqueda('   ')).toBe('');
  });
});

describe('coincideFiltroSemaforo (WU19: paridad con el resumen superior)', () => {
  const rojo = alumno({ nombreCompleto: 'Roberto', semaforoAdherencia: SemaforoAdherencia.ROJO });
  const amarillo = alumno({
    nombreCompleto: 'Mariana',
    semaforoAdherencia: SemaforoAdherencia.AMARILLO,
  });
  const verde = alumno({ nombreCompleto: 'Carlos', semaforoAdherencia: SemaforoAdherencia.VERDE });
  const sinPendientes = alumno({
    nombreCompleto: 'Elena',
    semaforoAdherencia: SemaforoAdherencia.ROJO,
    sinPendientesSemana: true,
  });
  const sinPlan = alumno({ nombreCompleto: 'Andrés', tienePlanActivo: false });

  it('todos acepta cualquier alumno', () => {
    for (const a of [rojo, amarillo, verde, sinPendientes, sinPlan]) {
      expect(coincideFiltroSemaforo(a, 'todos')).toBe(true);
    }
  });

  it('cada chip acepta solo su grupo', () => {
    expect(coincideFiltroSemaforo(rojo, 'rojo')).toBe(true);
    expect(coincideFiltroSemaforo(amarillo, 'rojo')).toBe(false);
    expect(coincideFiltroSemaforo(verde, 'rojo')).toBe(false);

    expect(coincideFiltroSemaforo(amarillo, 'amarillo')).toBe(true);
    expect(coincideFiltroSemaforo(rojo, 'amarillo')).toBe(false);

    expect(coincideFiltroSemaforo(verde, 'verde')).toBe(true);
    expect(coincideFiltroSemaforo(rojo, 'verde')).toBe(false);

    expect(coincideFiltroSemaforo(sinPlan, 'sin_plan')).toBe(true);
    expect(coincideFiltroSemaforo(rojo, 'sin_plan')).toBe(false);
  });

  it('un 0/0 sin bloques vencidos no cuenta como rojo (solo aparece en todos)', () => {
    expect(coincideFiltroSemaforo(sinPendientes, 'rojo')).toBe(false);
    expect(coincideFiltroSemaforo(sinPendientes, 'amarillo')).toBe(false);
    expect(coincideFiltroSemaforo(sinPendientes, 'verde')).toBe(false);
    expect(coincideFiltroSemaforo(sinPendientes, 'sin_plan')).toBe(false);
  });
});

describe('filtrarMonitorAlumnos (WU19: búsqueda + semáforo preservando el orden)', () => {
  const lista = [
    alumno({ nombreCompleto: 'Roberto Díaz', semaforoAdherencia: SemaforoAdherencia.ROJO }),
    alumno({ nombreCompleto: 'María Gómez', semaforoAdherencia: SemaforoAdherencia.AMARILLO }),
    alumno({ nombreCompleto: 'Carlos Mendoza', semaforoAdherencia: SemaforoAdherencia.VERDE }),
    alumno({ nombreCompleto: 'Andrés Silva', tienePlanActivo: false }),
  ];

  it('sin filtros devuelve una copia con el mismo orden', () => {
    const resultado = filtrarMonitorAlumnos(lista);
    expect(resultado.map((a) => a.nombreCompleto)).toEqual(lista.map((a) => a.nombreCompleto));
    expect(resultado).not.toBe(lista);
  });

  it('busca por nombre sin distinguir mayúsculas ni acentos', () => {
    expect(
      filtrarMonitorAlumnos(lista, { busqueda: 'maria gomez' }).map((a) => a.nombreCompleto)
    ).toEqual(['María Gómez']);
    expect(
      filtrarMonitorAlumnos(lista, { busqueda: 'DIAZ' }).map((a) => a.nombreCompleto)
    ).toEqual(['Roberto Díaz']);
    expect(
      filtrarMonitorAlumnos(lista, { busqueda: 'andres' }).map((a) => a.nombreCompleto)
    ).toEqual(['Andrés Silva']);
  });

  it('combina búsqueda y chip de semáforo', () => {
    expect(
      filtrarMonitorAlumnos(lista, { busqueda: 'o', filtroSemaforo: 'verde' }).map(
        (a) => a.nombreCompleto
      )
    ).toEqual(['Carlos Mendoza']);
    expect(filtrarMonitorAlumnos(lista, { busqueda: 'maria', filtroSemaforo: 'rojo' })).toEqual([]);
  });

  it('preserva el orden recibido al filtrar', () => {
    const resultado = filtrarMonitorAlumnos(lista, { filtroSemaforo: 'todos', busqueda: 'me' });
    expect(resultado.map((a) => a.nombreCompleto)).toEqual(['María Gómez', 'Carlos Mendoza']);
  });

  it('sin coincidencias devuelve lista vacía', () => {
    expect(filtrarMonitorAlumnos(lista, { busqueda: 'zzz' })).toEqual([]);
  });
});

describe('hayFiltroMonitorActivo (WU19)', () => {
  it('solo es true con búsqueda con contenido o chip distinto de todos', () => {
    expect(hayFiltroMonitorActivo()).toBe(false);
    expect(hayFiltroMonitorActivo({ busqueda: '   ', filtroSemaforo: 'todos' })).toBe(false);
    expect(hayFiltroMonitorActivo({ busqueda: 'ana' })).toBe(true);
    expect(hayFiltroMonitorActivo({ filtroSemaforo: 'verde' })).toBe(true);
    const chip: FiltroSemaforoMonitor = 'sin_plan';
    expect(hayFiltroMonitorActivo({ filtroSemaforo: chip })).toBe(true);
  });
});

describe('aParametroSemaforoMonitor (WU25a: chip de UI => parámetro del API)', () => {
  it('traduce sin_plan a sinPlan y deja los semáforos iguales', () => {
    expect(aParametroSemaforoMonitor('sin_plan')).toBe('sinPlan');
    expect(aParametroSemaforoMonitor('rojo')).toBe('rojo');
    expect(aParametroSemaforoMonitor('amarillo')).toBe('amarillo');
    expect(aParametroSemaforoMonitor('verde')).toBe('verde');
  });

  it('todos no viaja al servidor (null)', () => {
    expect(aParametroSemaforoMonitor('todos')).toBeNull();
  });
});

describe('calcularResumenMonitorAdherencia (WU25a: paridad con el resumen del servidor)', () => {
  it('cuenta la cartera completa con la regla D6 (rojo excluye sin pendientes)', () => {
    const resumen = calcularResumenMonitorAdherencia([
      alumno({ nombreCompleto: 'Roberto', semaforoAdherencia: SemaforoAdherencia.ROJO }),
      alumno({ nombreCompleto: 'Mariana', semaforoAdherencia: SemaforoAdherencia.AMARILLO }),
      alumno({ nombreCompleto: 'Carlos', semaforoAdherencia: SemaforoAdherencia.VERDE }),
      alumno({
        nombreCompleto: 'Elena',
        semaforoAdherencia: SemaforoAdherencia.ROJO,
        sinPendientesSemana: true,
      }),
      alumno({ nombreCompleto: 'Andrés', tienePlanActivo: false }),
    ]);

    expect(resumen).toEqual({
      rojo: 1,
      amarillo: 1,
      verde: 1,
      sinPlan: 1,
      sinPendientes: 1,
      total: 5,
    });
  });

  it('una cartera vacía produce contadores en cero', () => {
    expect(calcularResumenMonitorAdherencia([])).toEqual({
      rojo: 0,
      amarillo: 0,
      verde: 0,
      sinPlan: 0,
      sinPendientes: 0,
      total: 0,
    });
  });
});
