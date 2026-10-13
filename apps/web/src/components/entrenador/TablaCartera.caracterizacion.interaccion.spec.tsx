// @vitest-environment jsdom
/**
 * Prompt 85 (Ola 3, modulo `tabla-cartera`): caracterizacion del comportamiento
 * ACTUAL de `TablaCartera` en las zonas SIN cobertura del spec existente
 * (`TablaCartera.spec.ts` solo hace render a string, sin interaccion).
 *
 * Fija el comportamiento tal cual esta hoy; si algo parece un bug, se reporta
 * como WARNING en el reporte del modulo.
 *
 * Montaje: render directo del componente presentacional, sin
 * `QueryClientProvider` (el archivo no usa red ni TanStack Query, R9) y sin
 * router (no navega: emite callbacks).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TablaCartera } from './TablaCartera';
import {
  EstadoCuota,
  Moneda,
  MetodoPago,
  type FilaCarteraDTO,
  type PestanaCarteraDTO,
} from '@guachafit/shared';

function fila(parcial: Partial<FilaCarteraDTO> = {}): FilaCarteraDTO {
  return {
    alumnoUsuarioId: 'u-001',
    alumnoPerfilId: 'al-001',
    alumnoNombre: 'Carlos Mendoza',
    proximoCorte: null,
    telefonoWhatsapp: '+584121234567',
    cuotaId: 'cuota-1',
    estadoCuota: EstadoCuota.VENCIDA,
    fechaCorteUtc: '2026-09-09T00:00:00.000Z',
    saldoPendienteUsd: '45.00',
    saldoPendienteBs: null,
    tasaAplicada: null,
    diasAtraso: 12,
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

function montar(
  filas: FilaCarteraDTO[],
  pestana: PestanaCarteraDTO,
  callbacks: {
    onRecordatorio?: (fila: FilaCarteraDTO) => void;
    onCobrar?: (fila: FilaCarteraDTO) => void;
    onVerFicha?: (fila: FilaCarteraDTO) => void;
    onRevisarPago?: (fila: FilaCarteraDTO) => void;
  } = {},
  buscando = false,
) {
  const espias = {
    onRecordatorio: vi.fn(callbacks.onRecordatorio ?? (() => {})),
    onCobrar: vi.fn(callbacks.onCobrar ?? (() => {})),
    onVerFicha: vi.fn(callbacks.onVerFicha ?? (() => {})),
    onRevisarPago: vi.fn(callbacks.onRevisarPago ?? (() => {})),
  };
  render(
    <TablaCartera
      pestana={pestana}
      filas={filas}
      buscando={buscando}
      onRecordatorio={espias.onRecordatorio}
      onCobrar={espias.onCobrar}
      onVerFicha={espias.onVerFicha}
      onRevisarPago={espias.onRevisarPago}
    />,
  );
  return espias;
}

afterEach(() => {
  cleanup();
});

describe('TablaCartera · caracterizacion de interaccion (prompt 85)', () => {
  it('C1 · vacio honesto por pestana con su titulo', () => {
    const casos: Array<[PestanaCarteraDTO, string]> = [
      ['mora', 'Sin cuotas vencidas'],
      ['por_vencer', 'Sin vencimientos próximos'],
      ['revision', 'Sin pagos por validar'],
      ['al_dia', 'Sin cuotas cubiertas en el ciclo'],
    ];
    for (const [pestana, titulo] of casos) {
      montar([], pestana);
      expect(screen.getByRole('heading', { name: titulo })).toBeTruthy();
      cleanup();
    }
  });

  it('C2 · con busqueda activa el vacio es "Sin resultados"', () => {
    montar([], 'mora', {}, true);
    expect(screen.getByRole('heading', { name: 'Sin resultados' })).toBeTruthy();
    expect(screen.queryByText('Sin cuotas vencidas')).toBeNull();
  });

  it('C3 · clic en "Recordatorio" llama a onRecordatorio con la fila (escritorio y movil)', () => {
    const esperada = fila();
    const espias = montar([esperada], 'mora');
    const botones = screen.getAllByRole('button', { name: 'Recordatorio' });
    // La tabla de escritorio y la tarjeta movil renderizan el mismo boton.
    expect(botones).toHaveLength(2);
    fireEvent.click(botones[0]);
    expect(espias.onRecordatorio).toHaveBeenCalledTimes(1);
    expect(espias.onRecordatorio).toHaveBeenCalledWith(esperada);
  });

  it('C4 · clic en "Registrar cobro" llama a onCobrar con la fila', () => {
    const esperada = fila();
    const espias = montar([esperada], 'mora');
    const botones = screen.getAllByRole('button', { name: 'Registrar cobro' });
    expect(botones).toHaveLength(2);
    fireEvent.click(botones[0]);
    expect(espias.onCobrar).toHaveBeenCalledTimes(1);
    expect(espias.onCobrar).toHaveBeenCalledWith(esperada);
  });

  it('C5 · clic en "Ver ficha" llama a onVerFicha con la fila', () => {
    const esperada = fila();
    const espias = montar([esperada], 'mora');
    const botones = screen.getAllByRole('button', { name: 'Ver ficha' });
    expect(botones).toHaveLength(2);
    fireEvent.click(botones[0]);
    expect(espias.onVerFicha).toHaveBeenCalledTimes(1);
    expect(espias.onVerFicha).toHaveBeenCalledWith(esperada);
  });

  it('C6 · sin alumnoPerfilId el boton "Ver ficha" esta deshabilitado', () => {
    const espias = montar([fila({ alumnoPerfilId: null })], 'mora');
    const botones = screen.getAllByRole('button', { name: 'Ver ficha' });
    expect(botones).toHaveLength(2);
    for (const boton of botones) {
      expect((boton as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.click(botones[0]);
    expect(espias.onVerFicha).not.toHaveBeenCalled();
  });

  it('C7 · en revision solo existe "Revisar en bandeja" y llama a onRevisarPago', () => {
    const esperada = fila({
      estadoCuota: null,
      cuotaId: 'cuota-2',
      pagoId: 'tx-1',
      montoReportado: '1950.00',
      monedaOriginal: Moneda.VES,
      metodoPago: MetodoPago.PAGO_MOVIL,
      referenciaBancaria: '445566',
      fechaReporteUtc: '2026-09-20T12:00:00.000Z',
      diasEspera: 1,
    });
    const espias = montar([esperada], 'revision');
    const botones = screen.getAllByRole('button', { name: 'Revisar en bandeja' });
    expect(botones).toHaveLength(2);
    fireEvent.click(botones[0]);
    expect(espias.onRevisarPago).toHaveBeenCalledTimes(1);
    expect(espias.onRevisarPago).toHaveBeenCalledWith(esperada);
    expect(screen.queryByRole('button', { name: 'Registrar cobro' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recordatorio' })).toBeNull();
  });

  it('C8 · sin saldo pendiente no hay "Registrar cobro" aunque haya "Recordatorio"', () => {
    montar([fila({ saldoPendienteUsd: '0.00' })], 'mora');
    expect(screen.queryByRole('button', { name: 'Registrar cobro' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Recordatorio' })).toHaveLength(2);
  });

  it('C9 · en al_dia solo existe "Ver ficha" (sin cobranza)', () => {
    montar(
      [
        fila({
          estadoCuota: EstadoCuota.AL_DIA,
          saldoPendienteUsd: '0.00',
          saldoPendienteBs: '0.00',
          planNombre: 'Presencial Completo',
          periodo: '2026-09',
          diasAtraso: null,
        }),
      ],
      'al_dia',
    );
    expect(screen.getAllByRole('button', { name: 'Ver ficha' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Registrar cobro' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recordatorio' })).toBeNull();
  });

  it('C10 · encabezados de la tabla segun la pestana', () => {
    montar([fila()], 'mora');
    const tabla = screen.getByRole('table');
    expect(within(tabla).getByText('Saldo USD')).toBeTruthy();
    expect(within(tabla).getByText('Saldo Bs')).toBeTruthy();
    expect(within(tabla).getByText('Última gestión')).toBeTruthy();
    cleanup();

    montar(
      [
        fila({
          estadoCuota: null,
          pagoId: 'tx-1',
          montoReportado: '1950.00',
          monedaOriginal: Moneda.VES,
        }),
      ],
      'revision',
    );
    const tablaRevision = screen.getByRole('table');
    expect(within(tablaRevision).getByText('Pago reportado')).toBeTruthy();
    expect(within(tablaRevision).getByText('Referencia')).toBeTruthy();
    cleanup();

    montar(
      [
        fila({
          estadoCuota: EstadoCuota.AL_DIA,
          saldoPendienteUsd: '0.00',
          planNombre: 'Presencial Completo',
          periodo: '2026-09',
          diasAtraso: null,
        }),
      ],
      'al_dia',
    );
    const tablaAlDia = screen.getByRole('table');
    expect(within(tablaAlDia).getByText('Plan')).toBeTruthy();
    expect(within(tablaAlDia).getByText('Corte del ciclo')).toBeTruthy();
  });

  it('C11 · comprobante con imagen usa el alt con el nombre; sin URL avisa "Sin captura digital"', () => {
    montar(
      [fila({ pagoId: 'tx-1', comprobanteUrl: 'https://cdn.example/c-1.jpg' })],
      'revision',
    );
    const imagen = screen.getAllByAltText('Comprobante de Carlos Mendoza');
    expect(imagen).toHaveLength(1);
    expect(imagen[0].getAttribute('src')).toBe('https://cdn.example/c-1.jpg');
    cleanup();

    montar([fila({ pagoId: 'tx-1', comprobanteUrl: null })], 'revision');
    expect(screen.getAllByText('Sin captura digital')).toHaveLength(1);
    // Escritorio: celda "Sin referencia" exacta; móvil: combina "método · Sin referencia".
    expect(screen.getAllByText('Sin referencia')).toHaveLength(1);
    expect(screen.getAllByText(/Sin referencia/)).toHaveLength(2);
  });

  it('C12 · telefono y saldo a favor se muestran en la celda del alumno', () => {
    montar([fila({ saldoAFavorUsd: '10.00' })], 'mora');
    expect(screen.getAllByText('+584121234567')).toHaveLength(2);
    expect(screen.getAllByText('A favor: 10.00 USD')).toHaveLength(2);
    cleanup();

    montar([fila({ telefonoWhatsapp: null })], 'mora');
    expect(screen.queryByText('+584121234567')).toBeNull();
  });

  it('C13 · ultima gestion: "Sin recordatorios manuales" sin fecha, "Último:" con fecha', () => {
    montar([fila({ ultimaGestionUtc: null })], 'mora');
    expect(screen.getAllByText('Sin recordatorios manuales')).toHaveLength(2);
    cleanup();

    montar([fila({ ultimaGestionUtc: '2026-09-18T10:00:00.000Z' })], 'mora');
    expect(screen.queryByText('Sin recordatorios manuales')).toBeNull();
    expect(screen.getAllByText(/Último:/)).toHaveLength(2);
  });

  it('C14 · situacion por pestana: dias de atraso, corte y espera', () => {
    montar([fila()], 'mora');
    expect(screen.getAllByText('12 días de atraso')).toHaveLength(2);
    expect(screen.getAllByText('Vencida')).toHaveLength(2);
    cleanup();

    montar(
      [
        fila({
          estadoCuota: EstadoCuota.POR_VENCER,
          diasAtraso: null,
          diasRestantes: 2,
          fechaCorteUtc: '2026-09-23T00:00:00.000Z',
        }),
      ],
      'por_vencer',
    );
    expect(screen.getAllByText('Vence en 2 días')).toHaveLength(2);
    expect(screen.getAllByText(/Corte:/)).toHaveLength(2);
    cleanup();

    montar(
      [
        fila({
          estadoCuota: null,
          pagoId: 'tx-1',
          diasEspera: 3,
          fechaReporteUtc: '2026-09-20T12:00:00.000Z',
        }),
      ],
      'revision',
    );
    expect(screen.getAllByText('3 días esperando')).toHaveLength(2);
    expect(screen.getAllByText('Pago en revisión')).toHaveLength(2);
  });
});
