// @vitest-environment jsdom
/**
 * Spec de interacción UX-24 · Menú del Alumno (Fase Roja TDD).
 * Cubre contratos MEN-02, MEN-03, MEN-04, MEN-05 y MEN-06.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  EstadoCuota,
  type ResumenFinancieroAlumnoDTO,
  type SemanaEntrenamientoProgresoDTO,
} from '@guachafit/shared';

const authMock = vi.hoisted(() => ({
  user: { id: 'alu-1', email: 'jesus.perez88@correo.com', rol: 'alumno' },
  isDemoMode: false,
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => authMock,
}));

const mockApiClient = vi.hoisted(() => vi.fn());

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    apiClient: (...args: unknown[]) => mockApiClient(...args),
  };
});

import { AtletaMenuPage } from './AtletaMenuPage';

describe('AtletaMenuPage · Contratos UX-24', () => {
  beforeEach(() => {
    authMock.user = { id: 'alu-1', email: 'jesus.perez88@correo.com', rol: 'alumno' };
    authMock.isDemoMode = false;
    mockApiClient.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  describe('MEN-05 — Saludo con el nombre real del perfil (nunca derivado del correo ni con emoji 👋)', () => {
    it('saluda con el primer nombre del perfil del alumno y sin emoji, y muestra solo "Hola" mientras no hay perfil', async () => {
      // Primer escenario: /usuarios/me/perfil queda pendiente (promesa sin resolver) y user.email es 'jesus.perez88@correo.com'
      mockApiClient.mockImplementation((url: string) => {
        if (url.includes('/usuarios/me/perfil')) {
          return new Promise(() => {});
        }
        return new Promise(() => {});
      });

      render(
        <MemoryRouter>
          <AtletaMenuPage />
        </MemoryRouter>
      );

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.textContent?.trim()).toBe('Hola');
      expect(document.body.textContent).not.toContain('Jesus.perez88');
      expect(document.body.textContent).not.toContain('Alumno');
      expect(document.body.textContent).not.toContain('👋');

      // Segundo escenario (cleanup())
      cleanup();

      mockApiClient.mockImplementation((url: string) => {
        if (url.includes('/usuarios/me/perfil')) {
          return Promise.resolve({
            id: 'alu-1',
            correo: 'jesus.perez88@correo.com',
            email: 'jesus.perez88@correo.com',
            rol: 'alumno',
            entrenador: null,
            alumno: {
              nombres: 'Ana María',
              apellidos: 'Gómez',
              telefono: null,
              fechaNacimiento: null,
              tipoDocumento: null,
              numeroDocumento: null,
              zonaHoraria: 'America/Caracas',
            },
          });
        }
        return new Promise(() => {});
      });

      render(
        <MemoryRouter>
          <AtletaMenuPage />
        </MemoryRouter>
      );

      const headingAna = await screen.findByRole('heading', { level: 1, name: 'Hola, Ana' });
      expect(headingAna).toBeTruthy();
    });
  });

  describe('MEN-02 — Estados honestos del entrenamiento de hoy (carga, error, descanso, completado hoy y listo para iniciar)', () => {
    it('mientras carga la semana muestra "Cargando entrenamiento…" y nunca afirma "Listo para iniciar"', () => {
      mockApiClient.mockImplementation((url: string) => {
        if (url.includes('/alumnos/me/rutina/semana-actual')) {
          return new Promise(() => {});
        }
        return Promise.resolve(null);
      });

      render(
        <MemoryRouter>
          <AtletaMenuPage />
        </MemoryRouter>
      );

      expect(screen.getByText('Cargando entrenamiento…')).toBeTruthy();
      expect(screen.queryByText('Listo para iniciar')).toBeNull();
    });

    it('cuando el bloque sugerido de hoy ya fue completado muestra "Completado hoy"', async () => {
      const semanaMock: SemanaEntrenamientoProgresoDTO = {
        semanaIso: '2026-W38',
        inicioSemana: '2026-09-21',
        finSemana: '2026-09-27',
        totalBloques: 4,
        bloquesCompletados: 2,
        porcentajeCumplimiento: '50.00',
        esDiaDescansoHoy: false,
        rachaDias: 2,
        bloques: [
          {
            bloqueId: 'b-completado',
            titulo: 'Piernas y Glúteos',
            enfoque: null,
            diaSugerido: 1,
            totalEjercicios: 4,
            completado: true,
            esSugeridoHoy: true,
            estadoSesion: 'completada' as unknown as undefined,
          },
        ],
      };

      mockApiClient.mockImplementation((url: string) => {
        if (url.includes('/alumnos/me/rutina/semana-actual')) {
          return Promise.resolve(semanaMock);
        }
        return Promise.resolve(null);
      });

      render(
        <MemoryRouter>
          <AtletaMenuPage />
        </MemoryRouter>
      );

      expect(await screen.findByText('Completado hoy')).toBeTruthy();
      expect(screen.queryByText('Listo para iniciar')).toBeNull();
    });

    it('cuando hoy hay un bloque pendiente muestra "Listo para iniciar" sin animación de pulso forzada', async () => {
      const semanaMock: SemanaEntrenamientoProgresoDTO = {
        semanaIso: '2026-W38',
        inicioSemana: '2026-09-21',
        finSemana: '2026-09-27',
        totalBloques: 4,
        bloquesCompletados: 1,
        porcentajeCumplimiento: '25.00',
        esDiaDescansoHoy: false,
        rachaDias: 1,
        bloques: [
          {
            bloqueId: 'b-pendiente',
            titulo: 'Empuje',
            enfoque: null,
            diaSugerido: 1,
            totalEjercicios: 4,
            completado: false,
            esSugeridoHoy: true,
            estadoSesion: null,
          },
        ],
      };

      mockApiClient.mockImplementation((url: string) => {
        if (url.includes('/alumnos/me/rutina/semana-actual')) {
          return Promise.resolve(semanaMock);
        }
        return Promise.resolve(null);
      });

      const { container } = render(
        <MemoryRouter>
          <AtletaMenuPage />
        </MemoryRouter>
      );

      expect(await screen.findByText('Listo para iniciar')).toBeTruthy();
      const tarjetaEntrenamiento = container.querySelector('a[href="/app/hoy"]');
      expect(tarjetaEntrenamiento).toBeTruthy();
      expect(tarjetaEntrenamiento?.querySelector('.animate-pulse')).toBeNull();
    });
  });

  describe('MEN-03 — Fallo al cargar la semana muestra "Sin datos", error con botón "Reintentar" y vuelve a consultar al pulsarlo', () => {
    it('ante un fallo al cargar la semana muestra "Sin datos" y permite reintentar hasta cargar la rutina', async () => {
      let intento = 0;
      const semanaValida: SemanaEntrenamientoProgresoDTO = {
        semanaIso: '2026-W38',
        inicioSemana: '2026-09-21',
        finSemana: '2026-09-27',
        totalBloques: 4,
        bloquesCompletados: 1,
        porcentajeCumplimiento: '25.00',
        esDiaDescansoHoy: false,
        rachaDias: 4,
        bloques: [
          {
            bloqueId: 'b1',
            titulo: 'Día 1',
            enfoque: null,
            diaSugerido: 1,
            totalEjercicios: 4,
            completado: false,
            esSugeridoHoy: true,
            estadoSesion: null,
          },
        ],
      };

      mockApiClient.mockImplementation((url: string) => {
        if (url.includes('/alumnos/me/rutina/semana-actual')) {
          intento += 1;
          if (intento === 1) {
            return Promise.reject(new Error('Error de red'));
          }
          return Promise.resolve(semanaValida);
        }
        return Promise.resolve(null);
      });

      render(
        <MemoryRouter>
          <AtletaMenuPage />
        </MemoryRouter>
      );

      expect(await screen.findByText('Sin datos')).toBeTruthy();
      const botonReintentar = screen.getByRole('button', { name: /Reintentar/i });
      expect(botonReintentar).toBeTruthy();

      fireEvent.click(botonReintentar);

      expect(await screen.findByText('Listo para iniciar')).toBeTruthy();
      expect(await screen.findByText('4 días')).toBeTruthy();
    });
  });

  describe('MEN-04 y MEN-06 — Barra de progreso accesible (role="progressbar"), microcopy limpio y BadgeEstado en Pagos', () => {
    it('expone role="progressbar" con porcentaje real, "100% completado" sin emoji al completar la semana y BadgeEstado en Pagos', async () => {
      const semanaCompleta: SemanaEntrenamientoProgresoDTO = {
        semanaIso: '2026-W38',
        inicioSemana: '2026-09-21',
        finSemana: '2026-09-27',
        totalBloques: 4,
        bloquesCompletados: 4,
        porcentajeCumplimiento: '100.00',
        esDiaDescansoHoy: false,
        rachaDias: 5,
        bloques: [
          {
            bloqueId: 'b1',
            titulo: 'Día 1',
            enfoque: null,
            diaSugerido: 1,
            totalEjercicios: 4,
            completado: true,
            fechaCompletadaUtc: '2026-09-21T15:00:00Z',
            fechaProgramada: '2026-09-21',
            esSugeridoHoy: true,
            estadoSesion: 'completada' as unknown as undefined,
            motivoOmision: null,
          },
        ],
      };

      const estadoMora = ((EstadoCuota as unknown as { EN_MORA?: string }).EN_MORA ?? 'en_mora') as unknown as EstadoCuota;

      const resumenFinanciero: ResumenFinancieroAlumnoDTO = {
        alumnoId: 'alu-1',
        usuarioId: 'alu-1',
        saldoPendienteTotalUsd: '40.00',
        saldoAFavorUsd: '0.00',
        totalPagadoHistoricoUsd: '0.00',
        totalPagadoMesActualUsd: '0.00',
        transaccionesTotal: 0,
        transacciones: [],
        cuotaMesActual: {
          id: 'c1',
          periodo: '2026-09',
          montoTotalUsd: '40.00',
          montoPagadoUsd: '0.00',
          saldoPendienteUsd: '40.00',
          estado: estadoMora,
          fechaVencimiento: '2026-09-01T00:00:00Z',
        },
      };

      mockApiClient.mockImplementation((url: string) => {
        if (url.includes('/alumnos/me/rutina/semana-actual')) {
          return Promise.resolve(semanaCompleta);
        }
        if (url.includes('/finanzas/clientes/alu-1/historial')) {
          return Promise.resolve(resumenFinanciero);
        }
        return Promise.resolve(null);
      });

      const { container } = render(
        <MemoryRouter>
          <AtletaMenuPage />
        </MemoryRouter>
      );

      const progressbar = await screen.findByRole('progressbar', { name: /Cumplimiento semanal/i });
      expect(progressbar.getAttribute('aria-valuenow')).toBe('100');
      expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
      expect(progressbar.getAttribute('aria-valuemax')).toBe('100');

      expect(screen.getByText('100% completado')).toBeTruthy();
      expect(screen.queryByText(/¡100% Completado! 🎉/)).toBeNull();

      const tarjetaPagos = container.querySelector('a[href="/app/pagos"]');
      expect(tarjetaPagos).toBeTruthy();
      const badgeCuota = tarjetaPagos?.querySelector('span.rounded-full');
      expect(badgeCuota).toBeTruthy();
      expect(badgeCuota?.className).toContain('whitespace-nowrap');
      expect(badgeCuota?.className).toContain('shrink-0');
    });
  });
});
