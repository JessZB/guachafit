// @vitest-environment jsdom
/**
 * UX-27: Tests RED para PRO-05 (sincronización de vistaActiva con searchParams de la URL).
 *
 * Contratos:
 * - La vista inicial 'hub' se refleja sin param o con ?vista=hub.
 * - Navegar a 'nuevo' actualiza la URL a ?vista=nuevo.
 * - Navegar a 'evolucion' actualiza la URL a ?vista=evolucion.
 * - Presionar Back en el browser restaura la vista previa reflejada en la URL.
 * - Cargar directamente con ?vista=evolucion o ?vista=nuevo monta la vista correspondiente.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation } from 'react-router-dom';

const mockUseEvolucionProgreso = vi.fn();
vi.mock('../../components/atleta/progreso/use-evolucion-progreso', () => ({
  useEvolucionProgreso: () => mockUseEvolucionProgreso(),
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'u1', nombre: 'Test', email: 'test@example.com', rol: 'alumno' },
    isDemoMode: false,
  }),
}));

vi.mock('../../components/atleta/progreso/use-contexto-antropometrico', () => ({
  useContextoAntropometrico: () => ({
    esSoloLectura: false,
    estadoVentana: { aplica: false, permiteRegistrar: true },
    motivoRegistroBloqueado: null,
    escenarioDemo: 'normal',
    setEscenarioDemo: vi.fn(),
  }),
}));

vi.mock('../../components/atleta/progreso/use-checkin-antropometrico', () => ({
  useCheckinAntropometrico: (options: any) => ({
    accesoPresencialServidor: null,
    abrirFormularioCheckin: () => options.onAbrirFormulario?.(),
    reiniciarEstadoEnvio: vi.fn(),
    medidas: {},
    actualizarMedida: vi.fn(),
    erroresMedidas: {},
    intentoEnvio: false,
    isSubmitting: false,
    submitError: null,
    submitSuccess: false,
    fotosCheckin: { subiendo: false },
    claveFotos: 'k1',
    setFotosCheckin: vi.fn(),
    handleSubmitCheckin: vi.fn(),
  }),
}));

vi.mock('../../lib/api-client', () => ({
  resolverUrlApi: vi.fn().mockReturnValue('http://test'),
}));

vi.mock('../../components/ui/EstadoCarga', () => ({
  EstadoCarga: () => <div data-testid="estado-carga">Cargando…</div>,
}));

vi.mock('../../components/atleta/progreso/HubProgreso', () => ({
  HubProgreso: ({ onAbrirFormulario, onVerEvolucion }: any) => (
    <div data-testid="hub-progreso">
      <button data-testid="btn-ir-nuevo" onClick={onAbrirFormulario}>
        Ir a nuevo
      </button>
      <button data-testid="btn-ir-evolucion" onClick={onVerEvolucion}>
        Ir a evolucion
      </button>
    </div>
  ),
}));

vi.mock('../../components/atleta/progreso/FormularioCheckinAntropometrico', () => ({
  FormularioCheckinAntropometrico: () => <div data-testid="formulario-checkin" />,
}));

vi.mock('../../components/atleta/progreso/HistorialEvaluacionesProgreso', () => ({
  HistorialEvaluacionesProgreso: () => <div data-testid="historial-evolucion" />,
}));

vi.mock('../../components/atleta/progreso/EncabezadoSeccionProgreso', () => ({
  EncabezadoSeccionProgreso: ({ variante, onVolver }: any) => (
    <div data-testid={`encabezado-${variante}`}>
      <button data-testid="btn-volver-hub" onClick={onVolver}>
        Volver
      </button>
    </div>
  ),
}));

vi.mock('../../components/common/AvisoDatosOffline', () => ({
  AvisoDatosOffline: () => <div data-testid="aviso-offline" />,
}));

vi.mock('../../components/atleta/progreso/AvisoErrorEvolucion', () => ({
  AvisoErrorEvolucion: () => <div data-testid="aviso-error-evolucion" />,
}));

import { ProgresoPage } from './ProgresoPage';

function UrlActual() {
  const { pathname, search } = useLocation();
  return <p data-testid="url-actual">{`${pathname}${search}`}</p>;
}

const mockEvolucion = {
  alumnoId: 'u1',
  totalEvaluaciones: 1,
  controlesTotal: 1,
  evaluaciones: [
    {
      id: 'ev-1',
      fecha: '2026-03-01',
      pesoKg: 75,
      fotos: [],
    },
  ],
  cambioNetoPesoKg: 0,
  cambioNetoGrasaPorcentaje: null,
  rangoSeleccionado: 'todo',
};

describe('ProgresoPage — PRO-05: vista en URL con searchParams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEvolucionProgreso.mockReturnValue({
      evolucion: mockEvolucion,
      isLoading: false,
      error: null,
      fotosConError: [],
      setFotosConError: vi.fn(),
      setEvolucion: vi.fn(),
      cargarEvolucion: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('la vista "hub" inicial se refleja en ?vista=hub o no hay param', () => {
    render(
      <MemoryRouter initialEntries={['/atleta/progreso']}>
        <ProgresoPage />
        <UrlActual />
      </MemoryRouter>
    );

    expect(screen.getByTestId('hub-progreso')).not.toBeNull();
    const url = screen.getByTestId('url-actual').textContent;
    expect(url === '/atleta/progreso' || url?.includes('vista=hub')).toBe(true);
  });

  it('navegar a "nuevo" actualiza ?vista=nuevo en la URL', () => {
    render(
      <MemoryRouter initialEntries={['/atleta/progreso']}>
        <ProgresoPage />
        <UrlActual />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('btn-ir-nuevo'));

    // FALLA: ProgresoPage.tsx:43 usa useState('hub') sin sincronizar setSearchParams
    expect(screen.getByTestId('url-actual').textContent).toContain('vista=nuevo');
  });

  it('navegar a "evolucion" actualiza ?vista=evolucion en la URL', () => {
    render(
      <MemoryRouter initialEntries={['/atleta/progreso']}>
        <ProgresoPage />
        <UrlActual />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByTestId('btn-ir-evolucion'));

    // FALLA: ProgresoPage.tsx:43 usa useState('hub') sin sincronizar setSearchParams
    expect(screen.getByTestId('url-actual').textContent).toContain('vista=evolucion');
  });

  it('presionar Back del browser restaura la vista anterior desde la URL', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/atleta/progreso',
          element: (
            <>
              <ProgresoPage />
              <UrlActual />
            </>
          ),
        },
      ],
      {
        initialEntries: ['/atleta/progreso?vista=hub', '/atleta/progreso?vista=evolucion'],
        initialIndex: 1,
      }
    );

    render(<RouterProvider router={router} />);

    // Si abrimos directamente en ?vista=evolucion (o llegamos por navegación previa),
    // debe mostrar la vista evolución
    // FALLA: useState('hub') ignora la URL y monta el hub
    expect(screen.queryByTestId('hub-progreso')).toBeNull();
    expect(screen.getByTestId('encabezado-evolucion')).not.toBeNull();

    await act(async () => {
      await router.navigate(-1);
    });

    // Al presionar Back, debe restaurar la vista hub reflejada en la URL
    expect(screen.getByTestId('hub-progreso')).not.toBeNull();
    expect(screen.queryByTestId('encabezado-evolucion')).toBeNull();
  });
});
