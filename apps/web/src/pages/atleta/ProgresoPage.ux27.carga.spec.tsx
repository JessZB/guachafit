// @vitest-environment jsdom
/**
 * UX-27: Tests RED para PRO-01 (carga honesta de la evolución corporal).
 *
 * Contratos:
 * - Spinner agresivo: el spinner de pantalla completa solo debe mostrarse en la primera carga.
 * - Al recargar (con datos ya en memoria), NO debe renderizarse EstadoCarga bloqueando la vista.
 * - Si la recarga falla, debe mostrarse AvisoErrorEvolucion conservando los datos existentes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

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
  useCheckinAntropometrico: () => ({
    accesoPresencialServidor: null,
    abrirFormularioCheckin: vi.fn(),
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
  HubProgreso: ({ evolucion }: any) => (
    <div data-testid="hub-progreso">
      {evolucion ? <span data-testid="datos-evolucion">Datos presentes</span> : 'Sin datos'}
    </div>
  ),
}));

vi.mock('../../components/atleta/progreso/FormularioCheckinAntropometrico', () => ({
  FormularioCheckinAntropometrico: () => <div data-testid="formulario-checkin" />,
}));

vi.mock('../../components/common/AvisoDatosOffline', () => ({
  AvisoDatosOffline: () => <div data-testid="aviso-offline" />,
}));

vi.mock('../../components/atleta/progreso/AvisoErrorEvolucion', () => ({
  AvisoErrorEvolucion: ({ mensaje }: { mensaje: string }) => (
    <div data-testid="aviso-error-evolucion">{mensaje}</div>
  ),
}));

vi.mock('../../components/atleta/progreso/EncabezadoSeccionProgreso', () => ({
  EncabezadoSeccionProgreso: ({ variante }: { variante: string }) => (
    <div data-testid={`encabezado-${variante}`} />
  ),
}));

import { ProgresoPage } from './ProgresoPage';

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

describe('ProgresoPage — PRO-01: carga honesta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('muestra spinner solo en primera carga (sin datos previos)', () => {
    mockUseEvolucionProgreso.mockReturnValue({
      evolucion: null,
      isLoading: true,
      error: null,
      fotosConError: [],
      setFotosConError: vi.fn(),
      setEvolucion: vi.fn(),
      cargarEvolucion: vi.fn(),
    });

    render(<ProgresoPage />);

    expect(screen.getByTestId('estado-carga')).not.toBeNull();
    expect(screen.queryByTestId('hub-progreso')).toBeNull();
  });

  it('NO muestra spinner al recargar si ya hay evolución cargada', () => {
    mockUseEvolucionProgreso.mockReturnValue({
      evolucion: mockEvolucion,
      isLoading: true,
      error: null,
      fotosConError: [],
      setFotosConError: vi.fn(),
      setEvolucion: vi.fn(),
      cargarEvolucion: vi.fn(),
    });

    render(<ProgresoPage />);

    // FALLA: ProgresoPage.tsx:97 hace `if (isLoading) return <EstadoCarga />` incondicionalmente,
    // ocultando la interfaz incluso cuando ya existen datos de evolución previos
    expect(screen.queryByTestId('estado-carga')).toBeNull();
    expect(screen.getByTestId('hub-progreso')).not.toBeNull();
    expect(screen.getByTestId('datos-evolucion')).not.toBeNull();
  });

  it('muestra AvisoErrorEvolucion y conserva los datos al fallar la recarga', () => {
    mockUseEvolucionProgreso.mockReturnValue({
      evolucion: mockEvolucion,
      isLoading: false,
      error: 'Fallo al actualizar evolución',
      fotosConError: [],
      setFotosConError: vi.fn(),
      setEvolucion: vi.fn(),
      cargarEvolucion: vi.fn(),
    });

    render(<ProgresoPage />);

    expect(screen.getByTestId('aviso-error-evolucion')).not.toBeNull();
    expect(screen.getByText('Fallo al actualizar evolución')).not.toBeNull();
    expect(screen.getByTestId('hub-progreso')).not.toBeNull();
    expect(screen.getByTestId('datos-evolucion')).not.toBeNull();
  });
});
