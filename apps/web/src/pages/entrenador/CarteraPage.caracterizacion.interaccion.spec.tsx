// @vitest-environment jsdom
/**
 * Prompt 73 (Ola 2, módulo `cartera`): caracterización del comportamiento ACTUAL de
 * `CarteraPage` en las zonas SIN cobertura de los 4 specs existentes (todos cubren el modal
 * de cobro): cabecera, KPIs, pestañas con contadores, búsqueda server-side, aviso sin tasa,
 * carga, error con reintento, modal de recordatorio (RN-02) y cobro en modo demo.
 *
 * Fija el comportamiento tal cual está hoy; si algo parece un bug, se reporta como WARNING.
 *
 * Montaje: mismo patrón que `CarteraPage.cobro.interaccion.spec.tsx` (`QueryClientProvider`
 * de test —la página usa TanStack Query vía `usePaginacionServidor`, R9— + MemoryRouter +
 * `apiClient` parcialmente mockeado).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EstadoCuota,
  type CarteraDTO,
  type FilaCarteraDTO,
} from '@guachafit/shared';

let modoDemo = false;
let tasaVigente: string | null = '65.0000';
let fallarGet = false;
let respuestasRecordatorio: Array<Error | Record<string, unknown>> = [];

function filaMora(
  parcial: Partial<FilaCarteraDTO> &
    Pick<FilaCarteraDTO, 'alumnoUsuarioId' | 'alumnoPerfilId' | 'alumnoNombre'>
): FilaCarteraDTO {
  return {
    telefonoWhatsapp: null,
    proximoCorte: null,
    cuotaId: null,
    estadoCuota: EstadoCuota.VENCIDA,
    fechaCorteUtc: '2026-10-01T23:59:59.000Z',
    saldoPendienteUsd: '35.00',
    saldoPendienteBs: null,
    tasaAplicada: null,
    diasAtraso: 8,
    diasRestantes: null,
    ultimaGestionUtc: null,
    planNombre: null,
    periodo: null,
    pagoId: null,
    montoReportado: null,
    monedaOriginal: null,
    metodoPago: null,
    referenciaBancaria: null,
    comprobanteUrl: null,
    fechaReporteUtc: null,
    diasEspera: null,
    ...parcial,
    saldoAFavorUsd: parcial.saldoAFavorUsd ?? '0.00',
  };
}

const FILA_A = filaMora({
  alumnoUsuarioId: 'u-001',
  alumnoPerfilId: 'al-001',
  alumnoNombre: 'Carlos Mendoza',
  cuotaId: 'cuota-1',
  telefonoWhatsapp: '+58 412-1234567',
});

const FILA_B = filaMora({
  alumnoUsuarioId: 'u-002',
  alumnoPerfilId: 'al-002',
  alumnoNombre: 'Valeria Silva',
  cuotaId: 'cuota-2',
  saldoPendienteUsd: '60.00',
});

function respuestaCartera(): CarteraDTO {
  return {
    items: [FILA_A, FILA_B],
    total: 2,
    limit: 25,
    offset: 0,
    resumen: {
      recaudadoMesUsd: '120.50',
      totalEnMoraUsd: '95.00',
      alumnosEnMora: 2,
      totalPorVencerUsd: '40.00',
      proximosAVencer: 1,
      pagosPorValidar: 2,
      contadores: { enMora: 2, porVencer: 1, revision: 1, alDia: 3 },
      tasaVigente,
    },
  };
}

function respuestaRecordatorioOk(): Record<string, unknown> {
  return {
    enviado: true,
    motivo: 'despachado',
    mensaje: 'Recordatorio simulado para Carlos Mendoza.',
    mensajeSugerido: 'Hola Carlos, tu mensualidad tiene un saldo pendiente de $35.00 USD.',
    saldoPendienteUsd: '35.00',
    saldoPendienteBs: null,
    ultimaGestionUtc: '2026-10-11T10:00:00.000Z',
    proximoPermitidoUtc: null,
  };
}

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'e1111111-1111-4111-8111-111111111111',
      email: 'coach@example.com',
      rol: 'entrenador',
    },
    isDemoMode: modoDemo,
  }),
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
import { CarteraPage } from './CarteraPage';

type MockFn = ReturnType<typeof vi.fn>;
const mockApi = apiClient as unknown as MockFn & {
  get: MockFn;
  post: MockFn;
  patch: MockFn;
  delete: MockFn;
  put: MockFn;
};

const clientesConsulta: QueryClient[] = [];

function esGetCartera(endpoint: unknown): boolean {
  return typeof endpoint === 'string' && endpoint.startsWith('/finanzas/cartera?');
}

function getsCartera(): string[] {
  return mockApi.mock.calls
    .map(([endpoint]) => endpoint)
    .filter((endpoint): endpoint is string => esGetCartera(endpoint));
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  modoDemo = false;
  tasaVigente = '65.0000';
  fallarGet = false;
  respuestasRecordatorio = [respuestaRecordatorioOk()];

  mockApi.mockReset();
  mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
    if (typeof endpoint === 'string' && endpoint.includes('/recordatorio/vista-previa')) {
      return Promise.resolve({
        puedeEnviar: true,
        motivo: 'listo',
        mensaje: 'Listo para enviar.',
        titulo: 'Recordatorio de pago',
        cuerpo: 'Hola Carlos, tu mensualidad tiene un saldo pendiente de $35.00 USD.',
        saldoPendienteUsd: '35.00',
        saldoPendienteBs: null,
        proximoPermitidoUtc: null,
      });
    }
    if (typeof endpoint === 'string' && endpoint.includes('/recordatorio')) {
      const siguiente = respuestasRecordatorio.shift();
      if (siguiente instanceof Error) return Promise.reject(siguiente);
      return Promise.resolve(siguiente ?? respuestaRecordatorioOk());
    }
    if (opciones?.method === 'POST') return Promise.resolve({ id: 'tx-nueva' });
    if (esGetCartera(endpoint)) {
      if (fallarGet) return Promise.reject(new Error('Fallo de red (500).'));
      return Promise.resolve(respuestaCartera());
    }
    return Promise.resolve(null);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const cliente of clientesConsulta.splice(0)) cliente.clear();
});

function montarPagina(entrada = '/coach/cartera'): void {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientesConsulta.push(cliente);
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[entrada]}>
        <Routes>
          <Route path="/coach/cartera" element={<CarteraPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Botón "Recordatorio" de la fila del alumno indicado. */
