/** Recolección de los problemas de CORS. */
import { NOMBRE_CORS_ORIGINS, type EntornoConfiguracion } from './lectura-entorno';
import { origenesCors } from './origenes-cors';
import type { ProblemaConfiguracion } from './tipos-configuracion';

export function problemasCors(
  entorno: EntornoConfiguracion,
  esProduccion: boolean
): ProblemaConfiguracion[] {
  const crudo = (entorno[NOMBRE_CORS_ORIGINS] ?? '').trim();
  if (!crudo) {
    return esProduccion
      ? [
          {
            variable: NOMBRE_CORS_ORIGINS,
            mensaje:
              `${NOMBRE_CORS_ORIGINS}: falta. En producción es obligatoria: define los orígenes permitidos ` +
              'para el navegador, separados por coma (p. ej. https://app.tu-dominio.com).',
          },
        ]
      : [];
  }

  const problemas: ProblemaConfiguracion[] = [];
  const origenes = origenesCors(entorno);
  if (origenes.length === 0) {
    problemas.push({
      variable: NOMBRE_CORS_ORIGINS,
      mensaje:
        `${NOMBRE_CORS_ORIGINS}: no contiene ningún origen válido. Separa los orígenes con comas ` +
        '(p. ej. https://app.tu-dominio.com).',
    });
  }
  if (origenes.includes('*')) {
    problemas.push({
      variable: NOMBRE_CORS_ORIGINS,
      mensaje:
        `${NOMBRE_CORS_ORIGINS}: no admite "*" porque el API envía credenciales y el navegador ` +
        'rechaza ese comodín. Enumera cada origen permitido.',
    });
  }
  for (const origen of origenes) {
    if (origen !== '*' && !/^https?:\/\//i.test(origen)) {
      problemas.push({
        variable: NOMBRE_CORS_ORIGINS,
        mensaje: `${NOMBRE_CORS_ORIGINS}: "${origen}" no es una URL válida; cada origen debe empezar por http:// o https://.`,
      });
    }
  }
  return problemas;
}
