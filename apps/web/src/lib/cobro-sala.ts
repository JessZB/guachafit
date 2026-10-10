/**
 * M5-L1B (RF-009 RN-01): payload del cobro en sala, compartido por la ficha y Control de Cobros.
 *
 * El cobro en sala es siempre en efectivo (la API rechaza otros métodos): el método se deriva de
 * la moneda y nunca viaja una referencia bancaria. `hoyLocal` es el día LOCAL de la operación
 * (`toISOString()` lo desplazaría al día siguiente por la tarde en zonas como UTC-4).
 */
import { MetodoPago, Moneda } from '@guachafit/shared';

export interface EntradaCobroSala {
  monto: string;
  moneda: Moneda;
  notas?: string;
  hoyLocal: string;
}

export interface PayloadCobroSala {
  montoOriginal: string;
  monedaOriginal: Moneda;
  metodoPago: MetodoPago;
  fechaOperacion: string;
  notas?: string;
}

export function construirPayloadCobroSala(entrada: EntradaCobroSala): PayloadCobroSala {
  const payload: PayloadCobroSala = {
    montoOriginal: entrada.monto.trim(),
    monedaOriginal: entrada.moneda,
    metodoPago: entrada.moneda === Moneda.VES ? MetodoPago.EFECTIVO_VES : MetodoPago.EFECTIVO_USD,
    fechaOperacion: entrada.hoyLocal,
  };
  const notas = entrada.notas?.trim();
  if (notas) payload.notas = notas;
  return payload;
}
