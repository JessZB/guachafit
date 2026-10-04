/**
 * Correo apto para logs y registros de fallos: `ana@guachafit.com` → `a***@guachafit.com`.
 * Permite reconocer el dominio y la inicial al dar soporte sin guardar el correo completo.
 */
export function enmascararCorreo(correo: string | null | undefined): string {
  const valor = (correo ?? '').trim();
  const arroba = valor.lastIndexOf('@');
  if (arroba < 1) return '***';
  return `${valor[0]}***${valor.slice(arroba)}`;
}
