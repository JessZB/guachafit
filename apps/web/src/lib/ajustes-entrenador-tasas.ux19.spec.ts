/**
 * Specs de lógica pura para RF-018 · UX-19 (Fase roja).
 * Contrato de producción para las nuevas exportaciones de `lib/ajustes-entrenador-tasas.ts`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import type { TasaCambioVigenteDTO } from '@guachafit/shared';
import type { FormatoNumero } from './formato-monto';
import * as tasasModulo from './ajustes-entrenador-tasas';
import type { EntradasTasa, FuenteTasaAjustes } from './ajustes-entrenador-tasas';

const {
  normalizarTasa,
  MENSAJES_ERROR_TASA,
  MENSAJE_PARALELO_REQUERIDO,
  erroresTasa,
  tasaGuardadaDe,
  construirPayloadTasa,
  calcularVesDesdeUsd,
  calcularUsdDesdeVes,
  aTextoEntrada,
  fuenteFormularioDesde,
  ETIQUETAS_FUENTE_TASA,
  etiquetaFuenteTasa,
  hayCambiosTasa,
  MENSAJE_TASA_GUARDADA,
  MENSAJE_ERROR_GUARDAR_TASA,
  AVISO_CAMBIOS_SIN_GUARDAR_TASA,
} = tasasModulo as any;

afterEach(() => {
  cleanup();
});

describe('ajustes-entrenador-tasas (UX-19)', () => {
  describe('normalizarTasa', () => {
    it('normaliza valores válidos con coma o punto a punto decimal sin rellenar ceros', () => {
      expect(normalizarTasa('38,50')).toBe('38.50');
      expect(normalizarTasa(' 36.1234 ')).toBe('36.1234');
      expect(normalizarTasa('40')).toBe('40');
    });

    it('devuelve null para formatos inválidos o valores menores o iguales a cero', () => {
      expect(normalizarTasa('')).toBeNull();
      expect(normalizarTasa('0')).toBeNull();
      expect(normalizarTasa('0,00')).toBeNull();
      expect(normalizarTasa('1,23456')).toBeNull();
      expect(normalizarTasa('1.234,50')).toBeNull();
      expect(normalizarTasa('abc')).toBeNull();
      expect(normalizarTasa('-5')).toBeNull();
    });
  });

  describe('MENSAJES_ERROR_TASA', () => {
    it('define strings no vacíos para las claves requeridas', () => {
      expect(typeof MENSAJES_ERROR_TASA.tasaOficialBcv).toBe('string');
      expect(MENSAJES_ERROR_TASA.tasaOficialBcv.trim().length).toBeGreaterThan(0);

      expect(typeof MENSAJES_ERROR_TASA.tasaParalelo).toBe('string');
      expect(MENSAJES_ERROR_TASA.tasaParalelo.trim().length).toBeGreaterThan(0);

      expect(typeof MENSAJES_ERROR_TASA.tasaActiva).toBe('string');
      expect(MENSAJES_ERROR_TASA.tasaActiva.trim().length).toBeGreaterThan(0);
    });
  });

  describe('erroresTasa', () => {
    it('devuelve objeto vacío cuando todas las entradas son válidas', () => {
      const entradas: EntradasTasa = {
        tasaOficialBcv: '38,50',
        tasaParalelo: '40,10',
        tasaActiva: '38,50',
      };
      expect(erroresTasa(entradas)).toEqual({});
    });

    it('considera válido el paralelo vacío o con solo espacios', () => {
      const entradasVacio: EntradasTasa = {
        tasaOficialBcv: '38,50',
        tasaParalelo: '',
        tasaActiva: '38,50',
      };
      expect(erroresTasa(entradasVacio)).toEqual({});

      const entradasEspacios: EntradasTasa = {
        tasaOficialBcv: '38,50',
        tasaParalelo: '   ',
        tasaActiva: '38,50',
      };
      expect(erroresTasa(entradasEspacios)).toEqual({});
    });

    it('reporta error para campos requeridos inválidos y paralelo con texto inválido', () => {
      const entradasInvalidas: EntradasTasa = {
        tasaOficialBcv: 'invalido',
        tasaParalelo: '1,23456',
        tasaActiva: '0',
      };
      const res = erroresTasa(entradasInvalidas);
      expect(res.tasaOficialBcv).toBe(MENSAJES_ERROR_TASA.tasaOficialBcv);
      expect(res.tasaParalelo).toBe(MENSAJES_ERROR_TASA.tasaParalelo);
      expect(res.tasaActiva).toBe(MENSAJES_ERROR_TASA.tasaActiva);
    });
  });

  describe('construirPayloadTasa con soporte de coma', () => {
    it('acepta coma en las entradas y omite el paralelo vacío sin NaN', () => {
      const payload = construirPayloadTasa(
        { tasaOficialBcv: '38,5', tasaParalelo: '', tasaActiva: '38,5' },
        '38,5',
        'oficial_bcv'
      );
      expect(payload).toEqual({
        tasaOficialBcv: '38.5000',
        tasaParalelo: undefined,
        tasaActivaEntrenador: '38.5000',
        fuente: 'oficial_bcv',
      });
      expect(JSON.stringify(payload)).not.toContain('NaN');
    });

    it('acepta coma en paralelo mayor que cero', () => {
      const payload = construirPayloadTasa(
        { tasaOficialBcv: '38,5', tasaParalelo: '40,1', tasaActiva: '38,5' },
        '38,5',
        'oficial_bcv'
      );
      expect(payload.tasaParalelo).toBe('40.1000');
    });
  });

  describe('calcularVesDesdeUsd y calcularUsdDesdeVes con soporte de coma', () => {
    it('calcularVesDesdeUsd acepta coma en tasa y/o en USD', () => {
      expect(calcularVesDesdeUsd('36,5', '40')).toBe('1460.00');
      expect(calcularVesDesdeUsd('36.5', '40,5')).toBe('1478.25');
    });

    it('calcularUsdDesdeVes acepta coma en tasa y/o en VES', () => {
      expect(calcularUsdDesdeVes('36,5', '730', '')).toBe('20.00');
    });
  });

  describe('aTextoEntrada', () => {
    it('formatea números para coma-decimal con al menos 2 decimales y recorta ceros sobrantes', () => {
      const formato: FormatoNumero = 'coma-decimal';
      expect(aTextoEntrada('36.5000', formato)).toBe('36,50');
      expect(aTextoEntrada('36.1234', formato)).toBe('36,1234');
      expect(aTextoEntrada('36.1200', formato)).toBe('36,12');
      expect(aTextoEntrada('36', formato)).toBe('36,00');
      expect(aTextoEntrada('1460.00', formato)).toBe('1460,00');
    });

    it('formatea números para punto-decimal', () => {
      const formato: FormatoNumero = 'punto-decimal';
      expect(aTextoEntrada('36.5000', formato)).toBe('36.50');
    });

    it('devuelve cadena vacía para null, undefined, cadena vacía o valores inválidos', () => {
      expect(aTextoEntrada(null, 'coma-decimal')).toBe('');
      expect(aTextoEntrada(undefined, 'coma-decimal')).toBe('');
      expect(aTextoEntrada('', 'coma-decimal')).toBe('');
      expect(aTextoEntrada('invalido', 'coma-decimal')).toBe('');
    });
  });

  describe('fuenteFormularioDesde', () => {
    it('conserva oficial_bcv, paralelo y manual', () => {
      expect(fuenteFormularioDesde('oficial_bcv')).toBe('oficial_bcv');
      expect(fuenteFormularioDesde('paralelo')).toBe('paralelo');
      expect(fuenteFormularioDesde('manual')).toBe('manual');
    });

    it('asigna oficial_bcv para null, undefined y sin_configurar', () => {
      expect(fuenteFormularioDesde(null)).toBe('oficial_bcv');
      expect(fuenteFormularioDesde(undefined)).toBe('oficial_bcv');
      expect(fuenteFormularioDesde('sin_configurar')).toBe('oficial_bcv');
    });

    it('asigna manual para cualquier otro valor no reconocido como perfil_coach', () => {
      expect(fuenteFormularioDesde('perfil_coach')).toBe('manual');
      expect(fuenteFormularioDesde('otro')).toBe('manual');
    });
  });

  describe('ETIQUETAS_FUENTE_TASA', () => {
    it('contiene etiquetas visibles de las tres fuentes', () => {
      expect(typeof ETIQUETAS_FUENTE_TASA.oficial_bcv).toBe('string');
      expect(ETIQUETAS_FUENTE_TASA.oficial_bcv.trim().length).toBeGreaterThan(0);

      expect(typeof ETIQUETAS_FUENTE_TASA.paralelo).toBe('string');
      expect(ETIQUETAS_FUENTE_TASA.paralelo.trim().length).toBeGreaterThan(0);

      expect(typeof ETIQUETAS_FUENTE_TASA.manual).toBe('string');
      expect(ETIQUETAS_FUENTE_TASA.manual.trim().length).toBeGreaterThan(0);
    });
  });

  describe('etiquetaFuenteTasa', () => {
    it('devuelve cadena vacía para null, undefined y sin_configurar', () => {
      expect(etiquetaFuenteTasa(null)).toBe('');
      expect(etiquetaFuenteTasa(undefined)).toBe('');
      expect(etiquetaFuenteTasa('sin_configurar')).toBe('');
    });

    it('devuelve la etiqueta correspondiente mapeando fuentes desconocidas a manual', () => {
      expect(etiquetaFuenteTasa('oficial_bcv')).toBe(ETIQUETAS_FUENTE_TASA.oficial_bcv);
      expect(etiquetaFuenteTasa('paralelo')).toBe(ETIQUETAS_FUENTE_TASA.paralelo);
      expect(etiquetaFuenteTasa('manual')).toBe(ETIQUETAS_FUENTE_TASA.manual);
      expect(etiquetaFuenteTasa('perfil_coach')).toBe(ETIQUETAS_FUENTE_TASA.manual);
    });
  });

  describe('hayCambiosTasa', () => {
    const vigente: TasaCambioVigenteDTO = {
      entrenadorId: 'e1',
      tasaOficialBcv: '36.5000',
      tasaParalelo: null,
      tasaActivaEntrenador: '36.5000',
      tasaEfectiva: '36.5000',
      fuente: 'oficial_bcv',
      fechaActualizacionUtc: '2026-10-30T12:00:00.000Z',
    };

    it('devuelve false cuando los valores numéricos coinciden ignorando diferencias de formato', () => {
      const entradas: EntradasTasa = {
        tasaOficialBcv: '36,50',
        tasaParalelo: '',
        tasaActiva: '36.5000',
      };
      expect(hayCambiosTasa(vigente, entradas, 'oficial_bcv')).toBe(false);
    });

    it('devuelve true si la fuente cambia', () => {
      const entradas: EntradasTasa = {
        tasaOficialBcv: '36.5000',
        tasaParalelo: '',
        tasaActiva: '36.5000',
      };
      expect(hayCambiosTasa(vigente, entradas, 'manual')).toBe(true);
    });

    it('devuelve true si algún valor numérico cambia', () => {
      const entradas: EntradasTasa = {
        tasaOficialBcv: '37,00',
        tasaParalelo: '',
        tasaActiva: '36.5000',
      };
      expect(hayCambiosTasa(vigente, entradas, 'oficial_bcv')).toBe(true);
    });

    it('devuelve true si un campo tiene texto inválido distinto del guardado', () => {
      const entradas: EntradasTasa = {
        tasaOficialBcv: '36,50',
        tasaParalelo: 'invalido',
        tasaActiva: '36.5000',
      };
      expect(hayCambiosTasa(vigente, entradas, 'oficial_bcv')).toBe(true);
    });

    it('con vigente === null o sin tasas guardadas devuelve true solo si hay texto no vacío', () => {
      const entradasVacias: EntradasTasa = {
        tasaOficialBcv: '',
        tasaParalelo: '',
        tasaActiva: '',
      };
      expect(hayCambiosTasa(null, entradasVacias, 'oficial_bcv')).toBe(false);

      const entradasConTexto: EntradasTasa = {
        tasaOficialBcv: '36,50',
        tasaParalelo: '',
        tasaActiva: '',
      };
      expect(hayCambiosTasa(null, entradasConTexto, 'oficial_bcv')).toBe(true);
    });
  });

  describe('Constantes de mensajes', () => {
    it('MENSAJE_TASA_GUARDADA es un string no vacío', () => {
      expect(typeof MENSAJE_TASA_GUARDADA).toBe('string');
      expect(MENSAJE_TASA_GUARDADA.trim().length).toBeGreaterThan(0);
    });

    it('MENSAJE_ERROR_GUARDAR_TASA es un string no vacío', () => {
      expect(typeof MENSAJE_ERROR_GUARDAR_TASA).toBe('string');
      expect(MENSAJE_ERROR_GUARDAR_TASA.trim().length).toBeGreaterThan(0);
    });

    it('AVISO_CAMBIOS_SIN_GUARDAR_TASA es un string no vacío', () => {
      expect(typeof AVISO_CAMBIOS_SIN_GUARDAR_TASA).toBe('string');
      expect(AVISO_CAMBIOS_SIN_GUARDAR_TASA.trim().length).toBeGreaterThan(0);
    });
  });

  describe('Validación de correcciones (V1-V4)', () => {
    it('V1: erroresTasa con fuente paralelo y paralelo vacío exige el campo', () => {
      expect(
        erroresTasa({ tasaOficialBcv: '36,5', tasaParalelo: '', tasaActiva: '' }, 'paralelo')
      ).toEqual({ tasaParalelo: MENSAJE_PARALELO_REQUERIDO });
    });

    it('V2: erroresTasa con fuente oficial_bcv no reporta tasaActiva', () => {
      expect(
        erroresTasa({ tasaOficialBcv: '', tasaParalelo: '', tasaActiva: '' }, 'oficial_bcv')
      ).toEqual({ tasaOficialBcv: MENSAJES_ERROR_TASA.tasaOficialBcv });
    });

    it('V3: erroresTasa sin fuente o con manual reporta tasaActiva', () => {
      expect(
        erroresTasa({ tasaOficialBcv: '', tasaParalelo: '', tasaActiva: '' })
      ).toEqual({
        tasaOficialBcv: MENSAJES_ERROR_TASA.tasaOficialBcv,
        tasaActiva: MENSAJES_ERROR_TASA.tasaActiva,
      });

      expect(
        erroresTasa({ tasaOficialBcv: '', tasaParalelo: '', tasaActiva: '' }, 'manual')
      ).toEqual({
        tasaOficialBcv: MENSAJES_ERROR_TASA.tasaOficialBcv,
        tasaActiva: MENSAJES_ERROR_TASA.tasaActiva,
      });
    });

    it('V4: tasaGuardadaDe devuelve tasaEfectiva mayor que 0 o null', () => {
      const TASA_MIN: TasaCambioVigenteDTO = {
        entrenadorId: 'e1',
        tasaOficialBcv: '36.5000',
        tasaParalelo: null,
        tasaActivaEntrenador: '36.5000',
        tasaEfectiva: '36.5000',
        fuente: 'oficial_bcv',
        fechaActualizacionUtc: '2026-10-30T12:00:00.000Z',
      };

      expect(tasaGuardadaDe({ ...TASA_MIN, tasaEfectiva: '36.5000' })).toBe('36.5000');
      expect(tasaGuardadaDe({ ...TASA_MIN, tasaEfectiva: '0.0000' })).toBeNull();
      expect(tasaGuardadaDe({ ...TASA_MIN, tasaEfectiva: null as any })).toBeNull();
      expect(tasaGuardadaDe(null)).toBeNull();
      expect(tasaGuardadaDe(undefined)).toBeNull();
    });
  });
});
