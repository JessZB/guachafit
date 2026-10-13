/**
 * Pure recovery-link timing rules (no I/O).
 * Extracted from `AuthService.procesarSolicitudRecuperacion` (P3): a link
 * expiring after the freshly-issued cutoff was issued less than the minimum
 * interval ago, so it must not rotate nor resend mail.
 */
/** Minimum gap between two links for the same account (15 minutes). */
export const INTERVALO_MINIMO_NUEVO_ENLACE_RECUPERACION_MS = 15 * 60_000;

/**
 * Cutoff for the minimum-interval rule: a link expiring after this instant
 * was issued less than the minimum interval ago. Issuance is derived from
 * the expiry (`expira - vigencia`): no extra column needed.
 */
export function limiteEnlaceRecienEmitido(
  ahoraMs: number,
  vigenciaMs: number,
  intervaloMinimoMs: number
): Date {
  return new Date(ahoraMs + vigenciaMs - intervaloMinimoMs);
}

/** True when the current link is still fresh and must keep working. */
export function enlaceRecienEmitido(
  expiraActual: Date | null,
  limiteRecienEmitido: Date
): boolean {
  return !!expiraActual && expiraActual > limiteRecienEmitido;
}
