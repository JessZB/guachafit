/** Recolección de los problemas de la bóveda de archivos. */
import {
  ENV_ACCESS_KEY_ID,
  ENV_BUCKET,
  ENV_ENDPOINT,
  ENV_SECRET_ACCESS_KEY,
} from '../variables-almacenamiento';
import {
  etiquetas,
  primerValor,
  type EntornoConfiguracion,
} from './lectura-entorno';
import {
  STORAGE_ACCESS_KEY_EJEMPLO,
  STORAGE_BUCKET_EJEMPLO,
  STORAGE_SECRET_KEY_EJEMPLO,
} from './constantes-configuracion';
import type { ProblemaConfiguracion } from './tipos-configuracion';

export function problemasBoveda(entorno: EntornoConfiguracion): ProblemaConfiguracion[] {
  const problemas: ProblemaConfiguracion[] = [];

  const endpoint = primerValor(entorno, ENV_ENDPOINT);
  if (!endpoint) {
    problemas.push({
      variable: ENV_ENDPOINT[0],
      mensaje:
        `${etiquetas(ENV_ENDPOINT)}: falta el endpoint de la bóveda de archivos. En producción es ` +
        'obligatorio: configura el endpoint real de Cloudflare R2 (p. ej. https://<cuenta>.r2.cloudflarestorage.com).',
    });
  }

  const bucket = primerValor(entorno, ENV_BUCKET);
  if (!bucket) {
    problemas.push({
      variable: ENV_BUCKET[0],
      mensaje:
        `${etiquetas(ENV_BUCKET)}: falta el bucket de la bóveda de archivos. En producción es ` +
        'obligatorio: configura el bucket real de Cloudflare R2.',
    });
  } else if (bucket === STORAGE_BUCKET_EJEMPLO) {
    problemas.push({
      variable: ENV_BUCKET[0],
      mensaje:
        `${etiquetas(ENV_BUCKET)}: tiene el valor de ejemplo "${STORAGE_BUCKET_EJEMPLO}" (bucket ` +
        'local de MinIO). En producción configura el bucket real de Cloudflare R2.',
    });
  }

  const claveAcceso = primerValor(entorno, ENV_ACCESS_KEY_ID);
  if (!claveAcceso) {
    problemas.push({
      variable: ENV_ACCESS_KEY_ID[0],
      mensaje:
        `${etiquetas(ENV_ACCESS_KEY_ID)}: falta la clave de acceso de la bóveda. En producción ` +
        'configura las credenciales reales de Cloudflare R2.',
    });
  } else if (claveAcceso === STORAGE_ACCESS_KEY_EJEMPLO) {
    problemas.push({
      variable: ENV_ACCESS_KEY_ID[0],
      mensaje:
        `${etiquetas(ENV_ACCESS_KEY_ID)}: tiene el valor de ejemplo "${STORAGE_ACCESS_KEY_EJEMPLO}" ` +
        '(credencial local de MinIO). En producción configura credenciales reales de Cloudflare R2.',
    });
  }

  const claveSecreta = primerValor(entorno, ENV_SECRET_ACCESS_KEY);
  if (!claveSecreta) {
    problemas.push({
      variable: ENV_SECRET_ACCESS_KEY[0],
      mensaje:
        `${etiquetas(ENV_SECRET_ACCESS_KEY)}: falta la clave secreta de la bóveda. En producción ` +
        'configura las credenciales reales de Cloudflare R2.',
    });
  } else if (claveSecreta === STORAGE_SECRET_KEY_EJEMPLO) {
    problemas.push({
      variable: ENV_SECRET_ACCESS_KEY[0],
      mensaje:
        `${etiquetas(ENV_SECRET_ACCESS_KEY)}: tiene el valor de ejemplo "${STORAGE_SECRET_KEY_EJEMPLO}" ` +
        '(credencial local de MinIO). En producción configura credenciales reales de Cloudflare R2.',
    });
  }

  return problemas;
}
