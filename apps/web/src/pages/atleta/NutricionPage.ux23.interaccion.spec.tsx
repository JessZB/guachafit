// @vitest-environment jsdom
/**
 * Módulo 6 · Nutrición — integración UX-23 (Fase roja TDD).
 * Cubre contratos ALU-16, ALU-17, ALU-18, ALU-19 y ALU-21.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createElement } from 'react';
import { NutricionPage } from './NutricionPage';
import { formatFechaLargaCalendario } from '../../lib/date-format';
import { SemaforoNutricional } from '@guachafit/shared';
import { AvisoVentanaReporte } from '../../components/atleta/nutricion/AvisoVentanaReporte';

let mockTimezone: string | undefined = 'America/Caracas';

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      timezone: mockTimezone,
      zonaHoraria: mockTimezone,
    },
    isDemoMode: false,
  }),
}));

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return { ...actual, apiClient: vi.fn() };
});

vi.mock('../../lib/imagen-comprimida', () => ({
  comprimirImagenAWebp: (archivo: File) => Promise.resolve(archivo),
}));

import { apiClient } from '../../lib/api-client';
import { clearOfflineData } from '../../lib/offline-db';

type MockApi = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockApi;

const ALUMNO_ID = '11111111-1111-4111-8111-111111111111';

function checkinHoy() {
  return {
    id: 'checkin-hoy',
    alumnoId: ALUMNO_ID,
    fecha: '2026-09-21',
    semaforo: SemaforoNutricional.CUMPLIDO,
    caloriasReportadas: null,
    proteinaGramosReportada: null,
    aguaLitros: null,
    notasAlumno: null,
    fotosPlatos: [],
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString(),
  };
}

let mockCheckins: unknown[] = [];

function respuestaPorDefecto(url: string, opciones?: { method?: string }): unknown {
  if (
    typeof url === 'string' &&
    url.includes('/nutricion/alumnos/') &&
    url.includes('/checkins')
  ) {
    return mockCheckins;
  }
  if (
    typeof url === 'string' &&
    url.includes('/nutricion/checkin-diario') &&
    opciones?.method === 'POST'
  ) {
    return { checkin: checkinHoy() };
  }
  return null;
}

function renderPagina() {
  return render(createElement(MemoryRouter, null, createElement(NutricionPage)));
}

function fotoJpeg(nombre: string): File {
  return new File(['contenido-foto'], nombre, { type: 'image/jpeg' });
}

function cambiarArchivos(input: HTMLInputElement, archivos: File[]) {
  fireEvent.change(input, { target: { files: archivos } });
}

let contadorUrls = 0;

beforeEach(() => {
  mockTimezone = 'America/Caracas';
  mockCheckins = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-21T19:00:00-04:00'));
  contadorUrls = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => `blob:mock-${++contadorUrls}`,
    revokeObjectURL: () => {},
  });
  mockApi.mockImplementation((url: string, opciones?: { method?: string }) =>
    Promise.resolve(respuestaPorDefecto(url, opciones))
  );
});

afterEach(async () => {
  cleanup();
  await clearOfflineData();
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true, writable: true });
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('NutricionPage · UX-23 interacción', () => {
  describe('ALU-16 y ALU-17 — Ventana cerrada con zona del perfil y enlace a Ajustes', () => {
    it('fuera de ventana muestra la zona horaria del perfil en el botón deshabilitado y ofrece enlace para cambiar zona horaria', async () => {
      mockTimezone = 'Europe/Madrid';
      vi.setSystemTime(new Date('2026-09-21T10:00:00+02:00'));

      renderPagina();

      const boton = await screen.findByRole('button', {
        name: 'Disponible a partir de las 18:00 (hora de Madrid)',
      });
      expect(boton).toBeDefined();
      expect(boton.hasAttribute('disabled')).toBe(true);

      const enlace = screen.getByRole('link', { name: /Cambiar zona horaria/i });
      expect(enlace.getAttribute('href')).toBe('/app/ajustes?tab=zona-horaria');
    });

    it('dentro de la ventana oculta el enlace de cambiar zona horaria y habilita Guardar reporte nutricional', async () => {
      mockTimezone = 'America/Caracas';
      vi.setSystemTime(new Date('2026-09-21T19:00:00-04:00'));

      renderPagina();

      const botonGuardar = await screen.findByRole('button', {
        name: 'Guardar reporte nutricional',
      });
      expect(botonGuardar.hasAttribute('disabled')).toBe(false);

      expect(screen.queryByRole('link', { name: /Cambiar zona horaria/i })).toBeNull();
    });

    it('AvisoVentanaReporte funciona sin contexto de Router (resiliencia SSR) degradando a enlace HTML estándar', () => {
      expect(() => {
        render(<AvisoVentanaReporte zonaPerfil="America/Caracas" />);
      }).not.toThrow();

      const enlace = screen.getByRole('link', { name: /Cambiar zona horaria/i });
      expect(enlace).toBeDefined();
      expect(enlace.getAttribute('href')).toBe('/app/ajustes?tab=zona-horaria');
      expect(enlace.tagName.toLowerCase()).toBe('a');
    });
  });

  describe('ALU-18 — Calendario de últimos 7 días accesible en pantallas táctiles', () => {
    it('muestra la fecha legible y el estado completo de cada día en el calendario sin depender de title ni truncar el estado', async () => {
      mockTimezone = 'America/Caracas';
      vi.setSystemTime(new Date('2026-09-21T19:00:00-04:00'));
      mockCheckins = [
        {
          id: 'chk-20',
          alumnoId: ALUMNO_ID,
          fecha: '2026-09-20',
          semaforo: 'cumplido',
          aguaLitros: '2.5',
          caloriasReportadas: 2100,
          proteinaGramosReportada: 150,
          notasAlumno: null,
          fotosPlatos: [],
          creadoEn: '2026-09-20T23:00:00Z',
        },
      ];

      renderPagina();

      await screen.findByText('Tus últimos 7 días');

      const fechaFormateada = formatFechaLargaCalendario('2026-09-20');
      expect(fechaFormateada).toBeTruthy();
      expect(screen.getByText(new RegExp(fechaFormateada!, 'i'))).toBeDefined();
      expect(screen.getByText(/Segu[ií] mi plan/i)).toBeDefined();
      expect(screen.getAllByText(/No reportado/i).length).toBeGreaterThan(0);

      const seccion = screen.getByText('Tus últimos 7 días').closest('section')!;
      expect(seccion.querySelectorAll('[title]').length).toBe(0);

      const elementosTexto = Array.from(seccion.querySelectorAll('*')).filter((el) =>
        /Segu[ií] mi plan|Cumplido|No reportado/i.test(el.textContent || '')
      );
      expect(elementosTexto.length).toBeGreaterThan(0);
      for (const el of elementosTexto) {
        expect(el.classList.contains('truncate')).toBe(false);
      }
    });
  });

  describe('ALU-19 — Validación reactiva por campo y contador vinculado en Notas', () => {
    it('marca aria-invalid y muestra alerta junto al campo con valor inválido, limpiándola al corregirlo', async () => {
      mockTimezone = 'America/Caracas';
      vi.setSystemTime(new Date('2026-09-21T19:00:00-04:00'));

      const { container } = renderPagina();
      await screen.findByText('Mi Comida de Hoy');

      const inputAgua = container.querySelector('#nutricion-agua') as HTMLInputElement;
      const inputCalorias = container.querySelector('#nutricion-calorias') as HTMLInputElement;
      const inputProteina = container.querySelector('#nutricion-proteina') as HTMLInputElement;

      expect(inputAgua).toBeDefined();
      expect(inputCalorias).toBeDefined();
      expect(inputProteina).toBeDefined();

      // En #nutricion-agua, ingresa '2.555' (fireEvent.change)
      fireEvent.change(inputAgua, { target: { value: '2.555' } });
      expect(inputAgua.getAttribute('aria-invalid')).toBe('true');
      expect(inputAgua.getAttribute('aria-describedby')).toBe('nutricion-agua-error');
      const errorAgua = container.querySelector('#nutricion-agua-error');
      expect(errorAgua).not.toBeNull();
      expect(errorAgua!.getAttribute('role')).toBe('alert');
      expect(errorAgua!.textContent).toBe(
        'Agua: escribe los litros con hasta 2 decimales, por ejemplo 2,5.'
      );

      // En #nutricion-calorias, ingresa '12.5'
      fireEvent.change(inputCalorias, { target: { value: '12.5' } });
      expect(inputCalorias.getAttribute('aria-invalid')).toBe('true');
      expect(inputCalorias.getAttribute('aria-describedby')).toBe('nutricion-calorias-error');
      const errorCalorias = container.querySelector('#nutricion-calorias-error');
      expect(errorCalorias).not.toBeNull();
      expect(errorCalorias!.getAttribute('role')).toBe('alert');
      expect(errorCalorias!.textContent).toBe(
        'Calorías inválidas: usa solo números enteros (sin decimales).'
      );

      // En #nutricion-proteina, ingresa '1500'
      fireEvent.change(inputProteina, { target: { value: '1500' } });
      expect(inputProteina.getAttribute('aria-invalid')).toBe('true');
      expect(inputProteina.getAttribute('aria-describedby')).toBe('nutricion-proteina-error');
      const errorProteina = container.querySelector('#nutricion-proteina-error');
      expect(errorProteina).not.toBeNull();
      expect(errorProteina!.getAttribute('role')).toBe('alert');
      expect(errorProteina!.textContent).toBe(
        'Proteína: escribe los gramos con un número entre 0 y 1000.'
      );

      // Corrige #nutricion-agua a '2,5', #nutricion-calorias a '2100' y #nutricion-proteina a ''
      fireEvent.change(inputAgua, { target: { value: '2,5' } });
      fireEvent.change(inputCalorias, { target: { value: '2100' } });
      fireEvent.change(inputProteina, { target: { value: '' } });

      expect(inputAgua.getAttribute('aria-invalid')).not.toBe('true');
      expect(inputCalorias.getAttribute('aria-invalid')).not.toBe('true');
      expect(inputProteina.getAttribute('aria-invalid')).not.toBe('true');

      expect(
        screen.queryByText('Agua: escribe los litros con hasta 2 decimales, por ejemplo 2,5.')
      ).toBeNull();
      expect(
        screen.queryByText('Calorías inválidas: usa solo números enteros (sin decimales).')
      ).toBeNull();
      expect(
        screen.queryByText('Proteína: escribe los gramos con un número entre 0 y 1000.')
      ).toBeNull();
      expect(container.querySelector('#nutricion-agua-error')).toBeNull();
      expect(container.querySelector('#nutricion-calorias-error')).toBeNull();
      expect(container.querySelector('#nutricion-proteina-error')).toBeNull();
    });

    it('vincula el contador de caracteres de notas mediante aria-describedby y lo actualiza al escribir', async () => {
      const { container } = renderPagina();
      await screen.findByText('Mi Comida de Hoy');

      const inputNotas = container.querySelector('#nutricion-notas') as HTMLTextAreaElement;
      expect(inputNotas).toBeDefined();
      expect(inputNotas.getAttribute('aria-describedby')).toBe('nutricion-notas-limite');

      const limiteNotas = container.querySelector('#nutricion-notas-limite');
      expect(limiteNotas).not.toBeNull();
      expect(limiteNotas!.textContent).toBe('0/280');

      fireEvent.change(inputNotas, { target: { value: 'Cena ligera' } });
      expect(limiteNotas!.textContent).toBe('11/280');
    });
  });

  describe('ALU-21 — Avisos sin emojis de texto (✓ / ⏳) y pluralización de fotos encoladas', () => {
    it('al encolar sin conexión con 1 foto muestra el aviso con icono SVG y singular "1 foto" sin emoji de texto', async () => {
      Object.defineProperty(window.navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true,
      });

      try {
        const { container } = renderPagina();
        await screen.findByText('Mi Comida de Hoy');

        // adjunta 1 foto JPEG válida (input[type="file"])
        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
        expect(fileInput).toBeDefined();
        const foto = fotoJpeg('plato1.jpg');
        cambiarArchivos(fileInput, [foto]);

        // elige el semáforo 'Cumplido'
        const botonCumplido = await screen.findByRole('button', { name: /^Cumplido/ });
        fireEvent.click(botonCumplido);

        // y pulsa 'Guardar reporte nutricional'
        const botonGuardar = screen.getByRole('button', {
          name: /Guardar reporte nutricional/,
        });
        fireEvent.click(botonGuardar);

        // Espera al estado que contenga 'Guardado en tu dispositivo con 1 foto'
        const aviso = await screen.findByText(/Guardado en tu dispositivo con 1 foto/);
        expect(aviso).toBeDefined();

        const textoAviso = aviso.textContent || '';
        expect(textoAviso).not.toContain('⏳');
        expect(textoAviso).not.toContain('1 fotos');
      } finally {
        Object.defineProperty(window.navigator, 'onLine', {
          value: true,
          configurable: true,
          writable: true,
        });
      }
    });
  });
});
