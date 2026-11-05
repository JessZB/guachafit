// @vitest-environment happy-dom
/**
 * Lote E5 (RF-001) · contrato C2: componente `ModoFoco` (foco de la serie actual, jsdom).
 *
 * Fase roja: el componente `./ModoFoco` aún no existe; este spec fija el contrato:
 * progreso (`textoProgresoFoco`), nombre y prescripción compacta del ejercicio actual,
 * series restantes, `renderSerie` UNA vez con la posición actual, aviso "Siguiente:",
 * botón "Ver entrenamiento completo" y tipografía conforme a §6.12 (sin 10/11 px,
 * ningún título por encima de `font-bold`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EstadoSesion,
  type EjercicioSesionDetalleDTO,
  type SerieRegistroDetalleDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { textoPrescripcionCompacta } from '../../lib/sesion-vista';
import { ModoFoco } from './ModoFoco';

function serie(parcial: Partial<SerieRegistroDetalleDTO> = {}): SerieRegistroDetalleDTO {
  return {
    id: 's-1',
    ejercicioSesionId: 'es-1',
    numeroSerie: 1,
    repsObjetivo: 10,
    repsLogradas: null,
    pesoKg: null,
    pesoPrescritoKg: null,
    rpe: null,
    descansoSegundos: 90,
    completada: false,
    ...parcial,
  };
}

function ejercicio(
  id: string,
  nombre: string,
  series: SerieRegistroDetalleDTO[],
  orden: number
): EjercicioSesionDetalleDTO {
  return {
    id,
    sesionId: 'sesion-1',
    ejercicioId: `ej-${id}`,
    orden,
    ejercicio: {
      id: `ej-${id}`,
      nombre,
      grupoMuscular: 'General',
      activo: true,
      createdAtUtc: '2026-10-01T00:00:00.000Z',
    },
    series,
  };
}

/** 2 ejercicios: "Press de banca" (3 series, 60 kg) y "Remo con barra" (1 serie). */
const SESION: SesionEntrenamientoDetalleDTO = {
  id: 'sesion-1',
  alumnoId: 'alumno-1',
  fechaProgramada: '2026-10-11',
  timezoneCliente: 'America/Caracas',
  estado: EstadoSesion.EN_PROGRESO,
  porcentajeCumplimiento: '0.00',
  ejercicios: [
    ejercicio(
      'es-1',
      'Press de banca',
      [
        serie({ id: 'es-1-s1', ejercicioSesionId: 'es-1', numeroSerie: 1, pesoPrescritoKg: '60.00' }),
        serie({ id: 'es-1-s2', ejercicioSesionId: 'es-1', numeroSerie: 2, pesoPrescritoKg: '60.00' }),
        serie({ id: 'es-1-s3', ejercicioSesionId: 'es-1', numeroSerie: 3, pesoPrescritoKg: '60.00' }),
      ],
      1
    ),
    ejercicio(
      'es-2',
      'Remo con barra',
      [serie({ id: 'es-2-s1', ejercicioSesionId: 'es-2', numeroSerie: 1, repsObjetivo: 12 })],
      2
    ),
  ],
  createdAtUtc: '2026-10-01T00:00:00.000Z',
  updatedAtUtc: '2026-10-01T00:00:00.000Z',
};

/** Un solo ejercicio: no hay ningún "siguiente" posible. */
const SESION_SIN_SIGUIENTE: SesionEntrenamientoDetalleDTO = {
  ...SESION,
  ejercicios: [SESION.ejercicios[0]],
};

/** Todo hecho: la posición de foco es null. */
const SESION_COMPLETA: SesionEntrenamientoDetalleDTO = {
  ...SESION,
  ejercicios: SESION.ejercicios.map((ejercicioSesion) => ({
    ...ejercicioSesion,
    series: ejercicioSesion.series.map((s) => ({ ...s, completada: true })),
  })),
};

const RPE_SUGERIDO = { 'es-1': '8.0' };

afterEach(() => {
  cleanup();
});

