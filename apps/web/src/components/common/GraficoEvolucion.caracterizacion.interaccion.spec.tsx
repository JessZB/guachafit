// @vitest-environment jsdom
/**
 * Prompt 82 (Ola 3, módulo `grafico-evolucion`): caracterización del comportamiento ACTUAL
 * de `GraficoEvolucion` sobre el código SIN TOCAR.
 *
 * Red directa previa: ninguna (verificado por grep en `apps/web/src`). Este spec fija:
 * render de series con doble eje, rangos, vacío total, rango insuficiente, métrica sin
 * mediciones, topes de métricas (3 activas / 2 unidades / mínimo 1) con su aviso, deltas,
 * tooltip y tabla alternativa.
 *
 * Montaje: directo, sin `QueryClientProvider` (el archivo no usa `useQuery` ni
 * `api-client`, R9). Consultas por rol, label o texto. Fechas relativas a `Date.now()`
 * para que los rangos (1M/6M/…) sean deterministas el día que se corra.
 * Aserciones planas de vitest (el proyecto no usa jest-dom).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  EstadoMedicion,
  Modalidad,
  OrigenAntropometria,
  type ControlAntropometricoDetalleDTO,
} from '@guachafit/shared';
import { GraficoEvolucion } from './GraficoEvolucion';

afterEach(cleanup);

const DIA_MS = 24 * 60 * 60 * 1000;
const fechaHace = (dias: number): string => {
  const d = new Date(Date.now() - dias * DIA_MS);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

function control(
  fechaEvaluacion: string,
  pesoKg: string,
  porcentajeGrasa: string | null,
  perimetros?: { cinturaCm?: string },
): ControlAntropometricoDetalleDTO {
  return {
    id: `ctrl-${fechaEvaluacion}`,
    alumnoId: 'a3333333-3333-4333-8333-333333333333',
    fechaEvaluacion,
    pesoKg,
    alturaCm: '178.00',
    porcentajeGrasa,
    perimetros: perimetros ?? null,
    pliegues: null,
    modalidad: Modalidad.REMOTO,
    origen: OrigenAntropometria.REMOTO_AUTOREPORTE,
    registradoPor: 'e1111111-1111-4111-8111-111111111111',
    estado: EstadoMedicion.APROBADO,
    fotos: [],
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString(),
  };
}

/** Tres controles: hace 200, 40 y 10 días (peso 77.70 → 75.10 → 74.50; grasa 17.20 → 15.90 → 14.80). */
const SERIE_TRES = [
  control(fechaHace(200), '77.70', '17.20', { cinturaCm: '85.00' }),
  control(fechaHace(40), '75.10', '15.90', { cinturaCm: '83.00' }),
  control(fechaHace(10), '74.50', '14.80', { cinturaCm: '81.00' }),
];

