// @vitest-environment happy-dom
/**
 * Lote E8 (RF-001) · spec del componente presentacional `FilaSerieEdicion`.
 * Renderiza con props controladas y handlers `vi.fn()`; fija los contratos de
 * filtros al teclear/pegar, steppers, marcado, salidas, etiquetas, `soloLectura`,
 * "Iniciar serie", descanso real, errores inline y prescripción.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import type { SerieRegistroDetalleDTO } from '@guachafit/shared';
import { FilaSerieEdicion, type CampoSerieEditable } from './FilaSerieEdicion';
import { formatearPesoConUnidad, pasoPesoEnUnidad } from '../../lib/weight-unit';
import { formatearDeltaSegundos } from '../../lib/sesion-tiempos';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SERIE_BASE: SerieRegistroDetalleDTO = {
  id: 's-1',
  ejercicioSesionId: 'es-1',
  numeroSerie: 1,
  repsObjetivo: 10,
  repsLogradas: null,
  pesoKg: null,
  pesoPrescritoKg: '60.00',
  rpe: null,
  completada: false,
};

type Handlers = {
  onCambiar: ReturnType<typeof vi.fn<(campo: CampoSerieEditable, texto: string) => void>>;
  onPaso: ReturnType<typeof vi.fn<(campo: 'pesoKg' | 'repsLogradas', delta: number) => void>>;
  onSalirPeso: ReturnType<typeof vi.fn<() => void>>;
  onSalirReps: ReturnType<typeof vi.fn<() => void>>;
  onSalirRpe: ReturnType<typeof vi.fn<() => void>>;
  onMarcar: ReturnType<typeof vi.fn<() => void>>;
  onIniciar: ReturnType<typeof vi.fn<() => void>>;
};

function montar(parciales: Partial<Parameters<typeof FilaSerieEdicion>[0]> = {}): Handlers {
  const handlers: Handlers = {
    onCambiar: vi.fn<(campo: CampoSerieEditable, texto: string) => void>(),
    onPaso: vi.fn<(campo: 'pesoKg' | 'repsLogradas', delta: number) => void>(),
    onSalirPeso: vi.fn<() => void>(),
    onSalirReps: vi.fn<() => void>(),
    onSalirRpe: vi.fn<() => void>(),
    onMarcar: vi.fn<() => void>(),
    onIniciar: vi.fn<() => void>(),
  };
  render(
    <FilaSerieEdicion
      serie={SERIE_BASE}
      unidadPeso="kg"
      soloLectura={false}
      pesoMostrado=""
      repsMostradas=""
      rpeMostrado=""
      pesoPrescritoKg="60.00"
      descansoRealSegundos={null}
      errorSerie={null}
      {...handlers}
      {...parciales}
    />
  );
  return handlers;
}

function campoPeso(): HTMLInputElement {
  return screen.getByLabelText('Peso real en kg, serie 1') as HTMLInputElement;
}

function campoReps(): HTMLInputElement {
  return screen.getByLabelText('Repeticiones hechas, serie 1') as HTMLInputElement;
}

function campoRpe(): HTMLInputElement {
  return screen.getByLabelText('Esfuerzo de 1 a 10, serie 1') as HTMLInputElement;
}

describe('FilaSerieEdicion · peso', () => {
  it("escribir '60,5' llama a onCambiar('pesoKg', '60,5')", () => {
    const { onCambiar } = montar();
    fireEvent.change(campoPeso(), { target: { value: '60,5' } });
    expect(onCambiar).toHaveBeenCalledWith('pesoKg', '60,5');
  });

  it("escribir 'abc' no llama a onCambiar", () => {
    const { onCambiar } = montar();
    fireEvent.change(campoPeso(), { target: { value: 'abc' } });
    expect(onCambiar).not.toHaveBeenCalled();
  });

  it("escribir '1000' en kg no llama a onCambiar (tope 999 kg)", () => {
    const { onCambiar } = montar();
    fireEvent.change(campoPeso(), { target: { value: '1000' } });
    expect(onCambiar).not.toHaveBeenCalled();
  });

  it("pegar '60 kg' llama a onCambiar('pesoKg', '60') y cancela el evento", () => {
    const { onCambiar } = montar();
    const input = campoPeso();
    const evento = createEvent.paste(input, {
      clipboardData: { getData: () => '60 kg' },
    });
    fireEvent(input, evento);
    expect(onCambiar).toHaveBeenCalledWith('pesoKg', '60');
    expect(evento.defaultPrevented).toBe(true);
  });

  it("pegar '2x20' no llama a onCambiar ni cancela el evento", () => {
    const { onCambiar } = montar();
    const input = campoPeso();
    const evento = createEvent.paste(input, {
      clipboardData: { getData: () => '2x20' },
    });
    fireEvent(input, evento);
    expect(onCambiar).not.toHaveBeenCalled();
    expect(evento.defaultPrevented).toBe(false);
  });
});

describe('FilaSerieEdicion · repeticiones', () => {
  it("escribir '05' llama a onCambiar('repsLogradas', '5') sin el cero inicial", () => {
    const { onCambiar } = montar({ repsMostradas: '10' });
    fireEvent.change(campoReps(), { target: { value: '05' } });
    expect(onCambiar).toHaveBeenCalledWith('repsLogradas', '5');
  });

  it("escribir '201' no llama a onCambiar (tope 200)", () => {
    const { onCambiar } = montar({ repsMostradas: '10' });
    fireEvent.change(campoReps(), { target: { value: '201' } });
    expect(onCambiar).not.toHaveBeenCalled();
  });

  it("vaciar el campo llama a onCambiar('repsLogradas', '')", () => {
    const { onCambiar } = montar({ repsMostradas: '10' });
    fireEvent.change(campoReps(), { target: { value: '' } });
    expect(onCambiar).toHaveBeenCalledWith('repsLogradas', '');
  });
});

describe('FilaSerieEdicion · RPE', () => {
  it("escribir '8,5' llama a onCambiar('rpe', '8,5')", () => {
    const { onCambiar } = montar();
    fireEvent.change(campoRpe(), { target: { value: '8,5' } });
    expect(onCambiar).toHaveBeenCalledWith('rpe', '8,5');
  });

  it("escribir '11' no llama a onCambiar (fuera de 1-10)", () => {
    const { onCambiar } = montar();
    fireEvent.change(campoRpe(), { target: { value: '11' } });
    expect(onCambiar).not.toHaveBeenCalled();
  });
});

describe('FilaSerieEdicion · steppers, marcado y salidas', () => {
  it.each([
    ['Restar', 'pesoKg', -1],
    ['Sumar', 'pesoKg', 1],
  ])('el stepper %s de peso llama a onPaso(%s, %i)', (accion, campo, delta) => {
    const { onPaso } = montar();
    const paso = pasoPesoEnUnidad('kg');
    fireEvent.click(screen.getByRole('button', { name: `${accion} ${paso} kg` }));
    expect(onPaso).toHaveBeenCalledWith(campo as CampoSerieEditable, delta);
  });

  it.each([
    ['Restar 1 repetición', 'repsLogradas', -1],
    ['Sumar 1 repetición', 'repsLogradas', 1],
  ])("'%s' llama a onPaso('%s', %i)", (etiqueta, campo, delta) => {
    const { onPaso } = montar();
    fireEvent.click(screen.getByRole('button', { name: etiqueta }));
    expect(onPaso).toHaveBeenCalledWith(campo, delta);
  });

  it('el botón de marcar llama a onMarcar', () => {
    const { onMarcar } = montar();
    fireEvent.click(
      screen.getByRole('button', { name: 'Marcar serie 1 como completada' })
    );
    expect(onMarcar).toHaveBeenCalledTimes(1);
  });

  it('salir de cada campo llama a su onSalir*', () => {
    const { onSalirPeso, onSalirReps, onSalirRpe } = montar();
    fireEvent.blur(campoPeso());
    fireEvent.blur(campoReps());
    fireEvent.blur(campoRpe());
    expect(onSalirPeso).toHaveBeenCalledTimes(1);
    expect(onSalirReps).toHaveBeenCalledTimes(1);
    expect(onSalirRpe).toHaveBeenCalledTimes(1);
  });
});

describe('FilaSerieEdicion · etiquetas de paso (valor real de pasoPesoEnUnidad)', () => {
  it('en kg muestra Restar/Sumar 2.5 kg', () => {
    montar({ unidadPeso: 'kg' });
    const paso = pasoPesoEnUnidad('kg');
    expect(
      screen.getByRole('button', { name: `Restar ${paso} kg` })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: `Sumar ${paso} kg` })).toBeTruthy();
  });

  it('en lb muestra Restar/Sumar 5 lb', () => {
    montar({ unidadPeso: 'lb' });
    const paso = pasoPesoEnUnidad('lb');
    expect(
      screen.getByRole('button', { name: `Restar ${paso} lb` })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: `Sumar ${paso} lb` })).toBeTruthy();
  });
});

describe('FilaSerieEdicion · soloLectura', () => {
  it('deshabilita todo y oculta "Iniciar serie"', () => {
    montar({ soloLectura: true });
    expect((campoPeso() as HTMLInputElement).disabled).toBe(true);
    expect((campoReps() as HTMLInputElement).disabled).toBe(true);
    expect((campoRpe() as HTMLInputElement).disabled).toBe(true);
    for (const boton of screen.getAllByRole('button')) {
      expect((boton as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.queryByRole('button', { name: 'Iniciar serie' })).toBeNull();
  });
});

describe('FilaSerieEdicion · Iniciar serie', () => {
  it('pendiente sin marca muestra "Iniciar serie" y lo llama al pulsarlo', () => {
    const { onIniciar } = montar();
    const boton = screen.getByRole('button', { name: 'Iniciar serie' });
    fireEvent.click(boton);
    expect(onIniciar).toHaveBeenCalledTimes(1);
  });

  it('pendiente con marca muestra "Iniciada …" y no el botón', () => {
    montar({
      serie: { ...SERIE_BASE, timestampInicioUtc: '2026-10-11T10:00:00.000Z' },
    });
    expect(screen.queryByRole('button', { name: 'Iniciar serie' })).toBeNull();
    expect(screen.getByText(/Iniciada/)).toBeTruthy();
  });

  it('completada no muestra ni botón ni marca de inicio', () => {
    montar({
      serie: { ...SERIE_BASE, completada: true },
    });
    expect(screen.queryByRole('button', { name: 'Iniciar serie' })).toBeNull();
    expect(screen.queryByText(/Iniciada/)).toBeNull();
  });
});

describe('FilaSerieEdicion · descanso real', () => {
  it('completada con medición muestra "Descanso real: …"', () => {
    montar({
      serie: { ...SERIE_BASE, completada: true },
      descansoRealSegundos: 75,
    });
    expect(
      screen.getByText(`Descanso real: ${formatearDeltaSegundos(75)}`)
    ).toBeTruthy();
  });

  it('completada sin medición no muestra descanso real', () => {
    montar({
      serie: { ...SERIE_BASE, completada: true },
      descansoRealSegundos: null,
    });
    expect(screen.queryByText(/Descanso real:/)).toBeNull();
  });

  it('pendiente con medición no muestra descanso real', () => {
    montar({ descansoRealSegundos: 75 });
    expect(screen.queryByText(/Descanso real:/)).toBeNull();
  });
});

describe('FilaSerieEdicion · errores', () => {
  it('errorSerie se muestra en un role="alert"', () => {
    montar({ errorSerie: 'Peso inválido: corrige el valor' });
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('Peso inválido: corrige el valor');
  });

  it('sin errorSerie no hay role="alert"', () => {
    montar({ errorSerie: null });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('errorPeso, errorReps y errorRpe ponen aria-invalid en su campo', () => {
    montar({ errorPeso: 'mal', errorReps: 'mal', errorRpe: 'mal', errorSerie: 'mal' });
    expect(campoPeso().getAttribute('aria-invalid')).toBe('true');
    expect(campoReps().getAttribute('aria-invalid')).toBe('true');
    expect(campoRpe().getAttribute('aria-invalid')).toBe('true');
  });
});

describe('FilaSerieEdicion · plan y objetivo', () => {
  it('con pesoPrescritoKg muestra "Plan: …" en la unidad visible', () => {
    montar({ pesoPrescritoKg: '60.00', unidadPeso: 'kg' });
    expect(
      screen.getByText(`Plan: ${formatearPesoConUnidad('60.00', 'kg')}`)
    ).toBeTruthy();
  });

  it('sin pesoPrescritoKg no muestra "Plan:"', () => {
    montar({ pesoPrescritoKg: null });
    expect(screen.queryByText(/Plan:/)).toBeNull();
  });

  it('siempre muestra "Objetivo: N repeticiones"', () => {
    montar();
    expect(screen.getByText('Objetivo: 10 repeticiones')).toBeTruthy();
  });
});

describe('FilaSerieEdicion · tamaños de texto', () => {
  it('ningún elemento del árbol usa text-[11px] ni text-[10px]', () => {
    // H-01: con los textos secundarios visibles a la vez ("Iniciada …" en una
    // pendiente con marca y "Descanso real" en una completada con medición).
    const handlers: Handlers = {
      onCambiar: vi.fn<(campo: CampoSerieEditable, texto: string) => void>(),
      onPaso: vi.fn<(campo: 'pesoKg' | 'repsLogradas', delta: number) => void>(),
      onSalirPeso: vi.fn<() => void>(),
      onSalirReps: vi.fn<() => void>(),
      onSalirRpe: vi.fn<() => void>(),
      onMarcar: vi.fn<() => void>(),
      onIniciar: vi.fn<() => void>(),
    };
    const base = {
      unidadPeso: 'kg' as const,
      soloLectura: false,
      pesoMostrado: '',
      repsMostradas: '',
      rpeMostrado: '',
      pesoPrescritoKg: '60.00',
      errorSerie: null,
    };
    const { container } = render(
      <>
        <FilaSerieEdicion
          serie={{ ...SERIE_BASE, timestampInicioUtc: '2026-10-11T10:00:00.000Z' }}
          descansoRealSegundos={null}
          {...base}
          {...handlers}
        />
        <FilaSerieEdicion
          serie={{ ...SERIE_BASE, numeroSerie: 2, completada: true }}
          descansoRealSegundos={75}
          {...base}
          {...handlers}
        />
      </>
    );
    expect(screen.getByText(/Iniciada/)).toBeTruthy();
    expect(screen.getByText(/Descanso real:/)).toBeTruthy();

    const elementos = [container, ...Array.from(container.querySelectorAll('*'))];
    for (const elemento of elementos) {
      const clase = typeof elemento.className === 'string' ? elemento.className : '';
      expect(clase).not.toContain('text-[11px]');
      expect(clase).not.toContain('text-[10px]');
    }
  });
});
