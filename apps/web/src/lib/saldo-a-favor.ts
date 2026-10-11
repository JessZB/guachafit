/**
 * RF-006 RN-05: textos del saldo a favor del alumno. El excedente de un pago aprobado o de un cobro
 * en sala por encima de la deuda queda a favor del alumno y la API lo aplica sola a la próxima cuota.
 *
 * Los montos llegan como texto decimal (USD con 2 decimales); se comparan y restan en centavos para
 * no arrastrar errores de coma flotante.
 */

function aCentavos(valor: string | null | undefined): number {
  const numero = Number(valor ?? '0');
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

function deCentavos(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

/** `true` solo si el alumno tiene saldo a favor (mayor que 0). */
export function tieneSaldoAFavor(usd: string | null | undefined): boolean {
  return aCentavos(usd) > 0;
}

/**
 * Aviso previo a aprobar un pago de la bandeja: si su contravalor supera lo que debe la cuota, dice
 * cuánto quedará como saldo a favor. Sin el saldo de la cuota no se afirma nada.
 */
export function avisoExcedenteAprobacion(
  montoEquivalenteUsd: string,
  saldoPendienteCuotaUsd?: string | null
): string | null {
  if (saldoPendienteCuotaUsd === null || saldoPendienteCuotaUsd === undefined) return null;
  const excedente = aCentavos(montoEquivalenteUsd) - Math.max(0, aCentavos(saldoPendienteCuotaUsd));
  if (excedente <= 0) return null;
  return `Este pago excede la deuda de la cuota en ${deCentavos(excedente)} USD; quedarán como saldo a favor del alumno.`;
}

/** Mensaje de éxito de una aprobación o un cobro, con la parte que quedó a favor (dato del API). */
export function mensajeConExcedente(base: string, excedenteUsd?: string | null): string {
  if (!tieneSaldoAFavor(excedenteUsd)) return base;
  return `${base} ${deCentavos(aCentavos(excedenteUsd))} USD quedaron como saldo a favor del alumno.`;
}

/** Saldo a favor en USD y, con tasa vigente, su equivalente aproximado en bolívares. */
export function textoSaldoAFavor(usd: string, tasaEfectiva?: string | null): string {
  const base = `Saldo a favor: ${deCentavos(aCentavos(usd))} USD`;
  const tasa = Number(tasaEfectiva ?? '0');
  if (!Number.isFinite(tasa) || tasa <= 0) return base;
  return `${base} (≈ Bs. ${((aCentavos(usd) * tasa) / 100).toFixed(2)})`;
}
