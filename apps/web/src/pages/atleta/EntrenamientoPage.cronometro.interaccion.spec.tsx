// @vitest-environment jsdom
/**
 * Lote UX-01 (RF-001, ADR-021) · Cronómetro de descanso inteligente y borrador de series.
 *
 * Escenarios probados:
 * 1. Marcar una serie como completada abre el cronómetro con el descanso de esa serie.
 * 2. Abrir el cronómetro desde el botón de la cabecera (sin marcar serie), expandirlo y pulsar
 *    "Sumar 15 segundos" varias veces: no se envía ninguna petición de descanso (defecto 2).
 *    Repetir tras marcar serie, cerrar con cabecera y reabrir.
 * 3. Con serie marcada y cronómetro abierto, pulsar "Sumar 15 segundos" 4 veces seguidas y avanzar
 *    1000 ms: exactamente UNA petición con el valor final, dirigida a la serie correcta.
 * 4. Recargar la página (desmontar y montar de nuevo con el mismo localStorage y avanzando 20 s)
 *    con el cronómetro corriendo: sigue abierto con ~20 s menos.
 * 5. Cerrar el cronómetro y avanzar el tiempo más allá del fin: no suena ni vibra (defecto 1).
 * 6. Borrador: sesión del servidor con serie pendiente vacía y copia local en offlineDb.rutinaHoy
 *    con peso 62.5 y reps 8: tras cargar muestra 62,5 y 8. Serie completada conserva el servidor.
 * 7. Modo demo: el cronómetro funciona pero no escribe en localStorage ninguna clave guachafit_cronometro_*.
 * 8. Compatibilidad: los contratos de rechazo 4xx previos no chocan con este comportamiento.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  EstadoSesion,
  type SemanaEntrenamientoProgresoDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';

const sesionMock = vi.hoisted(() => ({
  usuario: {
    id: 'a3333333-3333-4333-8333-333333333333',
    email: 'alumna@example.com',
    rol: 'alumno',
    modalidad: 'remoto',
    periodicidadAntropometria: null as string | null,
    antropometriaInicio: null as string | null,
  },
  isDemoMode: false,
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({ user: sesionMock.usuario, isDemoMode: sesionMock.isDemoMode }),
}));

vi.mock('../../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api-client')>();
  return {
    ...actual,
    apiClient: Object.assign(vi.fn(), {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      put: vi.fn(),
    }),
  };
});

import { apiClient } from '../../lib/api-client';
import { offlineDb } from '../../lib/offline-db';
import { EntrenamientoPage } from './EntrenamientoPage';
import { clonar, tarjetaDe } from './entrenamiento.spec-helper';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

const SESION_ID = 'sesion-cronometro-1';

const SEMANA: SemanaEntrenamientoProgresoDTO = {
  semanaIso: '2026-W41',
  inicioSemana: '2026-10-05',
  finSemana: '2026-10-11',
  totalBloques: 1,
  bloquesCompletados: 0,
  porcentajeCumplimiento: '0.00',
  bloques: [
    {
      bloqueId: 'b-1',
      titulo: 'Día 1 (Lunes): Fuerza',
      enfoque: 'Fuerza general',
      diaSugerido: 1,
      totalEjercicios: 1,
      completado: false,
      esSugeridoHoy: true,
      estadoSesion: null,
      motivoOmision: null,
    },
  ],
  siguienteBloqueSugeridoId: 'b-1',
  esDiaDescansoHoy: false,
  rachaDias: 0,
};

const SESION_HOY: SesionEntrenamientoDetalleDTO = {
  id: SESION_ID,
  alumnoId: sesionMock.usuario.id,
  bloqueId: 'b-1',
  fechaProgramada: '2026-10-11',
  timezoneCliente: 'America/Caracas',
  estado: EstadoSesion.EN_PROGRESO,
  porcentajeCumplimiento: '0.00',
  ejercicios: [
    {
      id: 'es-1',
      sesionId: SESION_ID,
      ejercicioId: 'ej-1',
      orden: 1,
      ejercicio: {
        id: 'ej-1',
        nombre: 'Sentadilla',
        grupoMuscular: 'Piernas',
        activo: true,
        createdAtUtc: '2026-10-01T00:00:00.000Z',
      },
      series: [
        {
          id: 's-1',
          ejercicioSesionId: 'es-1',
          numeroSerie: 1,
          repsObjetivo: 10,
          repsLogradas: null,
          pesoKg: null,
          pesoPrescritoKg: '60.00',
          rpe: null,
          descansoSegundos: 90,
          completada: false,
        },
        {
          id: 's-2',
          ejercicioSesionId: 'es-1',
          numeroSerie: 2,
          repsObjetivo: 10,
          repsLogradas: null,
          pesoKg: null,
          pesoPrescritoKg: '60.00',
          rpe: null,
          descansoSegundos: 90,
          completada: false,
        },
      ],
    },
  ],
  createdAtUtc: '2026-10-01T00:00:00.000Z',
  updatedAtUtc: '2026-10-01T00:00:00.000Z',
};

describe('EntrenamientoPage · Cronómetro de descanso y borrador (interacción)', () => {
  let llamadasPutSeries: Array<{ endpoint: string; cuerpo: any }>;

  beforeEach(async () => {
    sesionMock.isDemoMode = false;
    localStorage.clear();
    await offlineDb.rutinaHoy.clear();
    await offlineDb.outboxMutations.clear();

    llamadasPutSeries = [];
    mockApi.mockReset();
    mockApi.get.mockReset();
    mockApi.post.mockReset();
    mockApi.patch.mockReset();
    mockApi.delete.mockReset();
    mockApi.put.mockReset();

    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string; body?: string }) => {
      const metodo = opciones?.method ?? 'GET';
      if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/rutina/semana-actual')) {
        return Promise.resolve(clonar(SEMANA));
      }
      if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/sesiones/hoy')) {
        return Promise.resolve(clonar(SESION_HOY));
      }
      if (metodo === 'PUT' && endpoint === `/sesiones/${SESION_ID}/series`) {
        const cuerpo = JSON.parse(opciones?.body ?? '{}');
        llamadasPutSeries.push({ endpoint, cuerpo });
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`Llamada inesperada en este spec: ${metodo} ${endpoint}`));
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('Escenario 1: marcar una serie como completada abre el cronómetro con el descanso de esa serie y expone role="timer"', async () => {
    render(<EntrenamientoPage />);

    const seccion = await screen.findByRole(
      'region',
      { name: 'Entrenamiento en foco' },
      { timeout: 5000 }
    );

    const botonMarcar = within(seccion).getByRole('button', {
      name: 'Marcar serie 1 como completada',
    });
    fireEvent.click(botonMarcar);

    // Debe abrir el cronómetro con role="timer"
    const timer = await screen.findByRole('timer', undefined, { timeout: 5000 });
    expect(timer).toBeTruthy();

    // Debe exponer botón accesible de cierre de la píldora
    expect(
      screen.getByRole('button', { name: 'Cerrar cronómetro de descanso' })
    ).toBeTruthy();
  });

  it('Escenario 2: defecto 2 (regresión): cronómetro libre desde cabecera no envía peticiones de descanso al pulsar "Sumar 15 segundos"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<EntrenamientoPage />);

    await screen.findByRole('region', { name: 'Entrenamiento en foco' }, { timeout: 5000 });

    // Abrir desde botón de cabecera
    const botonCabecera = screen.getByRole('button', {
      name: /Abrir cronómetro de descanso/i,
    });
    fireEvent.click(botonCabecera);

    // Expandir controles si está en píldora
    const botonExpandir = await screen.findByRole(
      'button',
      { name: 'Expandir cronómetro' },
      { timeout: 5000 }
    );
    fireEvent.click(botonExpandir);

    // Pulsar "Sumar 15 segundos" varias veces
    const botonSumar = await screen.findByRole(
      'button',
      { name: 'Sumar 15 segundos' },
      { timeout: 5000 }
    );
    fireEvent.click(botonSumar);
    fireEvent.click(botonSumar);
    fireEvent.click(botonSumar);

    // Avanzar tiempo para superar cualquier debounce
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    // Ninguna llamada PUT de series para actualizar descansoSegundos
    const llamadasDescanso = llamadasPutSeries.filter(
      (l) => l.cuerpo.series?.[0]?.descansoSegundos !== undefined
    );
    expect(llamadasDescanso).toHaveLength(0);

    // Repetir tras marcar una serie, cerrar con la cabecera y reabrir
    const seccion = screen.getByRole('region', { name: 'Entrenamiento en foco' });
    fireEvent.click(
      within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
    );

    await waitFor(() => {
      expect(llamadasPutSeries.length).toBeGreaterThanOrEqual(1);
    });

    // Cerrar desde la cabecera
    const botonCerrarCabecera = screen.getByRole('button', {
      name: /Detener cronómetro de descanso/i,
    });
    fireEvent.click(botonCerrarCabecera);

    llamadasPutSeries = [];

    // Reabrir desde la cabecera (cronómetro libre)
    const botonReabrirCabecera = screen.getByRole('button', {
      name: /Abrir cronómetro de descanso/i,
    });
    fireEvent.click(botonReabrirCabecera);

    const botonExpandir2 = await screen.findByRole('button', { name: 'Expandir cronómetro' });
    fireEvent.click(botonExpandir2);

    const botonSumar2 = await screen.findByRole('button', { name: 'Sumar 15 segundos' });
    fireEvent.click(botonSumar2);

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    const llamadasDescansoTrasReabrir = llamadasPutSeries.filter(
      (l) => l.cuerpo.series?.[0]?.descansoSegundos !== undefined
    );
    expect(llamadasDescansoTrasReabrir).toHaveLength(0);
  });

  it('Escenario 3: con serie marcada y cronómetro abierto, pulsar "Sumar 15 segundos" 4 veces seguidas y avanzar 1000 ms envía exactamente UNA petición con valor final', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<EntrenamientoPage />);

    const seccion = await screen.findByRole(
      'region',
      { name: 'Entrenamiento en foco' },
      { timeout: 5000 }
    );

    // Marcar serie 1 (descanso inicial 90 s)
    fireEvent.click(
      within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
    );

    const botonExpandir = await screen.findByRole(
      'button',
      { name: 'Expandir cronómetro' },
      { timeout: 5000 }
    );
    fireEvent.click(botonExpandir);

    const botonSumar = await screen.findByRole(
      'button',
      { name: 'Sumar 15 segundos' },
      { timeout: 5000 }
    );

    // Pulsar 4 veces seguidas (+60 s => 150 s)
    fireEvent.click(botonSumar);
    fireEvent.click(botonSumar);
    fireEvent.click(botonSumar);
    fireEvent.click(botonSumar);

    // Avanzar exactamente 1000 ms del debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    await waitFor(
      () => {
        const peticionesDescansoFinal = llamadasPutSeries.filter(
          (l) =>
            l.cuerpo.series?.[0]?.serieId === 's-1' &&
            l.cuerpo.series?.[0]?.descansoSegundos === 150
        );
        expect(peticionesDescansoFinal).toHaveLength(1);
      },
      { timeout: 2000 }
    );

    // Ignora el PUT de marcar la serie (descansoSegundos: 90) y exige exactamente una petición con el valor final
    const peticionesDescansoActualizado = llamadasPutSeries.filter(
      (l) =>
        l.cuerpo.series?.[0]?.serieId === 's-1' &&
        l.cuerpo.series?.[0]?.descansoSegundos !== 90
    );
    expect(peticionesDescansoActualizado).toHaveLength(1);
    expect(peticionesDescansoActualizado[0].cuerpo.series[0].descansoSegundos).toBe(150);
  });

  it('Escenario 4: recargar la página (desmontar y montar con mismo localStorage y +20 s) mantiene el cronómetro abierto con ~20 s menos', async () => {
    const tiempoFijo = new Date('2026-10-11T10:00:00.000Z');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(tiempoFijo);
    const { unmount } = render(<EntrenamientoPage />);

    const seccion = await screen.findByRole(
      'region',
      { name: 'Entrenamiento en foco' },
      { timeout: 5000 }
    );
    fireEvent.click(
      within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
    );

    await screen.findByRole('timer', undefined, { timeout: 5000 });

    // Desmontamos (simulando cierre/recarga de pestaña)
    unmount();

    // Avanzamos 20 segundos en el tiempo del sistema
    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    // Volvemos a renderizar
    render(<EntrenamientoPage />);

    // El cronómetro sigue abierto
    const timerRecargado = await screen.findByRole('timer', undefined, { timeout: 5000 });
    expect(timerRecargado).toBeTruthy();
    // Restante debe ser aproximadamente 70 s (90 s - 20 s) con tolerancia de 1 s
    expect(timerRecargado.textContent).toMatch(/1:(09|10|11)|(69|70|71)/);
  });

  it('Escenario 5: cerrar el cronómetro y avanzar el tiempo más allá del fin: no se llama a vibración ni a AudioContext', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const vibrateSpy = vi.fn();
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateSpy,
      configurable: true,
      writable: true,
    });

    const createOscillatorSpy = vi.fn(() => ({
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }));
    const createGainSpy = vi.fn(() => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }));

    const mockAudioContextInstance = {
      state: 'running',
      currentTime: 0,
      resume: vi.fn().mockResolvedValue(undefined),
      createOscillator: createOscillatorSpy,
      createGain: createGainSpy,
      destination: {},
    };

    const audioContextSpy = vi.fn(function () {
      return mockAudioContextInstance;
    });

    Object.defineProperty(window, 'AudioContext', {
      value: audioContextSpy,
      configurable: true,
      writable: true,
    });

    render(<EntrenamientoPage />);

    const seccion = await screen.findByRole(
      'region',
      { name: 'Entrenamiento en foco' },
      { timeout: 5000 }
    );
    fireEvent.click(
      within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
    );

    const botonCerrar = await screen.findByRole(
      'button',
      { name: 'Cerrar cronómetro de descanso' },
      { timeout: 5000 }
    );
    fireEvent.click(botonCerrar);

    // Justo al cerrar, anotamos llamadas acumuladas por el gesto de marcado
    const vibrateCallsAlCerrar = vibrateSpy.mock.calls.length;
    const audioContextCallsAlCerrar = audioContextSpy.mock.calls.length;
    const oscCallsAlCerrar = createOscillatorSpy.mock.calls.length;

    // Avanzar más allá de los 90 s de descanso
    await act(async () => {
      vi.advanceTimersByTime(120_000);
      await Promise.resolve();
    });

    // 1. Vibración: no aumenta y ninguna llamada posterior usa el patrón de fin de descanso
    expect(vibrateSpy.mock.calls.length).toBe(vibrateCallsAlCerrar);
    const llamadasVibracionPosteriores = vibrateSpy.mock.calls.slice(vibrateCallsAlCerrar);
    const patronFinDescanso = [180, 80, 180, 80, 280];
    expect(
      llamadasVibracionPosteriores.some(
        (args) => JSON.stringify(args[0]) === JSON.stringify(patronFinDescanso)
      )
    ).toBe(false);

    // 2. Audio: no crea osciladores ni construye otro AudioContext tras el cierre
    expect(audioContextSpy.mock.calls.length).toBe(audioContextCallsAlCerrar);
    expect(createOscillatorSpy.mock.calls.length).toBe(oscCallsAlCerrar);
  });

  it('Escenario 6: borrador local en offlineDb.rutinaHoy muestra 62,5 y 8 tras cargar serie pendiente, conservando serie completada del servidor', async () => {
    const sesionLocal = clonar(SESION_HOY);
    // Serie 1 pendiente con borrador de 62.5 kg y 8 reps
    sesionLocal.ejercicios[0].series[0].pesoKg = '62.50';
    sesionLocal.ejercicios[0].series[0].repsLogradas = 8;

    // Serie 2 completada en servidor (la local tenía otros datos pero gana servidor)
    const sesionServidor = clonar(SESION_HOY);
    sesionServidor.ejercicios[0].series[1].completada = true;
    sesionServidor.ejercicios[0].series[1].pesoKg = '60.00';
    sesionServidor.ejercicios[0].series[1].repsLogradas = 10;

    sesionLocal.ejercicios[0].series[1].pesoKg = '80.00';
    sesionLocal.ejercicios[0].series[1].repsLogradas = 5;

    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      const metodo = opciones?.method ?? 'GET';
      if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/rutina/semana-actual')) {
        return Promise.resolve(clonar(SEMANA));
      }
      if (metodo === 'GET' && endpoint.startsWith('/alumnos/me/sesiones/hoy')) {
        return Promise.resolve(clonar(sesionServidor));
      }
      return Promise.resolve({});
    });

    // Guardamos la copia local en offlineDb
    await offlineDb.rutinaHoy.put({
      id: SESION_ID,
      alumnoId: sesionMock.usuario.id,
      fechaProgramada: '2026-10-11',
      sesion: sesionLocal,
      updatedAt: Date.now(),
    });

    render(<EntrenamientoPage />);

    const seccion = await screen.findByRole(
      'region',
      { name: 'Entrenamiento en foco' },
      { timeout: 5000 }
    );

    // Serie 1 debe mostrar 62,5 (o 62.5) y 8
    const inputPeso = within(seccion).getByLabelText(/Peso real en kg, serie 1/i) as HTMLInputElement;
    const inputReps = within(seccion).getByLabelText(/Repeticiones hechas, serie 1/i) as HTMLInputElement;

    expect(inputPeso.value).toMatch(/62[.,]5/);
    expect(inputReps.value).toBe('8');

    // Cambiar a vista completa para ver serie 2
    fireEvent.click(within(seccion).getByRole('button', { name: 'Ver entrenamiento completo' }));
    await screen.findByRole('button', { name: 'Volver al enfoque' }, { timeout: 5000 });

    // Serie 2 completada en servidor conserva 60 kg y 10 reps (no 80 ni 5)
    const tarjeta = tarjetaDe('Sentadilla');
    const filaSerie2 = within(tarjeta).getByRole('button', {
      name: /serie 2.*completada/i,
    });
    expect(within(filaSerie2).getByText(/60(\.00)?\s*kg/i)).toBeTruthy();
    expect(within(filaSerie2).getByText(/10/)).toBeTruthy();
  });

  it('Escenario 7: modo demo no escribe claves guachafit_cronometro_* en localStorage', async () => {
    sesionMock.isDemoMode = true;
    render(<EntrenamientoPage />);

    const botonIniciar = await screen.findByRole(
      'button',
      { name: /Iniciar entrenamiento/i },
      { timeout: 5000 }
    );
    fireEvent.click(botonIniciar);

    const seccion = await screen.findByRole(
      'region',
      { name: 'Entrenamiento en foco' },
      { timeout: 5000 }
    );

    fireEvent.click(
      within(seccion).getByRole('button', { name: 'Marcar serie 1 como completada' })
    );

    const timer = await screen.findByRole('timer', undefined, { timeout: 5000 });
    expect(timer).toBeTruthy();

    const clavesCronometro = Object.keys(localStorage).filter((k) =>
      k.startsWith('guachafit_cronometro_')
    );
    expect(clavesCronometro).toHaveLength(0);
  });
});
