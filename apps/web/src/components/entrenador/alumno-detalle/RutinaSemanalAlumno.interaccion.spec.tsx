// @vitest-environment happy-dom
/**
 * 01 · Ficha del alumno (L1.8) · rutina semanal sin asignar.
 *
 * Contrato: el estado vacío incluye el botón de acción "Asignar rutina" dentro del mismo
 * bloque vacío (no solo en la cabecera de la sección). Los botones existentes de la cabecera
 * ("Cargar desde plantilla", "Editar rutina semanal") se conservan.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { BloqueDiaRutinaDTO } from '@guachafit/shared';
import { RutinaSemanalAlumno } from './RutinaSemanalAlumno';

afterEach(() => {
  cleanup();
});

const BLOQUE: BloqueDiaRutinaDTO = {
  diaId: 'd1',
  titulo: 'Día 1 (Lunes): Empuje',
  enfoque: 'Hipertrofia',
  ejercicios: [
    {
      id: 'ej-1',
      nombre: 'Press de banca',
      series: 4,
      reps: '8-10',
      peso: '60 kg',
      rpe: '8',
      descansoSegundos: 90,
    },
  ],
};

function renderRutina(bloques: BloqueDiaRutinaDTO[], archivado = false) {
  const onEditarRutina = vi.fn();
  const utils = render(
    <RutinaSemanalAlumno
      bloques={bloques}
      archivado={archivado}
      onCargarPlantilla={vi.fn()}
      onEditarRutina={onEditarRutina}
    />,
  );
  return { ...utils, onEditarRutina };
}

function ancestroComun(a: Element, b: Element): Element | null {
  let actual = a.parentElement;
  while (actual && !actual.contains(b)) actual = actual.parentElement;
  return actual;
}

describe('RutinaSemanalAlumno · L1.8 estado vacío', () => {
  it('incluye "Asignar rutina" dentro del bloque vacío, no solo en la cabecera', () => {
    renderRutina([]);

    const aviso = screen.getByText(/aún no tiene una rutina semanal activa/i);
    const asignar = screen.getByRole('button', { name: 'Asignar rutina' });

    const bloque = ancestroComun(aviso, asignar);
    expect(bloque).not.toBeNull();

    const cargarPlantilla = screen.getByRole('button', { name: 'Cargar desde plantilla' });
    expect(bloque?.contains(cargarPlantilla)).toBe(false);
  });
});

describe('RutinaSemanalAlumno · V1 rutina archivada', () => {
  it('con archivado: "Asignar rutina" y el botón de editar están disabled con aviso y no llaman', () => {
    const { onEditarRutina } = renderRutina([], true);

    const asignar = screen.getByRole('button', { name: 'Asignar rutina' });
    const editar = screen.getByRole('button', { name: 'Editar rutina semanal' });

    expect((asignar as HTMLButtonElement).disabled).toBe(true);
    expect((editar as HTMLButtonElement).disabled).toBe(true);
    expect(asignar.getAttribute('title')).toBe('Restaura al alumno para asignarle una rutina');
    expect(editar.getAttribute('title')).toBe('Restaura al alumno para asignarle una rutina');

    fireEvent.click(asignar);
    fireEvent.click(editar);
    expect(onEditarRutina).not.toHaveBeenCalled();
  });

  it('sin archivar: ambos están habilitados y "Asignar rutina" llama a onEditarRutina una vez', () => {
    const { onEditarRutina } = renderRutina([], false);

    const asignar = screen.getByRole('button', { name: 'Asignar rutina' });
    const editar = screen.getByRole('button', { name: 'Editar rutina semanal' });

    expect((asignar as HTMLButtonElement).disabled).toBe(false);
    expect((editar as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(asignar);
    expect(onEditarRutina).toHaveBeenCalledTimes(1);
  });
});

describe('RutinaSemanalAlumno · comportamiento existente', () => {
  it('con rutina asignada conserva la cabecera y el mensaje de vacío desaparece', () => {
    renderRutina([BLOQUE]);

    expect(screen.getByRole('heading', { name: 'Rutina Semanal Asignada' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cargar desde plantilla' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar rutina semanal' })).toBeTruthy();
    expect(screen.queryByText(/aún no tiene una rutina semanal activa/i)).toBeNull();
    expect(screen.getByText('Día 1 (Lunes): Empuje')).toBeTruthy();
    expect(screen.getByText('Press de banca')).toBeTruthy();
  });

  it('sin errorRutina no cambia nada: estado vacío sin alert', () => {
    renderRutina([]);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/aún no tiene una rutina semanal activa/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Asignar rutina' })).toBeTruthy();
  });
});

describe('RutinaSemanalAlumno · L5.8 error de carga con reintento', () => {
  it('muestra el alert con el mensaje, el botón Reintentar y oculta el vacío', () => {
    const onReintentarRutina = vi.fn();
    render(
      <RutinaSemanalAlumno
        bloques={[]}
        archivado={false}
        onCargarPlantilla={vi.fn()}
        onEditarRutina={vi.fn()}
        errorRutina="No se pudo cargar la rutina semanal"
        onReintentarRutina={onReintentarRutina}
      />
    );

    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('No se pudo cargar la rutina semanal');
    expect(within(alerta).getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    expect(screen.queryByText(/aún no tiene una rutina semanal activa/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Asignar rutina' })).toBeNull();
  });

  it('Reintentar llama a onReintentarRutina una vez y no navega', () => {
    const onReintentarRutina = vi.fn();
    const onEditarRutina = vi.fn();
    render(
      <RutinaSemanalAlumno
        bloques={[]}
        archivado={false}
        onCargarPlantilla={vi.fn()}
        onEditarRutina={onEditarRutina}
        errorRutina="No se pudo cargar la rutina semanal"
        onReintentarRutina={onReintentarRutina}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onReintentarRutina).toHaveBeenCalledTimes(1);
    expect(onEditarRutina).not.toHaveBeenCalled();
  });
});
