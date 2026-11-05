// @vitest-environment jsdom
/**
 * UX-26 (Fase Roja / TDD) · Contratos de interacción y accesibilidad para ModalFinalizarSesion:
 * - ENT-02: Resumen honesto de series completadas y pendientes (role="status")
 * - ENT-09a: Rejilla 1-10 sin etiquetas inductoras ("Ideal", "Bajo", "Máximo")
 * - ENT-09b: Esfuerzo arranca en null (sin seleccionar / opcional) sin forzar RPE 8
 * - ENT-10: Botón principal con type="button" y jerarquía text-sm; unificación a "entrenador"
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { EstadoSesion } from '@guachafit/shared';
import { ModalFinalizarSesion } from './ModalFinalizarSesion';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function crearSesionMock(seriesConfig: boolean[][]): SesionEntrenamientoDetalleDTO {
  return {
    id: 'sesion-test',
    alumnoId: 'alumno-1',
    bloqueId: 'bloque-1',
    fechaProgramada: '2026-11-02',
    estado: EstadoSesion.EN_PROGRESO,
    fechaInicioUtc: '2026-11-02T10:00:00Z',
    fechaFinUtc: null,
    duracionMinutos: 45,
    notasAlumno: null,
    timezoneCliente: 'America/Caracas',
    porcentajeCumplimiento: '100%',
    createdAtUtc: '2026-11-02T10:00:00Z',
    updatedAtUtc: '2026-11-02T10:00:00Z',
    ejercicios: seriesConfig.map((series, ejIdx) => ({
      id: `es-${ejIdx + 1}`,
      sesionId: 'sesion-test',
      orden: ejIdx + 1,
      ejercicioId: `cat-${ejIdx + 1}`,
      ejercicio: {
        id: `cat-${ejIdx + 1}`,
        nombre: `Ejercicio ${ejIdx + 1}`,
        grupoMuscular: 'PECHO',
        patronMovimiento: 'EMPUJE_HORIZONTAL',
        esBilateral: true,
      } as any,
      series: series.map((completada, sIdx) => ({
        id: `s-${ejIdx + 1}-${sIdx + 1}`,
        ejercicioSesionId: `es-${ejIdx + 1}`,
        numeroSerie: sIdx + 1,
        repsObjetivo: 10,
        repsLogradas: completada ? 10 : null,
        pesoKg: completada ? '60' : null,
        pesoPrescritoKg: '60',
        rpe: null,
        descansoSegundos: 90,
        completada,
      })),
    })),
  };
}

describe('ModalFinalizarSesion · UX-26', () => {
  it('ENT-02: con todas las series completadas muestra resumen de éxito', () => {
    // 2 ejercicios con 2 series completadas cada uno = 4 de 4
    const sesion = crearSesionMock([[true, true], [true, true]]);

    render(
      <ModalFinalizarSesion
        sesion={sesion}
        rpeSesion={null}
        onRpeChange={vi.fn()}
        molestia="Ninguna 👍"
        onMolestiaChange={vi.fn()}
        notasCoachInput=""
        onNotasChange={vi.fn()}
        isFinishing={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const statusBanner = screen.getByRole('status');
    expect(statusBanner).not.toBeNull();
    expect(statusBanner.textContent).toContain('Completaste todas las series (4 de 4)');
  });

  it('ENT-02: con series pendientes informa con precisión cuántas se hicieron y cuántas quedan', () => {
    // 4 series en total: 1 completada, 3 pendientes
    const sesion = crearSesionMock([[true, false], [false, false]]);

    render(
      <ModalFinalizarSesion
        sesion={sesion}
        rpeSesion={null}
        onRpeChange={vi.fn()}
        molestia="Ninguna 👍"
        onMolestiaChange={vi.fn()}
        notasCoachInput=""
        onNotasChange={vi.fn()}
        isFinishing={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const statusBanner = screen.getByRole('status');
    expect(statusBanner).not.toBeNull();
    expect(statusBanner.textContent).toContain('Hiciste 1 de 4 series');
    expect(statusBanner.textContent).toContain('3 quedarán sin completar');
  });

  it('ENT-02: con 1 serie pendiente utiliza el singular gramatical', () => {
    // 3 de 4 completadas
    const sesion = crearSesionMock([[true, true], [true, false]]);

    render(
      <ModalFinalizarSesion
        sesion={sesion}
        rpeSesion={null}
        onRpeChange={vi.fn()}
        molestia="Ninguna 👍"
        onMolestiaChange={vi.fn()}
        notasCoachInput=""
        onNotasChange={vi.fn()}
        isFinishing={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const statusBanner = screen.getByRole('status');
    expect(statusBanner).not.toBeNull();
    expect(statusBanner.textContent).toContain('Hiciste 3 de 4 series');
    expect(statusBanner.textContent).toContain('1 serie quedará sin completar');
  });

  it('ENT-09a: los botones de esfuerzo 1-10 no contienen etiquetas inductoras dentro del texto del botón', () => {
    const sesion = crearSesionMock([[true, true]]);

    render(
      <ModalFinalizarSesion
        sesion={sesion}
        rpeSesion={null}
        onRpeChange={vi.fn()}
        molestia="Ninguna 👍"
        onMolestiaChange={vi.fn()}
        notasCoachInput=""
        onNotasChange={vi.fn()}
        isFinishing={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    // Los botones de esfuerzo deben contener solo números, no '8 (Ideal)' ni '1 (Bajo)' ni '10 (Máximo)'
    const botones = screen.getAllByRole('button');
    const botonOcho = botones.find((b) => b.textContent?.trim() === '8');
    expect(botonOcho).toBeDefined();
    expect(screen.queryByText('8 (Ideal)')).toBeNull();
    expect(screen.queryByText('1 (Bajo)')).toBeNull();
    expect(screen.queryByText('10 (Máximo)')).toBeNull();
  });

  it('ENT-09b: con rpeSesion null indica "Sin seleccionar (opcional)" y ningún botón queda marcado como activo', () => {
    const sesion = crearSesionMock([[true, true]]);

    render(
      <ModalFinalizarSesion
        sesion={sesion}
        rpeSesion={null}
        onRpeChange={vi.fn()}
        molestia="Ninguna 👍"
        onMolestiaChange={vi.fn()}
        notasCoachInput=""
        onNotasChange={vi.fn()}
        isFinishing={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText(/Sin seleccionar/i)).not.toBeNull();

    const grupoEsfuerzo = screen.getByRole('group', { name: /¿Qué tan duro fue\?/i });
    const botonesEsfuerzo = grupoEsfuerzo.querySelectorAll('button');
    expect(botonesEsfuerzo.length).toBe(10);
    botonesEsfuerzo.forEach((btn) => {
      expect(btn.getAttribute('aria-pressed')).toBe('false');
    });
  });

  it('ENT-09b: al pulsar un valor de esfuerzo emite onRpeChange y refleja el valor seleccionado', () => {
    const sesion = crearSesionMock([[true, true]]);
    const onRpeChange = vi.fn();

    const { rerender } = render(
      <ModalFinalizarSesion
        sesion={sesion}
        rpeSesion={null}
        onRpeChange={onRpeChange}
        molestia="Ninguna 👍"
        onMolestiaChange={vi.fn()}
        notasCoachInput=""
        onNotasChange={vi.fn()}
        isFinishing={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const grupoEsfuerzo = screen.getByRole('group', { name: /¿Qué tan duro fue\?/i });
    const botonSiete = Array.from(grupoEsfuerzo.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === '7'
    );
    expect(botonSiete).toBeDefined();
    fireEvent.click(botonSiete!);
    expect(onRpeChange).toHaveBeenCalledWith(7);

    // Al rerenderizar con rpeSesion=7
    rerender(
      <ModalFinalizarSesion
        sesion={sesion}
        rpeSesion={7}
        onRpeChange={onRpeChange}
        molestia="Ninguna 👍"
        onMolestiaChange={vi.fn()}
        notasCoachInput=""
        onNotasChange={vi.fn()}
        isFinishing={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(botonSiete?.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/7 \/ 10/i)).not.toBeNull();
  });

  it('ENT-10: el botón principal tiene type="button", jerarquía text-sm y nombre accesible', () => {
    const sesion = crearSesionMock([[true, true]]);

    render(
      <ModalFinalizarSesion
        sesion={sesion}
        rpeSesion={null}
        onRpeChange={vi.fn()}
        molestia="Ninguna 👍"
        onMolestiaChange={vi.fn()}
        notasCoachInput=""
        onNotasChange={vi.fn()}
        isFinishing={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    const botonEnviar = screen.getByRole('button', { name: 'Guardar y enviar a mi entrenador' });
    expect(botonEnviar.getAttribute('type')).toBe('button');
    expect(botonEnviar.className).toContain('text-sm');
    expect(botonEnviar.className).toContain('min-h-11');
  });
});
