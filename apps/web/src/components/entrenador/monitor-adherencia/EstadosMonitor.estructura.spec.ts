/**
 * Lote UX-14 (SEG-18) · Contrato de estructura para EstadosMonitor.
 *
 * Contratos:
 * - EM0 · Cordura: el texto no está vacío y contiene export function CargaMonitor.
 * - EM1 · Átomos de ui/: contiene CargaConEsqueleto, EstadoError y EstadoVacio, y no contiene animate-pulse.
 */
import { describe, expect, it } from 'vitest';
import codigo from './EstadosMonitor.tsx?raw';

describe('EstadosMonitor · estructura (§6.6, UX-14)', () => {
  it('EM0 · Cordura', () => {
    expect(codigo).toBeTruthy();
    expect(codigo).toContain('export function CargaMonitor');
  });

  it('EM1 · Átomos de ui/', () => {
    expect(codigo).toContain('CargaConEsqueleto');
    expect(codigo).toContain('EstadoError');
    expect(codigo).toContain('EstadoVacio');
    expect(codigo).not.toContain('animate-pulse');
  });
});