describe('GraficoEvolucion (caracterización)', () => {
  it('renderiza la sección con doble eje por defecto (peso + % grasa) y sus deltas', () => {
    render(<GraficoEvolucion evaluaciones={SERIE_TRES} />);

    expect(screen.getByRole('region', { name: 'Evolución corporal' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Evolución corporal' })).toBeTruthy();
    // Doble eje: una unidad a cada lado (eje + chip de leyenda).
    expect(screen.getAllByText('kg').length).toBeGreaterThan(0);
    expect(screen.getAllByText('%').length).toBeGreaterThan(0);
    // SVG accesible con resumen + chips activos.
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Gráfico de evolución/);
    expect(screen.getByRole('button', { name: /Peso/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: /% Grasa/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    // Delta neto del rango en la tarjeta de Peso (la tabla también lista el valor final).
    expect(screen.getByText('en el rango: -3.20 kg')).toBeTruthy();
    expect(screen.getAllByText('74.50 kg').length).toBeGreaterThan(0);
  });

  it('ofrece los cinco rangos con Todo activo por defecto y cambia el activo al pulsar', () => {
    render(<GraficoEvolucion evaluaciones={SERIE_TRES} />);

    const grupo = screen.getByRole('group', { name: 'Rango de fechas' });
    expect(
      within(grupo).getByRole('button', { name: 'Todo el historial' }).getAttribute('aria-pressed'),
    ).toBe('true');
    fireEvent.click(within(grupo).getByRole('button', { name: 'Últimos tres meses' }));
    expect(
      within(grupo)
        .getByRole('button', { name: 'Últimos tres meses' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      within(grupo).getByRole('button', { name: 'Todo el historial' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('con rango 1M (una sola medición) muestra el vacío honesto de mínimo dos', () => {
    render(<GraficoEvolucion evaluaciones={SERIE_TRES} />);

    fireEvent.click(screen.getByRole('button', { name: 'Último mes' }));
    expect(screen.getByText(/mínimo dos/)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('sin evaluaciones muestra el vacío honesto inicial y no grafica', () => {
    render(<GraficoEvolucion evaluaciones={[]} />);

    expect(screen.getByText(/Aún no hay mediciones aprobadas para graficar/)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('con una sola medición informa que falta una segunda en el rango', () => {
    render(<GraficoEvolucion evaluaciones={[SERIE_TRES[2]]} />);

    expect(screen.getByText(/mínimo dos/)).toBeTruthy();
  });

  it('sin mediciones de las métricas elegidas pide cambiar rango o métrica', () => {
    const soloPeso = SERIE_TRES.map((c) => ({ ...c, porcentajeGrasa: null, perimetros: null }));
    render(<GraficoEvolucion evaluaciones={soloPeso} metricasIniciales={['grasa']} />);

    expect(screen.getByText(/activa otra métrica/)).toBeTruthy();
  });

  it('rechaza la tercera unidad con aviso visible y sin cambiar las activas', () => {
    render(<GraficoEvolucion evaluaciones={SERIE_TRES} />);

    // Peso (kg) + % Grasa (%) ya usan las dos unidades: Cintura (cm) es la tercera.
    fireEvent.click(screen.getByRole('button', { name: /Cintura/ }));
    expect(screen.getByRole('status').textContent).toMatch(/dos unidades/);
    expect(screen.getByRole('button', { name: /Cintura/ }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('rechaza quitar la última métrica con aviso visible', () => {
    render(<GraficoEvolucion evaluaciones={SERIE_TRES} metricasIniciales={['peso']} />);

    fireEvent.click(screen.getByRole('button', { name: /Peso/ }));
    expect(screen.getByRole('status').textContent).toMatch(/al menos una métrica/);
    expect(screen.getByRole('button', { name: /Peso/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('rechaza la cuarta métrica con aviso visible', () => {
    render(
      <GraficoEvolucion
        evaluaciones={SERIE_TRES}
        metricasIniciales={['cintura', 'brazo', 'pecho']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Muslo/ }));
    expect(screen.getByRole('status').textContent).toMatch(/Máximo 3 métricas/);
    expect(screen.getByRole('button', { name: /Muslo/ }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('la métrica con una sola medición muestra "sin delta (una sola medición)" sin fabricar delta', () => {
    // Peso con 3 puntos (el gráfico sí puede dibujarse), grasa con 1 solo: su delta es honesto.
    const grasaUnaSola = [
      control(fechaHace(200), '77.70', null, { cinturaCm: '85.00' }),
      control(fechaHace(40), '75.10', null, { cinturaCm: '83.00' }),
      control(fechaHace(10), '74.50', '14.80', { cinturaCm: '81.00' }),
    ];
    render(<GraficoEvolucion evaluaciones={grasaUnaSola} />);

    expect(screen.getByRole('img')).toBeTruthy();
    expect(screen.getByText('sin delta (una sola medición)')).toBeTruthy();
  });

  it('el tooltip muestra la fecha y el valor de cada serie activa', () => {
    render(<GraficoEvolucion evaluaciones={SERIE_TRES} />);
    const grafico = screen.getByRole('img');
    const contenedor = grafico.parentElement as HTMLElement;

    fireEvent.pointerMove(contenedor, { clientX: 200 });

    const avisos = screen.getAllByRole('status');
    const tooltip = avisos.find((el) => el.tagName === 'DIV');
    expect(tooltip).toBeDefined();
    expect(tooltip?.textContent).toMatch(
      /septiembre|octubre|noviembre|diciembre|enero|febrero|marzo|abril|mayo|junio|julio|agosto/,
    );
    expect(tooltip?.textContent).toContain('77.70 kg');
    expect(tooltip?.textContent).toContain('17.20%');
  });

  it('la tabla alternativa lista fecha y valores con "—" donde no hay dato', () => {
    const conHueco = [
      control(fechaHace(40), '75.10', null),
      control(fechaHace(10), '74.50', '14.80'),
    ];
    render(<GraficoEvolucion evaluaciones={conHueco} />);
    fireEvent.click(screen.getByText('Ver datos en tabla'));

    expect(screen.getByRole('columnheader', { name: 'Fecha' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Peso (kg)' })).toBeTruthy();
    expect(screen.getAllByText('74.50 kg').length).toBeGreaterThan(0);
    // Grasa sin medición en la primera fecha: celda honesta con "—".
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('respeta metricasIniciales y rangoInicial al montar', () => {
    render(
      <GraficoEvolucion evaluaciones={SERIE_TRES} metricasIniciales={['peso']} rangoInicial="6M" />,
    );

    expect(screen.getByRole('button', { name: /Peso/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /% Grasa/ }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: 'Últimos seis meses' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('img')).toBeTruthy();
  });
});
