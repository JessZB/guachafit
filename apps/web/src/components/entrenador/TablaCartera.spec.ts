/**
 * WU-I: smoke tests de render de la tabla de cartera (sin jsdom, con `react-dom/server`).
 *
 * Comprueban los estados honestos que la UI promete: vacío por pestaña, "sin resultados" con
 * búsqueda activa, saldo en Bs "—" sin tasa y las acciones correctas por fila.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
  };
}

function renderizar(filas: FilaCarteraDTO[], pestana: PestanaCarteraDTO, buscando = false) {
  return renderToStaticMarkup(
    createElement(TablaCartera, {
      pestana,
      filas,
      buscando,
      onRecordatorio: () => {},
      onCobrar: () => {},
      onVerFicha: () => {},
      onRevisarPago: () => {},
    })
  );
}

describe('TablaCartera (WU-I)', () => {
  it('estado vacío honesto por pestaña', () => {
    expect(renderizar([], 'mora')).toContain('Sin cuotas vencidas');
    expect(renderizar([], 'por_vencer')).toContain('Sin vencimientos próximos');
    expect(renderizar([], 'revision')).toContain('Sin pagos por validar');
    expect(renderizar([], 'al_dia')).toContain('Sin cuotas cubiertas en el ciclo');
  });

  it('con búsqueda activa el vacío es "Sin resultados"', () => {
    const html = renderizar([], 'mora', true);
    expect(html).toContain('Sin resultados');
    expect(html).not.toContain('Sin cuotas vencidas');
  });

  it('fila en mora: días de atraso, saldo USD, Bs "—" sin tasa y acciones de cobranza', () => {
    const html = renderizar([fila()], 'mora');
    expect(html).toContain('Carlos Mendoza');
    expect(html).toContain('12 días de atraso');
    expect(html).toContain('$45.00 USD');
    expect(html).toContain('—');
    expect(html).toContain('Sin recordatorios manuales');
    expect(html).toContain('Recordatorio');
    expect(html).toContain('Registrar cobro');
    expect(html).toContain('Ver ficha');
    expect(html).toContain('Vencida');
  });

  it('fila en mora con tasa: muestra el saldo proyectado en Bs', () => {
    const html = renderizar(
      [fila({ saldoPendienteBs: '5200.00', tasaAplicada: '65.0000' })],
      'mora'
    );
    expect(html).toContain('Bs. 5200.00');
  });

  it('fila por vencer: fecha de corte, días restantes y acciones', () => {
    const html = renderizar(
      [
        fila({
          estadoCuota: EstadoCuota.POR_VENCER,
          diasAtraso: null,
          diasRestantes: 2,
          fechaCorteUtc: '2026-09-23T00:00:00.000Z',
          saldoPendienteUsd: '40.00',
        }),
      ],
      'por_vencer'
    );
    expect(html).toContain('Vence en 2 días');
    expect(html).toContain('Corte:');
    expect(html).toContain('Recordatorio');
    expect(html).toContain('Registrar cobro');
  });

  it('fila en revisión: referencia, método y acción a la bandeja', () => {
    const html = renderizar(
      [
        fila({
          estadoCuota: null,
          cuotaId: 'cuota-2',
          pagoId: 'tx-1',
          montoReportado: '1950.00',
          monedaOriginal: Moneda.VES,
          metodoPago: MetodoPago.PAGO_MOVIL,
          referenciaBancaria: '445566',
          fechaReporteUtc: '2026-09-20T12:00:00.000Z',
          diasEspera: 1,
        }),
      ],
      'revision'
    );
    expect(html).toContain('Pago en revisión');
    expect(html).toContain('1950.00');
    expect(html).toContain('pago movil');
    expect(html).toContain('445566');
    expect(html).toContain('Revisar en bandeja');
    expect(html).not.toContain('Registrar cobro');
  });

  it('fila al día: plan real y sin acciones de cobranza', () => {
    const html = renderizar(
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
      'al_dia'
    );
    expect(html).toContain('Presencial Completo');
    expect(html).toContain('Ciclo 2026-09');
    expect(html).toContain('Ver ficha');
    expect(html).not.toContain('Registrar cobro');
    expect(html).not.toContain('Recordatorio');
  });
});
