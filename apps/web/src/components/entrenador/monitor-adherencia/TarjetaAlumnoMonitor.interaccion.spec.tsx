// @vitest-environment happy-dom
/**
 * Lote UX-14 (SEG-12 a SEG-19) · Contrato de TarjetaAlumnoMonitor.
 *
 * Contratos:
 * - T1 · Nombre como acción principal: article sin title, botón con nombre de alumna,
 *        aria-haspopup="dialog", after:absolute after:inset-0, y llama a onVerActividad.
 * - T2 · Chevron a la ficha: enlace con href, min-h-11, min-w-11, pointer-events-auto;
 *        al pulsarlo no llama a onVerActividad.
 * - T3 · Nombre sin cortar: h3 con line-clamp-2 y sin truncate.
 * - T4 · Estado con BadgeEstado y sin parpadeo forzado: texto "Rojo" con whitespace-nowrap
 *        y shrink-0; ningún elemento tiene animate-pulse (motion-safe:animate-pulse permitido).
 * - T5 · Sin abreviatura: aparece "Última sesión: ..." y no "Últ. sesión".
 * - T6 · Racha honesta: con racha 0 no hay texto de racha; con 1 se ve "Racha: 1 día".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SemaforoAdherencia, type MonitorAdherenciaSemanalDTO } from '@guachafit/shared';
import { TarjetaAlumnoMonitor } from './TarjetaAlumnoMonitor';

const ALUMNO_ROJO: MonitorAdherenciaSemanalDTO = {
  alumnoId: 'u-rojo',
  alumnoPerfilId: 'al-rojo',
  nombreCompleto: 'Rosa Riesgo',
  sesionesPrescritas: 4,
  sesionesCompletadas: 1,
  porcentajeCumplimientoSemanal: '25.00',
  semaforoAdherencia: SemaforoAdherencia.ROJO,
  tienePlanActivo: true,
  sinPendientesSemana: false,
  rachaDiasConsecutivos: 1,
  diasInactivo: 6,
  ultimaSesionUtc: '2026-10-05T10:00:00.000Z',
};

function renderizar(
  alumno: MonitorAdherenciaSemanalDTO = ALUMNO_ROJO,
  onVerActividad = vi.fn(),
) {
  return {
    onVerActividad,
    ...render(
      <MemoryRouter>
        <TarjetaAlumnoMonitor alumno={alumno} onVerActividad={onVerActividad} />
      </MemoryRouter>,
    ),
  };
}

afterEach(() => {
  cleanup();
});

describe('TarjetaAlumnoMonitor · interacción (UX-14)', () => {
  it('T1 · Nombre como acción principal', () => {
    const onVerActividad = vi.fn();
    renderizar(ALUMNO_ROJO, onVerActividad);

    const article = screen.getByRole('article');
    expect(article.getAttribute('title')).toBeNull();

    const boton = screen.getByRole('button', { name: 'Rosa Riesgo' });
    expect(boton.getAttribute('aria-haspopup')).toBe('dialog');
    expect(boton.className).toContain('after:absolute');
    expect(boton.className).toContain('after:inset-0');

    fireEvent.click(boton);
    expect(onVerActividad).toHaveBeenCalledTimes(1);
    expect(onVerActividad).toHaveBeenCalledWith(ALUMNO_ROJO);
  });

  it('T2 · Chevron a la ficha', () => {
    const onVerActividad = vi.fn();
    renderizar(ALUMNO_ROJO, onVerActividad);

    const enlace = screen.getByRole('link', { name: 'Abrir el expediente de Rosa Riesgo' });
    expect(enlace.getAttribute('href')).toBe('/coach/alumnos/al-rojo');
    expect(enlace.className).toContain('min-h-11');
    expect(enlace.className).toContain('min-w-11');
    expect(enlace.className).toContain('pointer-events-auto');

    fireEvent.click(enlace);
    expect(onVerActividad).not.toHaveBeenCalled();
  });

  it('T3 · Nombre sin cortar', () => {
    renderizar(ALUMNO_ROJO);

    const encabezado = screen.getByRole('heading', { level: 3, name: 'Rosa Riesgo' });
    expect(encabezado.className).toContain('line-clamp-2');
    expect(encabezado.className).not.toContain('truncate');
  });

  it('T4 · Estado con BadgeEstado y sin parpadeo forzado', () => {
    renderizar(ALUMNO_ROJO);

    const elementoRojo = screen.getByText('Rojo');
    expect(elementoRojo.className).toContain('whitespace-nowrap');
    expect(elementoRojo.className).toContain('shrink-0');

    const article = screen.getByRole('article');
    const elementosConPulse = [article, ...Array.from(article.querySelectorAll('*'))].filter(
      (el) => el.classList.contains('animate-pulse'),
    );
    expect(elementosConPulse).toHaveLength(0);
  });

  it('T5 · Sin abreviatura', () => {
    renderizar(ALUMNO_ROJO);

    expect(screen.getByText(/^Última sesión:/)).toBeTruthy();
    expect(screen.queryByText(/Últ\. sesión/)).toBeNull();
  });

  it('T6 · Racha honesta', () => {
    const alumnoRachaCero: MonitorAdherenciaSemanalDTO = {
      ...ALUMNO_ROJO,
      rachaDiasConsecutivos: 0,
    };
    renderizar(alumnoRachaCero);
    expect(screen.queryByText(/Racha:/)).toBeNull();

    cleanup();

    const alumnoRachaUno: MonitorAdherenciaSemanalDTO = {
      ...ALUMNO_ROJO,
      rachaDiasConsecutivos: 1,
    };
    renderizar(alumnoRachaUno);
    expect(screen.getByText('Racha: 1 día')).toBeTruthy();
  });
});
