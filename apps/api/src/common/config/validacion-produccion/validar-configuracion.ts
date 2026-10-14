/**
 * Validación centralizada de la configuración crítica del API al arrancar.
 *
 * - Producción (`NODE_ENV=production`): se recolectan TODOS los problemas (secretos JWT incluidos)
 *   y se lanza UN único Error con una línea por problema, para corregirlos en una sola pasada.
 * - Desarrollo/test: devuelve los problemas y las advertencias para registrar un único resumen,
 *   sin lanzar, salvo una clave de cifrado mal formada, que nunca debe quedar silenciada.
 */
import { analizarClaveCifrado } from './clave-cifrado-reglas';
import type { EntornoConfiguracion } from './lectura-entorno';
import type {
  ProblemaConfiguracion,
  ResultadoValidacionConfiguracion,
} from './tipos-configuracion';
import { problemasSecretosJwt } from './problemas-secretos-jwt';
import { problemasBoveda } from './problemas-boveda';
import { problemasCors } from './problemas-cors';
import { problemasBullBoard } from './problemas-bull-board';

function armarErrorConfiguracion(problemas: readonly ProblemaConfiguracion[]): string {
  return (
    `[Configuración] El API no puede arrancar: se encontraron ${problemas.length} problemas de ` +
    'configuración. Corrige cada uno y vuelve a intentarlo:\n' +
    problemas.map((problema) => `- ${problema.mensaje}`).join('\n')
  );
}

/**
 * Valida la configuración crítica. En producción lanza un único Error con todos los problemas
 * (secretos JWT incluidos) y una línea por problema; fuera de producción devuelve el resultado
 * para registrar un único resumen, salvo una clave de cifrado mal formada, que lanza siempre.
 */
export function validarConfiguracionProduccion(
  entorno: EntornoConfiguracion = process.env
): ResultadoValidacionConfiguracion {
  const esProduccion = entorno.NODE_ENV === 'production';

  const analisisClave = analizarClaveCifrado(entorno.ENCRYPTION_KEY);
  const problemas: ProblemaConfiguracion[] = [];
  const advertencias: string[] = [];

  if (analisisClave.problemaFatal) {
    problemas.push({ variable: 'ENCRYPTION_KEY', mensaje: analisisClave.problemaFatal });
  }
  if (analisisClave.problemaProduccion) {
    problemas.push({ variable: 'ENCRYPTION_KEY', mensaje: analisisClave.problemaProduccion });
  }
  if (analisisClave.advertencia) {
    advertencias.push(analisisClave.advertencia);
  }

  problemas.push(
    ...problemasSecretosJwt(entorno),
    ...problemasBoveda(entorno),
    ...problemasCors(entorno, esProduccion),
    ...problemasBullBoard(entorno)
  );

  if (esProduccion && problemas.length > 0) {
    throw new Error(armarErrorConfiguracion(problemas));
  }
  if (!esProduccion && analisisClave.problemaFatal) {
    throw new Error(`[Configuración] ${analisisClave.problemaFatal}`);
  }

  return { problemas, advertencias };
}