describe('ModoFoco · foco de la serie actual (C2)', () => {
  it('muestra el progreso, el nombre del ejercicio actual, su prescripción y las series restantes', () => {
    render(
      <ModoFoco
        sesion={SESION}
        posicion={{ ejercicioIndex: 0, serieIndex: 0 }}
        unidadPeso="kg"
        rpeSugeridoPorEjercicio={RPE_SUGERIDO}
        renderSerie={() => <div data-testid="serie-actual" />}
        onVerListaCompleta={vi.fn()}
      />
    );

    expect(screen.getByText('Ejercicio 1 de 2 · Serie 1 de 3')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Press de banca' })).toBeTruthy();
    expect(
      screen.getByText(textoPrescripcionCompacta(SESION.ejercicios[0], 'kg', '8.0'))
    ).toBeTruthy();
    expect(screen.getByText('Quedan 3 series de este ejercicio')).toBeTruthy();
  });

  // Lote E5 · validación (H3): el avance del foco se anuncia en una región viva.
  it('anuncia el avance en una región aria-live="polite" con progreso y nombre; al cambiar de posición, su texto cambia', () => {
    const { container, rerender } = render(
      <ModoFoco
        sesion={SESION}
        posicion={{ ejercicioIndex: 0, serieIndex: 0 }}
        unidadPeso="kg"
        rpeSugeridoPorEjercicio={RPE_SUGERIDO}
        renderSerie={() => null}
        onVerListaCompleta={vi.fn()}
      />
    );

    const region = container.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    const textoAntes = region?.textContent ?? '';
    expect(textoAntes).toContain('Ejercicio 1 de 2 · Serie 1 de 3');
    expect(textoAntes).toContain('Press de banca');

    rerender(
      <ModoFoco
        sesion={SESION}
        posicion={{ ejercicioIndex: 1, serieIndex: 0 }}
        unidadPeso="kg"
        renderSerie={() => null}
        onVerListaCompleta={vi.fn()}
      />
    );

    const regionTras = container.querySelector('[aria-live="polite"]');
    expect(regionTras).not.toBeNull();
    const textoDespues = regionTras?.textContent ?? '';
    expect(textoDespues).not.toBe(textoAntes);
    expect(textoDespues).toContain('Ejercicio 2 de 2 · Serie 1 de 1');
    expect(textoDespues).toContain('Remo con barra');
  });

  it('llama a renderSerie una sola vez con la posición actual y pinta lo que devuelve', () => {
    const renderSerie = vi.fn(() => <div data-testid="serie-actual" />);
    render(
      <ModoFoco
        sesion={SESION}
        posicion={{ ejercicioIndex: 0, serieIndex: 1 }}
        unidadPeso="kg"
        renderSerie={renderSerie}
        onVerListaCompleta={vi.fn()}
      />
    );

    expect(renderSerie).toHaveBeenCalledTimes(1);
    expect(renderSerie).toHaveBeenCalledWith(0, 1);
    expect(screen.getByTestId('serie-actual')).toBeTruthy();
  });

  it('con siguiente ejercicio pendiente muestra un texto que empieza por "Siguiente:" con su nombre y prescripción', () => {
    render(
      <ModoFoco
        sesion={SESION}
        posicion={{ ejercicioIndex: 0, serieIndex: 0 }}
        unidadPeso="kg"
        rpeSugeridoPorEjercicio={RPE_SUGERIDO}
        renderSerie={() => null}
        onVerListaCompleta={vi.fn()}
      />
    );

    // El aviso puede vivir en un solo nodo o repartido en spans: se busca el bloque que lo abre.
    const aviso = screen.getByText((contenido) => contenido.startsWith('Siguiente:'));
    const bloque = aviso.closest('p, div, li, section') ?? aviso;
    expect(bloque.textContent).toContain('Remo con barra');
    expect(bloque.textContent).toContain(textoPrescripcionCompacta(SESION.ejercicios[1], 'kg', null));
  });

  it('sin siguiente ejercicio pendiente no aparece "Siguiente:"', () => {
    render(
      <ModoFoco
        sesion={SESION_SIN_SIGUIENTE}
        posicion={{ ejercicioIndex: 0, serieIndex: 0 }}
        unidadPeso="kg"
        renderSerie={() => null}
        onVerListaCompleta={vi.fn()}
      />
    );

    expect(screen.queryByText((contenido) => contenido.startsWith('Siguiente:'))).toBeNull();
  });

  it('el botón "Ver entrenamiento completo" llama a onVerListaCompleta', () => {
    const onVerListaCompleta = vi.fn();
    render(
      <ModoFoco
        sesion={SESION}
        posicion={{ ejercicioIndex: 0, serieIndex: 0 }}
        unidadPeso="kg"
        renderSerie={() => null}
        onVerListaCompleta={onVerListaCompleta}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ver entrenamiento completo' }));

    expect(onVerListaCompleta).toHaveBeenCalledTimes(1);
  });

  it('con posicion null muestra "Completaste todas las series", no llama a renderSerie y mantiene el botón de lista', () => {
    const renderSerie = vi.fn(() => <div data-testid="serie-actual" />);
    render(
      <ModoFoco
        sesion={SESION_COMPLETA}
        posicion={null}
        unidadPeso="kg"
        renderSerie={renderSerie}
        onVerListaCompleta={vi.fn()}
      />
    );

    expect(screen.getByText('Completaste todas las series')).toBeTruthy();
    expect(renderSerie).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Ver entrenamiento completo' })).toBeTruthy();
  });

  it('ningún elemento usa text-[11px] ni text-[10px], y ningún título pasa de font-bold (§6.12)', () => {
    const { container: conPosicion } = render(
      <ModoFoco
        sesion={SESION}
        posicion={{ ejercicioIndex: 0, serieIndex: 0 }}
        unidadPeso="kg"
        rpeSugeridoPorEjercicio={RPE_SUGERIDO}
        renderSerie={() => <div data-testid="serie-actual" />}
        onVerListaCompleta={vi.fn()}
      />
    );
    const { container: sinPosicion } = render(
      <ModoFoco
        sesion={SESION_COMPLETA}
        posicion={null}
        unidadPeso="kg"
        renderSerie={() => null}
        onVerListaCompleta={vi.fn()}
      />
    );

    for (const container of [conPosicion, sinPosicion]) {
      const elementos = [container, ...Array.from(container.querySelectorAll('*'))];
      for (const elemento of elementos) {
        const clase = typeof elemento.className === 'string' ? elemento.className : '';
        expect(clase).not.toContain('text-[11px]');
        expect(clase).not.toContain('text-[10px]');
      }

      const titulos = Array.from(
        container.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')
      );
      for (const titulo of titulos) {
        const clase = typeof titulo.className === 'string' ? titulo.className : '';
        expect(clase).not.toContain('font-extrabold');
        expect(clase).not.toContain('font-black');
      }
    }
  });
});