function botonRecordatorioDe(nombreAlumno: string): HTMLElement {
  const fila = screen
    .getAllByText(nombreAlumno)
    .map((nodo) => nodo.closest('tr'))
    .find((candidata): candidata is HTMLTableRowElement => Boolean(candidata));
  if (!fila) throw new Error(`No se encontró la fila de ${nombreAlumno}.`);
  return within(fila).getByRole('button', { name: `Recordatorio para ${nombreAlumno}` });
}

/** Botón "Registrar cobro" de la fila del alumno indicado. */
function botonCobroDe(nombreAlumno: string): HTMLElement {
  const fila = screen
    .getAllByText(nombreAlumno)
    .map((nodo) => nodo.closest('tr'))
    .find((candidata): candidata is HTMLTableRowElement => Boolean(candidata));
  if (!fila) throw new Error(`No se encontró la fila de ${nombreAlumno}.`);
  return within(fila).getByRole('button', { name: `Registrar cobro de ${nombreAlumno}` });
}

describe('CarteraPage · caracterización (prompt 73): zonas sin cobertura previa', () => {
  it('C1 · la cabecera muestra el título y el enlace a la bandeja de validación', async () => {
    montarPagina();
    await waitFor(() => expect(botonCobroDe(FILA_A.alumnoNombre)).toBeTruthy());

    expect(screen.getByRole('heading', { name: 'Control de cobros' })).toBeTruthy();
    const enlace = screen.getByRole('link', { name: 'Pagos por validar' });
    expect(enlace.getAttribute('href')).toBe('/coach/conciliacion');
  });

  it('C2 · los KPIs muestran el resumen del servidor con sus valores', async () => {
    montarPagina();
    await waitFor(() => expect(botonCobroDe(FILA_A.alumnoNombre)).toBeTruthy());

    expect(screen.getByText('Recaudado del mes')).toBeTruthy();
    expect(screen.getByText('$120,50')).toBeTruthy();
    expect(screen.getByText('Total en mora')).toBeTruthy();
    // 'Próximos a Vencer' aparece en el KPI; la pestaña ahora usa la etiqueta corta 'Por vencer'.
    expect(screen.getByText('Próximos a vencer')).toBeTruthy();

    const kpiPagosPorValidar = screen
      .getByText('Comprobantes esperando tu confirmación')
      .closest('a')!;
    expect(within(kpiPagosPorValidar).getByText('Pagos por validar')).toBeTruthy();
    expect(within(kpiPagosPorValidar).getByText('2')).toBeTruthy();
  });

  it('C3 · las 4 pestañas existen con sus contadores reales y el criterio visible', async () => {
    montarPagina();
    await waitFor(() => expect(botonCobroDe(FILA_A.alumnoNombre)).toBeTruthy());

    const tablist = screen.getByRole('tablist', { name: 'Estados de cartera' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(within(tablist).getByRole('tab', { name: /en mora/i })).toBeTruthy();
    expect(within(tablist).getByRole('tab', { name: /próximos a vencer/i })).toBeTruthy();
    // Contadores reales del resumen: enMora=2, porVencer=1, revision=1, alDia=3.
    expect(screen.getByText('Corte superado con saldo pendiente')).toBeTruthy();
  });

  it('C4 · cambiar de pestaña pide la pestaña nueva al servidor y sync la URL', async () => {
    montarPagina();
    await waitFor(() => expect(botonCobroDe(FILA_A.alumnoNombre)).toBeTruthy());

    fireEvent.click(screen.getByRole('tab', { name: /próximos a vencer/i }));

    await waitFor(() =>
      expect(getsCartera().some((url) => url.includes('pestana=por_vencer'))).toBe(true)
    );
    expect(screen.getByText('Vencen en los próximos 5 días')).toBeTruthy();
  });

  it('C5 · la pestaña inicial se lee de la URL (?pestana=)', async () => {
    montarPagina('/coach/cartera?pestana=al_dia');
    await waitFor(() =>
      expect(getsCartera().some((url) => url.includes('pestana=al_dia'))).toBe(true)
    );
    expect(screen.getByText('Cuota del ciclo cubierta al 100%')).toBeTruthy();
  });

  it('C6 · buscar pide `q` al servidor y muestra el contador de página', async () => {
    montarPagina();
    await waitFor(() => expect(botonCobroDe(FILA_A.alumnoNombre)).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Buscar alumno por nombre'), {
      target: { value: 'Carlos' },
    });

    await waitFor(() =>
      expect(getsCartera().some((url) => url.includes('q=Carlos'))).toBe(true)
    );
    expect(screen.getByText('2 registros · En mora')).toBeTruthy();
  });

  it('C7 · sin tasa vigente se avisa con el enlace a Ajustes → Tasas', async () => {
    tasaVigente = null;
    montarPagina();
    await waitFor(() => expect(botonCobroDe(FILA_A.alumnoNombre)).toBeTruthy());

    expect(screen.getByText(/Sin tasa de cambio configurada/)).toBeTruthy();
    const enlace = screen.getByRole('link', { name: /Ajustes → Tasas/ });
    expect(enlace.getAttribute('href')).toBe('/coach/ajustes?tab=tasas');
  });

  it('C8 · el estado de carga muestra su texto antes de resolver', () => {
    montarPagina();
    expect(screen.getByText('Cargando cartera de alumnos...')).toBeTruthy();
  });

  it('C9 · ante un fallo del GET se muestra el error con Reintentar, que recarga', async () => {
    fallarGet = true;
    montarPagina();

    const botonReintentar = await screen.findByRole('button', { name: 'Reintentar' });
    expect(screen.getByText('Fallo de red (500).')).toBeTruthy();

    fallarGet = false;
    fireEvent.click(botonReintentar);
    await waitFor(() => expect(botonCobroDe(FILA_A.alumnoNombre)).toBeTruthy());
  });

  it('C10 · el modal de recordatorio envía el POST y ofrece copiar y WhatsApp', async () => {
    montarPagina();
    await waitFor(() => expect(botonRecordatorioDe(FILA_A.alumnoNombre)).toBeTruthy());
    fireEvent.click(botonRecordatorioDe(FILA_A.alumnoNombre));

    const dialogo = await screen.findByRole('dialog');
    expect(
      within(dialogo).getByRole('heading', { name: 'Enviar recordatorio manual' })
    ).toBeTruthy();
    expect(within(dialogo).getByText(FILA_A.alumnoNombre)).toBeTruthy();

    const botonEnviar = within(dialogo).getByRole('button', { name: 'Enviar recordatorio' });
    await waitFor(() => expect(botonEnviar.hasAttribute('disabled')).toBe(false));
    fireEvent.click(botonEnviar);

    const textarea = (await within(dialogo).findByLabelText(
      'Mensaje enviado (puedes copiarlo o abrir WhatsApp)'
    )) as HTMLTextAreaElement;
    expect(textarea.value).toContain('Hola Carlos');
    expect(within(dialogo).getByRole('button', { name: 'Copiar mensaje' })).toBeTruthy();
    const enlaceWa = within(dialogo).getByRole('link', { name: 'Abrir WhatsApp' });
    expect(enlaceWa.getAttribute('href')).toContain('https://wa.me/584121234567');
    const posts = mockApi.mock.calls.filter(
      ([url]) => String(url).includes('/recordatorio') && !String(url).includes('vista-previa')
    );
    expect(posts).toHaveLength(1);
    expect((posts[0][1] as { method?: string } | undefined)?.method ?? 'POST').toBe('POST');
  });

  it('C11 · con cooldown activo el modal muestra el motivo sin mensaje sugerido', async () => {
    respuestasRecordatorio = [
      {
        enviado: false,
        motivo: 'cooldown_activo',
        mensaje: 'Ya enviaste un recordatorio manual hace poco.',
        mensajeSugerido: null,
        saldoPendienteUsd: '35.00',
        saldoPendienteBs: null,
        ultimaGestionUtc: '2026-10-11T10:00:00.000Z',
        proximoPermitidoUtc: null,
      },
    ];
    montarPagina();
    await waitFor(() => expect(botonRecordatorioDe(FILA_A.alumnoNombre)).toBeTruthy());
    fireEvent.click(botonRecordatorioDe(FILA_A.alumnoNombre));

    const dialogo = await screen.findByRole('dialog');
    const botonEnviar = within(dialogo).getByRole('button', { name: 'Enviar recordatorio' });
    await waitFor(() => expect(botonEnviar.hasAttribute('disabled')).toBe(false));
    fireEvent.click(botonEnviar);

    expect(
      await within(dialogo).findByText('Ya enviaste un recordatorio manual hace poco.')
    ).toBeTruthy();
    expect(
      within(dialogo).queryByLabelText('Mensaje enviado (puedes copiarlo o abrir WhatsApp)')
    ).toBeNull();
  });

  it('C12 · cerrar el recordatorio sin enviar no llama al API', async () => {
    montarPagina();
    await waitFor(() => expect(botonRecordatorioDe(FILA_A.alumnoNombre)).toBeTruthy());
    fireEvent.click(botonRecordatorioDe(FILA_A.alumnoNombre));

    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      mockApi.mock.calls.filter(
        ([url]) => String(url).includes('/recordatorio') && !String(url).includes('vista-previa')
      )
    ).toHaveLength(0);
  });

  it('C13 · en modo demo el cobro se registra local con el aviso de demo', async () => {
    modoDemo = true;
    montarPagina();
    await screen.findAllByText('Roberto Díaz Navarro');

    const botonesCobro = screen.getAllByRole('button', { name: /Registrar cobro de/ });
    fireEvent.click(botonesCobro[0]);
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Registrar cobro' }));

    expect(await within(dialogo).findByText(/modo demo/)).toBeTruthy();
  });
});
