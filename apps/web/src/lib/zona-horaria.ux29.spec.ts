// @vitest-environment happy-dom
/**
 * Specs del lote UX-29 (ALU-26: hora actual en zona horaria y sección de ajustes sin título redundante).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import * as moduloZonaHoraria from './zona-horaria';
import { SelectorZonaHoraria } from '../components/common/SelectorZonaHoraria';
import { AjustesAlumnoPage } from '../pages/atleta/AjustesAlumnoPage';

afterEach(() => {
  cleanup();
});

// Mock del contexto de autenticación para que AjustesAlumnoPage monte en modo demo con zona horaria
vi.mock('../context/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'alumno-1',
      email: 'alumno@guachafit.com',
      rol: 'alumno',
      zonaHoraria: 'America/Caracas',
    },
    isDemoMode: true,
    actualizarZonaHoraria: vi.fn(),
  }),
}));

describe('ALU-26: textoHoraActualEnZona', () => {
  it('devuelve la cadena con formato "Ahora son las HH:mm en <hora de Ciudad>"', () => {
    const textoFn = (moduloZonaHoraria as {
      textoHoraActualEnZona?: (zona: string, fecha?: Date) => string;
    }).textoHoraActualEnZona;

    expect(typeof textoFn).toBe('function');
    if (!textoFn) return;

    // Instante fijo en UTC: 2026-11-02 18:30:00 UTC
    // America/Caracas es UTC-4 -> 14:30
    const fechaFija = new Date('2026-11-02T18:30:00.000Z');
    expect(textoFn('America/Caracas', fechaFija)).toBe('Ahora son las 14:30 en hora de Caracas');

    // Europe/Madrid es UTC+1 en noviembre (horario de invierno estándar) -> 19:30
    expect(textoFn('Europe/Madrid', fechaFija)).toBe('Ahora son las 19:30 en hora de Madrid');
  });

  it('utiliza la fecha actual por defecto si se omite el segundo argumento', () => {
    const textoFn = (moduloZonaHoraria as {
      textoHoraActualEnZona?: (zona: string, fecha?: Date) => string;
    }).textoHoraActualEnZona;

    expect(typeof textoFn).toBe('function');
    if (!textoFn) return;

    const resultado = textoFn('America/Caracas');
    expect(resultado).toMatch(/^Ahora son las \d{2}:\d{2} en hora de Caracas$/);
  });
});

describe('ALU-26: SelectorZonaHoraria hora actual', () => {
  it('renderiza el texto de hora actual en la zona seleccionada con clase text-xs', () => {
    render(
      createElement(SelectorZonaHoraria, {
        id: 'zona-horaria-selector-test',
        valor: 'America/Caracas',
        opciones: ['America/Caracas', 'Europe/Madrid'],
        onCambiar: vi.fn(),
        onGuardar: vi.fn(),
      })
    );

    const textoElem = screen.getByText(/Ahora son las \d{2}:\d{2} en hora de Caracas/i);
    expect(textoElem).toBeDefined();
    expect(textoElem.className).toContain('text-xs');
  });
});

describe('ALU-26: AjustesAlumnoPage sin título redundante', () => {
  it('la sección de zona horaria no tiene un <h2> duplicado con texto "Tu zona horaria"', () => {
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/app/ajustes?tab=zona-horaria'] },
        createElement(AjustesAlumnoPage)
      )
    );

    const encabezadoDuplicado = screen.queryByRole('heading', {
      level: 2,
      name: /tu zona horaria/i,
    });
    expect(encabezadoDuplicado).toBeNull();
  });
});
