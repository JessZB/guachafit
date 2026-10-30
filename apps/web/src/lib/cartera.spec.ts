import { describe, expect, it } from 'vitest';
import {
  PESTANAS_CARTERA,
  contadorPestana,
  etiquetaDiasAtraso,
  etiquetaDiasEspera,
  etiquetaDiasRestantes,
  hayTasaProyectable,
  normalizarPestana,
  textoSaldoBs,
  textoUltimaGestion,
  tonoResultadoRecordatorio,
} from './cartera';
import type { ResumenCarteraDTO } from '@guachafit/shared';

function resumenBase(parcial: Partial<ResumenCarteraDTO> = {}): ResumenCarteraDTO {
  return {
    recaudadoMesUsd: '0.00',
    totalEnMoraUsd: '0.00',
    alumnosEnMora: 0,
    totalPorVencerUsd: '0.00',
    proximosAVencer: 0,
    pagosPorValidar: 0,
    contadores: { enMora: 3, porVencer: 2, revision: 1, alDia: 4 },
    tasaVigente: null,
    ...parcial,
  };
}

describe('WU-I: helpers del tablero de cartera (RF-009)', () => {
  it('normaliza la pestaña de la URL y cae a mora ante valores inválidos', () => {
    expect(normalizarPestana('por_vencer')).toBe('por_vencer');
    expect(normalizarPestana('revision')).toBe('revision');
    expect(normalizarPestana('al_dia')).toBe('al_dia');
    expect(normalizarPestana('inventada')).toBe('mora');
    expect(normalizarPestana(null)).toBe('mora');
    expect(normalizarPestana(undefined)).toBe('mora');
  });

  it('expone las cuatro pestañas del RF en orden operativo', () => {
    expect(PESTANAS_CARTERA.map((p) => p.clave)).toEqual([
      'mora',
      'por_vencer',
      'revision',
      'al_dia',
    ]);
  });

  it('mapea el contador de cada pestaña desde el resumen del servidor', () => {
    const resumen = resumenBase();
    expect(contadorPestana(resumen, 'mora')).toBe(3);
    expect(contadorPestana(resumen, 'por_vencer')).toBe(2);
    expect(contadorPestana(resumen, 'revision')).toBe(1);
    expect(contadorPestana(resumen, 'al_dia')).toBe(4);
    expect(contadorPestana(null, 'mora')).toBe(0);
  });

  it('etiqueta días de atraso, vencimiento y espera en lenguaje humano', () => {
    expect(etiquetaDiasAtraso(1)).toBe('1 día de atraso');
    expect(etiquetaDiasAtraso(12)).toBe('12 días de atraso');
    expect(etiquetaDiasAtraso(null)).toBeNull();
    expect(etiquetaDiasAtraso(undefined)).toBeNull();

    expect(etiquetaDiasRestantes(0)).toBe('Vence hoy');
    expect(etiquetaDiasRestantes(1)).toBe('Vence mañana');
    expect(etiquetaDiasRestantes(4)).toBe('Vence en 4 días');
    expect(etiquetaDiasRestantes(null)).toBeNull();

    expect(etiquetaDiasEspera(0)).toBe('0 días esperando');
    expect(etiquetaDiasEspera(3)).toBe('3 días esperando');
  });

  it('proyecta Bs solo cuando la fila trae saldo proyectado (nunca inventa)', () => {
    expect(textoSaldoBs({ saldoPendienteBs: '5200.00' })).toBe('Bs. 5.200,00');
    expect(textoSaldoBs({ saldoPendienteBs: null })).toBeNull();
  });

  it('describe la última gestión manual y su ausencia', () => {
    expect(textoUltimaGestion(null)).toBe('Sin recordatorios manuales');
    expect(textoUltimaGestion('2026-09-20T14:30:00.000Z')).toContain('Último:');
  });

  it('solo considera proyectable una tasa vigente positiva', () => {
    expect(hayTasaProyectable(resumenBase({ tasaVigente: '65.0000' }))).toBe(true);
    expect(hayTasaProyectable(resumenBase({ tasaVigente: null }))).toBe(false);
    expect(hayTasaProyectable(resumenBase({ tasaVigente: '0.0000' }))).toBe(false);
    expect(hayTasaProyectable(null)).toBe(false);
  });

  it('asigna tono honesto al resultado del recordatorio manual', () => {
    const base = {
      mensaje: '',
      mensajeSugerido: null,
      saldoPendienteUsd: null,
      saldoPendienteBs: null,
      ultimaGestionUtc: null,
      proximoPermitidoUtc: null,
    };
    expect(tonoResultadoRecordatorio({ ...base, enviado: true, motivo: 'despachado' })).toBe(
      'success'
    );
    expect(
      tonoResultadoRecordatorio({ ...base, enviado: false, motivo: 'cooldown_activo' })
    ).toBe('warning');
    expect(
      tonoResultadoRecordatorio({ ...base, enviado: false, motivo: 'pausa_revision' })
    ).toBe('info');
    expect(
      tonoResultadoRecordatorio({ ...base, enviado: false, motivo: 'sin_saldo_pendiente' })
    ).toBe('info');
  });
});
