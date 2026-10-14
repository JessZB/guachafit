/** Recolección de los problemas de los secretos JWT. */
import { obtenerSecretosJwt } from '../secretos-jwt';
import type { EntornoConfiguracion } from './lectura-entorno';
import type { ProblemaConfiguracion } from './tipos-configuracion';

/**
 * Recolecta los problemas de los secretos JWT reutilizando `obtenerSecretosJwt` (única fuente de
 * sus reglas). Cada secreto se sondea por separado, con el otro en un valor de relleno, para
 * reportarlos todos a la vez sin duplicar la lógica ni cambiar el comportamiento existente.
 */
export function problemasSecretosJwt(entorno: EntornoConfiguracion): ProblemaConfiguracion[] {
  if (entorno.NODE_ENV !== 'production') return [];

  const problemas: ProblemaConfiguracion[] = [];
  const relleno = 'secreto-de-relleno-solo-para-diagnostico';
  for (const variable of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const otro = variable === 'JWT_SECRET' ? 'JWT_REFRESH_SECRET' : 'JWT_SECRET';
    try {
      obtenerSecretosJwt({ ...entorno, [otro]: relleno });
    } catch (error) {
      problemas.push({
        variable,
        mensaje: String((error as Error).message).replace(/^\[Configuración\]\s*/, ''),
      });
    }
  }
  return problemas;
}
