/**
 * Reglas puras de vigencia del enlace de recuperación (sin E/S).
 * Extraído de `AuthService.procesarSolicitudRecuperacion` (P3): un enlace
 * que vence después del corte de recién emitido se emitió hace menos del
 * intervalo mínimo, así que no debe rotar ni reenviar correo.
 */
/** Separación mínima entre dos enlaces de la misma cuenta (15 minutos). */
export const INTERVALO_MINIMO_NUEVO_ENLACE_RECUPERACION_MS = 15 * 60_000;

/**
 * Corte de la regla del intervalo mínimo: un enlace que vence después de este instante
 * se emitió hace menos del intervalo mínimo. La emisión se deduce del
 * vencimiento (`expira - vigencia`): no hace falta otra columna.
 */
export function limiteEnlaceRecienEmitido(
  ahoraMs: number,
  vigenciaMs: number,
  intervaloMinimoMs: number
): Date {
  return new Date(ahoraMs + vigenciaMs - intervaloMinimoMs);
}

/** Verdadero cuando el enlace vigente sigue fresco y debe seguir sirviendo. */
export function enlaceRecienEmitido(
  expiraActual: Date | null,
  limiteRecienEmitido: Date
): boolean {
  return !!expiraActual && expiraActual > limiteRecienEmitido;
}
