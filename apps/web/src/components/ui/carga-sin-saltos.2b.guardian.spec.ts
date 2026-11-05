// @vitest-environment node
import { describe, expect, it } from 'vitest';
import appLayoutRaw from '../layout/AppLayout.tsx?raw';
import seccionMetasRaw from '../atleta/nutricion/SeccionMetasNutricionales.tsx?raw';

describe('Guardián · Carga sin saltos ronda 2b (fallback de rutas y metas de Nutrición)', () => {
  describe('AppLayout.tsx', () => {
    it('contiene CargaConEsqueleto', () => {
      expect(appLayoutRaw).toContain('CargaConEsqueleto');
    });

    it('NO contiene <EstadoCarga', () => {
      expect(appLayoutRaw).not.toContain('<EstadoCarga');
    });
  });

  describe('SeccionMetasNutricionales.tsx', () => {
    it('contiene CargaConEsqueleto', () => {
      expect(seccionMetasRaw).toContain('CargaConEsqueleto');
    });

    it('NO contiene <EstadoCarga', () => {
      expect(seccionMetasRaw).not.toContain('<EstadoCarga');
    });
  });
});
