// @vitest-environment jsdom
/**
 * UX-13 · FranjaAtencionDashboard (Contrato F1–F5).
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardComandoDTO } from '@guachafit/shared';
import { FranjaAtencionDashboard } from './FranjaAtencionDashboard';

function fixtureDashboard(overrides?: {
  kpisMacro?: Partial<DashboardComandoDTO['kpisMacro']>;
  bandejasRapidas?: Partial<DashboardComandoDTO['bandejasRapidas']>;
}): DashboardComandoDTO {
  return {
    kpisMacro: {
      alumnosActivos: 38,
      capacidadMaxima: 50,
      porcentajeOcupacion: '76.00',
      cobranzaMesUsd: '1900.00',
      metaCobranzaMesUsd: '2500.00',
      porcentajeCobranza: '76.00',
      tasaAdherenciaSemanal: '84.50',
      alumnosEnRiesgoDeportivo: 4,
      alumnosEnMoraFinanciera: 2,
      alumnosEnRiesgo: 4,
      ...overrides?.kpisMacro,
    },
    bandejasRapidas: {
      pagosPorConciliar: 3,
      checkinsAntropometricosPendientes: 2,
      alumnosEnMora: [
        {
          alumnoId: 'perfil-mora-1',
          nombre: 'Carla Ruiz',
          cuotaId: 'c1',
          saldoPendienteUsd: '1250.00',
          diasVencido: 5,
        },
      ],
      alumnosInactivosEntrenamiento: [
        {
          alumnoId: 'perfil-inac-1',
          nombre: 'Luis Prado',
          diasSinEntrenar: 6,
        },
      ],
      ...overrides?.bandejasRapidas,
    },
  };
}

describe('FranjaAtencionDashboard (UX-13)', () => {
  afterEach(() => {
    cleanup();
  });

  it('F1 · Encabezado: hay un heading de nivel 2 con nombre Requiere tu atención, con datos y sin ellos', () => {
    const { unmount } = render(
      <MemoryRouter>
        <FranjaAtencionDashboard dashboard={fixtureDashboard()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 2, name: /Requiere tu atención/i })).toBeTruthy();
    unmount();

    render(
      <MemoryRouter>
        <FranjaAtencionDashboard dashboard={null} />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 2, name: /Requiere tu atención/i })).toBeTruthy();
  });

  it('F2 · Con datos: 4 enlaces con etiqueta, cifra y acción en el nombre accesible, y sus href', () => {
    render(
      <MemoryRouter>
        <FranjaAtencionDashboard dashboard={fixtureDashboard()} />
      </MemoryRouter>
    );

    const enlaces = screen.getAllByRole('link');
    expect(enlaces).toHaveLength(4);

    // 1. Pagos por revisar
    const enlacePagos = screen.getByRole('link', {
      name: (name) =>
        /Pagos por revisar/i.test(name) &&
        /3 pendientes/i.test(name) &&
        /Revisar pagos/i.test(name),
    });
    expect(enlacePagos.getAttribute('href')).toBe('/coach/conciliacion');
    expect(screen.getByText('3 pendientes')).toBeTruthy();

    // 2. Evaluaciones por revisar
    const enlaceEval = screen.getByRole('link', {
      name: (name) =>
        /Evaluaciones por revisar/i.test(name) &&
        /2 por validar/i.test(name) &&
        /Revisar evaluaciones/i.test(name),
    });
    expect(enlaceEval.getAttribute('href')).toBe('/coach/antropometria');
    expect(screen.getByText('2 por validar')).toBeTruthy();

    // 3. En riesgo deportivo
    const enlaceRiesgo = screen.getByRole('link', {
      name: (name) =>
        /En riesgo deportivo/i.test(name) &&
        /4 alumnos/i.test(name) &&
        /Ver monitor/i.test(name),
    });
    expect(enlaceRiesgo.getAttribute('href')).toBe('/coach/monitor-adherencia');
    expect(screen.getByText('4 alumnos')).toBeTruthy();

    // 4. En mora
    const enlaceMora = screen.getByRole('link', {
      name: (name) =>
        /En mora/i.test(name) &&
        /2 alumnos/i.test(name) &&
        /Cobrar/i.test(name),
    });
    expect(enlaceMora.getAttribute('href')).toBe('/coach/cartera?pestana=mora');
    expect(screen.getByText('2 alumnos')).toBeTruthy();
  });

  it('F3 · Sin datos (dashboard: null): 4 enlaces con mismos href, cifra —, y sin texto que cumpla /\\d+\\s+(pendientes|por validar|alumnos?)/', () => {
    render(
      <MemoryRouter>
        <FranjaAtencionDashboard dashboard={null} />
      </MemoryRouter>
    );

    const enlaces = screen.getAllByRole('link');
    expect(enlaces).toHaveLength(4);
    const hrefs = enlaces.map((e) => e.getAttribute('href'));
    expect(hrefs).toContain('/coach/conciliacion');
    expect(hrefs).toContain('/coach/antropometria');
    expect(hrefs).toContain('/coach/monitor-adherencia');
    expect(hrefs).toContain('/coach/cartera?pestana=mora');

    const guiones = screen.getAllByText('—');
    expect(guiones.length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText(/\d+\s+(pendientes|por validar|alumnos?)/)).toBeNull();
  });

  it('F4 · Ceros y singular reales: con pagosPorConciliar: 0 y alumnosEnRiesgoDeportivo: 1 se ven 0 pendientes y 1 alumno', () => {
    const dashboardCeroSingular = fixtureDashboard({
      bandejasRapidas: {
        pagosPorConciliar: 0,
      },
      kpisMacro: {
        alumnosEnRiesgoDeportivo: 1,
      },
    });

    render(
      <MemoryRouter>
        <FranjaAtencionDashboard dashboard={dashboardCeroSingular} />
      </MemoryRouter>
    );

    expect(screen.getByText('0 pendientes')).toBeTruthy();
    expect(screen.getByText('1 alumno')).toBeTruthy();
  });

  it('F5 · Táctil: el className de cada enlace contiene min-h-11', () => {
    render(
      <MemoryRouter>
        <FranjaAtencionDashboard dashboard={fixtureDashboard()} />
      </MemoryRouter>
    );

    const enlaces = screen.getAllByRole('link');
    expect(enlaces).toHaveLength(4);
    for (const enlace of enlaces) {
      expect(enlace.className).toContain('min-h-11');
    }
  });
});
