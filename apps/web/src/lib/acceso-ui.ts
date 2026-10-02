/**
 * Acceso y roles: decisiones puras de UI del módulo (testeables sin DOM).
 */

export const MENSAJE_COPIA_FALLIDA = 'No se pudo copiar. Selecciona el enlace y cópialo a mano.';

type PortapapelesLike = Pick<Clipboard, 'writeText'>;

/**
 * C5: copia al portapapeles sin lanzar. El navegador puede negar el permiso (iframe, http, Safari
 * sin gesto del usuario) o no exponer la API; en ese caso devuelve `false` para que la UI muestre
 * el aviso de copiar a mano.
 */
export async function copiarAlPortapapeles(
  texto: string,
  portapapeles: PortapapelesLike | undefined = typeof navigator !== 'undefined'
    ? navigator.clipboard
    : undefined
): Promise<boolean> {
  if (!portapapeles?.writeText) return false;
  try {
    await portapapeles.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/** C3: el acceso de demostración solo existe en desarrollo o con `VITE_DEMO=true`. */
export function mostrarAccesoDemo(env: { DEV?: boolean; VITE_DEMO?: string }): boolean {
  return env.DEV === true || env.VITE_DEMO === 'true';
}
