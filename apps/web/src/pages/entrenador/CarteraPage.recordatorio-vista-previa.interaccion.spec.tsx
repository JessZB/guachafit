// @vitest-environment jsdom
/**
 * 01 · UX-09b · CarteraPage: recordatorio con vista previa y navegación a conciliación (Contratos A1–A7 y C1).
 *
 * A1: Sin N+1 al cargar; exactamente un GET a /finanzas/cartera/clientes/:id/recordatorio/vista-previa al abrir.
 * A2: Listo: textbox "Mensaje que se enviará" con valor y readOnly; botón "Enviar recordatorio" habilitado hace POST.
 * A3: No se puede enviar: mensaje visible, botón disabled, no textbox de envío, click no hace POST.
 * A4: Error y reintento: role="alert" con mensaje de error, botón Reintentar hace segundo GET que habilita el envío.
 * A5: Cargando: mientras GET no resuelve hay role="status" con "Preparando el mensaje" y botón disabled.
 * A6: Respuesta obsoleta: abrir (GET 1 diferido), cancelar, abrir (GET 2 diferido). GET 1 resuelve cooldown_activo (ignorado). GET 2 resuelve listo -> aparece su cuerpo.
 * A7: Tras enviar: muestra "Mensaje enviado (puedes copiarlo o abrir WhatsApp)" con mensajeSugerido y botón enviar desaparece.
 * C1: Revisar en bandeja: al pulsar botón en pestaña revisión navega a /coach/conciliacion?q=Carlos%20Mendoza.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  EstadoConciliacion,
  EstadoCuota,
  MetodoPago,
  Moneda,
  type CarteraDTO,
  type FilaCarteraDTO,
  type RecordatorioManualResultadoDTO,
  type VistaPreviaRecordatorioDTO,
} from '@guachafit/shared';

function filaMora(parcial: Partial<FilaCarteraDTO> = {}): FilaCarteraDTO {
  return {
    alumnoUsuarioId: 'u-001',
    alumnoPerfilId: 'al-001',
    alumnoNombre: 'Carlos Mendoza',
    cuotaId: 'cuota-1',
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
    telefonoWhatsapp: '+58 412-1234567',
    proximoCorte: null,
    saldoAFavorUsd: '0.00',
    ...parcial,
  };
}

function filaRevision(parcial: Partial<FilaCarteraDTO> = {}): FilaCarteraDTO {
  return {
    ...filaMora(),
    estadoCuota: EstadoCuota.PENDIENTE_REVISION,
    pagoId: 'pago-1',
    montoReportado: '35.00',
    monedaOriginal: Moneda.VES,
    metodoPago: MetodoPago.PAGO_MOVIL,
    referenciaBancaria: 'REF-9988',
    diasEspera: 1,
    ...parcial,
  };
}

function respuestaCartera(pestana = 'mora'): CarteraDTO {
  const items = pestana === 'revision' ? [filaRevision()] : [filaMora()];
  return {
    items,
    total: items.length,
    limit: 25,
    offset: 0,
    resumen: {
      recaudadoMesUsd: '120.50',
      totalEnMoraUsd: '35.00',
      alumnosEnMora: 1,
      totalPorVencerUsd: '0.00',
      proximosAVencer: 0,
      pagosPorValidar: 1,
      contadores: { enMora: 1, porVencer: 0, revision: 1, alDia: 0 },
      tasaVigente: '65.0000',
    },
  };
}

const authDemo = vi.hoisted(() => ({
  modoDemo: false,
  usuario: {
    id: 'e1111111-1111-4111-8111-111111111111',
    email: 'coach@example.com',
    rol: 'entrenador',
  },
}));

vi.mock('../../context/auth-context', () => ({
  useAuth: () => ({
    user: authDemo.usuario,
    isDemoMode: authDemo.modoDemo,
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

function LocationStub() {
  const location = useLocation();
  return <div data-testid="location-stub">{location.pathname + location.search}</div>;
}

function montarPagina(entrada = '/coach/cartera'): void {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientesConsulta.push(cliente);
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[entrada]}>
        <Routes>
          <Route path="/coach/cartera" element={<CarteraPage />} />
          <Route path="/coach/conciliacion" element={<LocationStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function promesaDiferida<T>() {
  let resolver!: (val: T) => void;
  let rechazar!: (err: any) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
}

describe('Contrato A & C1 · CarteraPage: recordatorio con vista previa y navegación', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    authDemo.modoDemo = false;

    mockApi.mockReset();
    mockApi.get.mockReset();
    mockApi.post.mockReset();

    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (typeof endpoint === 'string' && endpoint.startsWith('/finanzas/cartera?')) {
        const pestanaMatch = endpoint.match(/pestana=([a-z_]+)/);
        const pestana = pestanaMatch ? pestanaMatch[1] : 'mora';
        return Promise.resolve(respuestaCartera(pestana));
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

  it('A1 · sin N+1 al cargar; exactamente un GET vista-previa al abrir modal', async () => {
    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (typeof endpoint === 'string' && endpoint.startsWith('/finanzas/cartera?')) {
        return Promise.resolve(respuestaCartera('mora'));
      }
      if (typeof endpoint === 'string' && endpoint.includes('/recordatorio/vista-previa')) {
        const res: VistaPreviaRecordatorioDTO = {
          puedeEnviar: true,
          motivo: 'listo',
          mensaje: 'Listo.',
          titulo: 'Recordatorio',
          cuerpo: 'Mensaje vista previa',
          saldoPendienteUsd: '35.00',
          saldoPendienteBs: null,
          proximoPermitidoUtc: null,
        };
        return Promise.resolve(res);
      }
      return Promise.resolve(null);
    });

    montarPagina('/coach/cartera');

    await screen.findAllByText('Carlos Mendoza');

    // Al cargar no hay ninguna llamada a vista-previa
    const llamadasPrevias = mockApi.mock.calls.filter(([url]) =>
      String(url).includes('vista-previa')
    );
    expect(llamadasPrevias).toHaveLength(0);

    const botonRecordatorio = await screen.findByRole('button', {
      name: 'Recordatorio para Carlos Mendoza',
    });
    fireEvent.click(botonRecordatorio);

    await screen.findByRole('dialog');

    // Se llama exactamente una vez al GET vista-previa sin method: 'POST'
    const llamadasVistaPrevia = mockApi.mock.calls.filter(([url]) =>
      String(url).includes('/finanzas/cartera/clientes/u-001/recordatorio/vista-previa')
    );
    expect(llamadasVistaPrevia).toHaveLength(1);
    const [, opts] = llamadasVistaPrevia[0];
    expect(opts?.method).toBeUndefined();
  });

  it('A2 · listo: muestra textbox "Mensaje que se enviará" con readOnly y valor; enviar hace POST', async () => {
    const vistaPreviaOk: VistaPreviaRecordatorioDTO = {
      puedeEnviar: true,
      motivo: 'listo',
      mensaje: 'Listo para enviar.',
      titulo: 'Recordatorio de pago',
      cuerpo: 'Hola Carlos, tienes $50,00 USD pendientes.',
      saldoPendienteUsd: '50.00',
      saldoPendienteBs: null,
      proximoPermitidoUtc: null,
    };

    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (typeof endpoint === 'string' && endpoint.startsWith('/finanzas/cartera?')) {
        return Promise.resolve(respuestaCartera('mora'));
      }
      if (typeof endpoint === 'string' && endpoint.includes('/recordatorio/vista-previa')) {
        return Promise.resolve(vistaPreviaOk);
      }
      if (opciones?.method === 'POST' && typeof endpoint === 'string' && endpoint.includes('/recordatorio')) {
        const postRes: RecordatorioManualResultadoDTO = {
          enviado: true,
          motivo: 'despachado',
          mensaje: 'Recordatorio enviado.',
          mensajeSugerido: 'Hola Carlos, tienes $50,00 USD pendientes.',
          saldoPendienteUsd: '50.00',
          saldoPendienteBs: null,
          ultimaGestionUtc: new Date().toISOString(),
          proximoPermitidoUtc: null,
        };
        return Promise.resolve(postRes);
      }
      return Promise.resolve(null);
    });

    montarPagina('/coach/cartera');

    fireEvent.click(await screen.findByRole('button', { name: 'Recordatorio para Carlos Mendoza' }));
    const dialogo = await screen.findByRole('dialog');

    const textarea = (await within(dialogo).findByLabelText('Mensaje que se enviará')) as HTMLTextAreaElement;
    expect(textarea.readOnly).toBe(true);
    expect(textarea.value).toBe('Hola Carlos, tienes $50,00 USD pendientes.');

    const botonEnviar = within(dialogo).getByRole('button', { name: 'Enviar recordatorio' });
    expect(botonEnviar.hasAttribute('disabled')).toBe(false);

    fireEvent.click(botonEnviar);

    await waitFor(() => {
      const posts = mockApi.mock.calls.filter(
        ([url, opts]) =>
          String(url) === '/finanzas/cartera/clientes/u-001/recordatorio' &&
          opts?.method === 'POST'
      );
      expect(posts).toHaveLength(1);
    });
  });

  it('A3 · no se puede enviar: mensaje visible, botón enviar disabled, no hay textbox de envío ni POST al pulsar', async () => {
    const vistaPreviaBloqueada: VistaPreviaRecordatorioDTO = {
      puedeEnviar: false,
      motivo: 'cooldown_activo',
      mensaje: 'Ya enviaste un recordatorio hace poco.',
      titulo: null,
      cuerpo: null,
      saldoPendienteUsd: '35.00',
      saldoPendienteBs: null,
      proximoPermitidoUtc: new Date(Date.now() + 3600000).toISOString(),
    };

    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (typeof endpoint === 'string' && endpoint.startsWith('/finanzas/cartera?')) {
        return Promise.resolve(respuestaCartera('mora'));
      }
      if (typeof endpoint === 'string' && endpoint.includes('/recordatorio/vista-previa')) {
        return Promise.resolve(vistaPreviaBloqueada);
      }
      return Promise.resolve(null);
    });

    montarPagina('/coach/cartera');

    fireEvent.click(await screen.findByRole('button', { name: 'Recordatorio para Carlos Mendoza' }));
    const dialogo = await screen.findByRole('dialog');

    expect(await within(dialogo).findByText('Ya enviaste un recordatorio hace poco.')).toBeTruthy();

    const botonEnviar = within(dialogo).getByRole('button', { name: 'Enviar recordatorio' });
    expect(botonEnviar.hasAttribute('disabled')).toBe(true);
    expect(within(dialogo).queryByLabelText('Mensaje que se enviará')).toBeNull();

    fireEvent.click(botonEnviar);

    const posts = mockApi.mock.calls.filter(([, opts]) => opts?.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  it('A4 · error y reintento: error muestra role="alert", botón Reintentar llama al GET y si resuelve habilita envío', async () => {
    let llamadasGet = 0;
    mockApi.mockImplementation((endpoint: string) => {
      if (typeof endpoint === 'string' && endpoint.startsWith('/finanzas/cartera?')) {
        return Promise.resolve(respuestaCartera('mora'));
      }
      if (typeof endpoint === 'string' && endpoint.includes('/recordatorio/vista-previa')) {
        llamadasGet++;
        if (llamadasGet === 1) {
          return Promise.reject(new Error('Sin conexión'));
        }
        const ok: VistaPreviaRecordatorioDTO = {
          puedeEnviar: true,
          motivo: 'listo',
          mensaje: 'Listo.',
          titulo: 'Recordatorio',
          cuerpo: 'Texto recuperado',
          saldoPendienteUsd: '35.00',
          saldoPendienteBs: null,
          proximoPermitidoUtc: null,
        };
        return Promise.resolve(ok);
      }
      return Promise.resolve(null);
    });

    montarPagina('/coach/cartera');

    fireEvent.click(await screen.findByRole('button', { name: 'Recordatorio para Carlos Mendoza' }));
    const dialogo = await screen.findByRole('dialog');

    const alerta = await within(dialogo).findByRole('alert');
    expect(alerta.textContent).toContain('Sin conexión');

    const botonEnviar = within(dialogo).getByRole('button', { name: 'Enviar recordatorio' });
    expect(botonEnviar.hasAttribute('disabled')).toBe(true);

    const botonReintentar = within(dialogo).getByRole('button', { name: 'Reintentar' });
    fireEvent.click(botonReintentar);

    const textarea = (await within(dialogo).findByLabelText('Mensaje que se enviará')) as HTMLTextAreaElement;
    expect(textarea.value).toBe('Texto recuperado');
    expect(botonEnviar.hasAttribute('disabled')).toBe(false);
  });

  it('A5 · cargando: mientras el GET no resuelve hay role="status" con "Preparando el mensaje" y botón disabled', async () => {
    const diferida = promesaDiferida<VistaPreviaRecordatorioDTO>();

    mockApi.mockImplementation((endpoint: string) => {
      if (typeof endpoint === 'string' && endpoint.startsWith('/finanzas/cartera?')) {
        return Promise.resolve(respuestaCartera('mora'));
      }
      if (typeof endpoint === 'string' && endpoint.includes('/recordatorio/vista-previa')) {
        return diferida.promesa;
      }
      return Promise.resolve(null);
    });

    montarPagina('/coach/cartera');

    fireEvent.click(await screen.findByRole('button', { name: 'Recordatorio para Carlos Mendoza' }));
    const dialogo = await screen.findByRole('dialog');

    const status = within(dialogo).getByRole('status');
    expect(status.textContent).toContain('Preparando el mensaje');

    const botonEnviar = within(dialogo).getByRole('button', { name: 'Enviar recordatorio' });
    expect(botonEnviar.hasAttribute('disabled')).toBe(true);
  });

  it('A6 · respuesta obsoleta: cancelar y volver a abrir ignora respuesta de la primera petición', async () => {
    const def1 = promesaDiferida<VistaPreviaRecordatorioDTO>();
    const def2 = promesaDiferida<VistaPreviaRecordatorioDTO>();
    let conteo = 0;

    mockApi.mockImplementation((endpoint: string) => {
      if (typeof endpoint === 'string' && endpoint.startsWith('/finanzas/cartera?')) {
        return Promise.resolve(respuestaCartera('mora'));
      }
      if (typeof endpoint === 'string' && endpoint.includes('/recordatorio/vista-previa')) {
        conteo++;
        return conteo === 1 ? def1.promesa : def2.promesa;
      }
      return Promise.resolve(null);
    });

    montarPagina('/coach/cartera');

    // 1. Abrir modal -> se dispara GET 1
    fireEvent.click(await screen.findByRole('button', { name: 'Recordatorio para Carlos Mendoza' }));
    let dialogo = await screen.findByRole('dialog');

    // 2. Cerrar con Cancelar
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // 3. Volver a abrir -> se dispara GET 2
    fireEvent.click(screen.getByRole('button', { name: 'Recordatorio para Carlos Mendoza' }));
    dialogo = await screen.findByRole('dialog');

    // 4. Resolver GET 1 con cooldown_activo (obsoleto)
    def1.resolver({
      puedeEnviar: false,
      motivo: 'cooldown_activo',
      mensaje: 'Ya enviaste un recordatorio hace poco.',
      titulo: null,
      cuerpo: null,
      saldoPendienteUsd: '35.00',
      saldoPendienteBs: null,
      proximoPermitidoUtc: null,
    });

    await waitFor(() => {
      // Sigue mostrando cargando y NO el mensaje del cooldown
      expect(within(dialogo).getByRole('status').textContent).toContain('Preparando el mensaje');
      expect(within(dialogo).queryByText('Ya enviaste un recordatorio hace poco.')).toBeNull();
    });

    // 5. Resolver GET 2 con listo
    def2.resolver({
      puedeEnviar: true,
      motivo: 'listo',
      mensaje: 'Listo.',
      titulo: 'Recordatorio',
      cuerpo: 'Texto nuevo de GET 2.',
      saldoPendienteUsd: '35.00',
      saldoPendienteBs: null,
      proximoPermitidoUtc: null,
    });

    const textarea = (await within(dialogo).findByLabelText('Mensaje que se enviará')) as HTMLTextAreaElement;
    expect(textarea.value).toBe('Texto nuevo de GET 2.');
  });

  it('A7 · tras enviar: muestra textbox de mensaje enviado con mensajeSugerido y botón enviar desaparece', async () => {
    mockApi.mockImplementation((endpoint: string, opciones?: { method?: string }) => {
      if (typeof endpoint === 'string' && endpoint.startsWith('/finanzas/cartera?')) {
        return Promise.resolve(respuestaCartera('mora'));
      }
      if (typeof endpoint === 'string' && endpoint.includes('/recordatorio/vista-previa')) {
        return Promise.resolve({
          puedeEnviar: true,
          motivo: 'listo',
          mensaje: 'Listo.',
          titulo: 'Recordatorio',
          cuerpo: 'Cuerpo original de vista previa.',
          saldoPendienteUsd: '35.00',
          saldoPendienteBs: null,
          proximoPermitidoUtc: null,
        });
      }
      if (opciones?.method === 'POST' && typeof endpoint === 'string' && endpoint.includes('/recordatorio')) {
        return Promise.resolve({
          enviado: true,
          motivo: 'despachado',
          mensaje: 'Recordatorio despachado.',
          mensajeSugerido: 'Texto real enviado.',
          saldoPendienteUsd: '35.00',
          saldoPendienteBs: null,
          ultimaGestionUtc: new Date().toISOString(),
          proximoPermitidoUtc: null,
        });
      }
      return Promise.resolve(null);
    });

    montarPagina('/coach/cartera');

    fireEvent.click(await screen.findByRole('button', { name: 'Recordatorio para Carlos Mendoza' }));
    const dialogo = await screen.findByRole('dialog');

    // Primero verificamos que exista el textbox "Mensaje que se enviará" del contrato de vista previa
    const textareaPrevio = (await within(dialogo).findByLabelText('Mensaje que se enviará')) as HTMLTextAreaElement;
    expect(textareaPrevio.value).toBe('Cuerpo original de vista previa.');

    const botonEnviar = within(dialogo).getByRole('button', { name: 'Enviar recordatorio' });
    fireEvent.click(botonEnviar);

    const textareaEnviado = (await within(dialogo).findByLabelText(
      'Mensaje enviado (puedes copiarlo o abrir WhatsApp)'
    )) as HTMLTextAreaElement;
    expect(textareaEnviado.value).toBe('Texto real enviado.');
    expect(within(dialogo).queryByRole('button', { name: 'Enviar recordatorio' })).toBeNull();
  });

  it('C1 · CarteraPage: al pulsar "Revisar en bandeja el pago de Carlos Mendoza" navega a /coach/conciliacion?q=Carlos%20Mendoza', async () => {
    montarPagina('/coach/cartera?pestana=revision');

    const botonesRevisar = await screen.findAllByRole('button', {
      name: 'Revisar en bandeja el pago de Carlos Mendoza',
    });
    fireEvent.click(botonesRevisar[0]);

    const stub = await screen.findByTestId('location-stub');
    expect(stub.textContent).toBe('/coach/conciliacion?q=Carlos%20Mendoza');
  });
});
