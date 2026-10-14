/**
 * La clave de cifrado sigue estas reglas (idénticas a las de CryptoService, que reutiliza
 * `analizarClaveCifrado` y los mismos mensajes):
 * - Ausente: en producción es un error; en desarrollo/test se usa la clave de desarrollo.
 * - 64 caracteres hexadecimales: se usa tal cual.
 * - Más larga con primeros 64 hexadecimales: se usan los primeros 64 (compatibilidad) y se avisa.
 * - Cualquier otro caso: error en todos los entornos; jamás se cae a la clave de desarrollo.
 * - En producción además se rechazan la clave de ejemplo (sin distinguir mayúsculas) y las claves
 *   formadas por un único carácter repetido.
 */
import { ENCRYPTION_KEY_DESARROLLO } from './constantes-configuracion';
import type { AnalisisClaveCifrado, MotivoClaveCifrado } from './tipos-configuracion';

const REGEX_CLAVE_HEX = /^[0-9a-fA-F]{64}$/;

const GUIA_CLAVE_CIFRADO =
  'En un primer despliegue, cuando todavía no hay fichas de salud cifradas, genera una clave ' +
  'nueva con "openssl rand -hex 32". Si ya existen fichas cifradas, configura la MISMA clave ' +
  'con la que se cifraron (si la original tenía más de 64 caracteres hexadecimales, usa sus ' +
  'primeros 64): generar otra deja los registros existentes ilegibles.';

/** Único constructor de los mensajes de ENCRYPTION_KEY; lo comparten el arranque y CryptoService. */
export function mensajeClaveCifrado(motivo: MotivoClaveCifrado): string {
  const detalle: Record<MotivoClaveCifrado, string> = {
    ausente: 'falta la clave de cifrado',
    malformada:
      'el valor configurado no es válido: debe ser hexadecimal y tener al menos 64 caracteres ' +
      '(se usan los primeros 64)',
    ejemplo: 'usa la clave de ejemplo, que está publicada en el repositorio',
    debil: 'está formada por un único carácter repetido y no es segura para producción',
  };
  return `ENCRYPTION_KEY: ${detalle[motivo]}. ${GUIA_CLAVE_CIFRADO}`;
}

function mensajeClaveLarga(): string {
  return (
    'ENCRYPTION_KEY: tiene más de 64 caracteres; se usarán sus primeros 64, que sí son ' +
    'hexadecimales. Acórtala a esos 64 caracteres para evitar ambigüedad.'
  );
}

function esCaracterRepetido(clave: string): boolean {
  return /^([0-9a-fA-F])\1{63}$/.test(clave);
}

/** Clasifica la clave de cifrado con las reglas compartidas por el arranque y CryptoService. */
export function analizarClaveCifrado(valor: string | undefined): AnalisisClaveCifrado {
  const clave = (valor ?? '').trim();
  if (!clave) {
    return { problemaProduccion: mensajeClaveCifrado('ausente') };
  }

  const efectiva = clave.slice(0, 64);
  if (!REGEX_CLAVE_HEX.test(efectiva)) {
    return { problemaFatal: mensajeClaveCifrado('malformada') };
  }

  const advertencia = clave.length > 64 ? mensajeClaveLarga() : undefined;
  if (efectiva.toLowerCase() === ENCRYPTION_KEY_DESARROLLO.toLowerCase()) {
    return { claveEfectiva: efectiva, advertencia, problemaProduccion: mensajeClaveCifrado('ejemplo') };
  }
  if (esCaracterRepetido(efectiva)) {
    return { claveEfectiva: efectiva, advertencia, problemaProduccion: mensajeClaveCifrado('debil') };
  }
  return { claveEfectiva: efectiva, advertencia };
}
