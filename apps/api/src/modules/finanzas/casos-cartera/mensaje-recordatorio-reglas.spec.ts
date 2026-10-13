import { describe, it, expect } from 'vitest';
import { construirMensajeRecordatorioManual } from './mensaje-recordatorio-reglas';

describe('construirMensajeRecordatorioManual', () => {
  it('incluye USD y Bs con periodo cuando hay tasa', () => {
    const mensaje = construirMensajeRecordatorioManual({
      nombre: 'Ana',
      saldoPendienteUsd: '60.00',
      saldoPendienteBs: '2190.00',
      periodo: '2026-10',
    });
    expect(mensaje.titulo).toBe('Recordatorio de pago');
    expect(mensaje.cuerpo).toContain('$60.00 USD (o Bs. 2190.00)');
    expect(mensaje.cuerpo).toContain('de 2026-10');
  });

  it('omite Bs cuando no hay tasa (nunca inventa)', () => {
    const mensaje = construirMensajeRecordatorioManual({
      nombre: 'Ana',
      saldoPendienteUsd: '60.00',
      saldoPendienteBs: null,
      periodo: null,
    });
    expect(mensaje.cuerpo).toContain('$60.00 USD.');
    expect(mensaje.cuerpo).not.toContain('Bs.');
  });
});
