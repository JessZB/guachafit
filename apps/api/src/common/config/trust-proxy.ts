import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * A5 (LOTE API-1): configuración de `trust proxy` de Express a partir de `TRUST_PROXY`.
 *
 * El límite de intentos identifica al cliente por `req.ip`. Detrás de un proxy (ADR-005: el API
 * se despliega detrás de Nginx / Cloudflare) `req.ip` sería la IP del proxy y TODOS los usuarios
 * compartirían el mismo contador. Express solo calcula la IP real desde `X-Forwarded-For` si se
 * le dice en qué proxies confiar; sin `TRUST_PROXY` esa cabecera se IGNORA (cualquier cliente
 * podría falsearla).
 *
 * Valores admitidos:
 * - vacío / `false` / `0`: desactivado (por defecto).
 * - entero N: confiar en los N saltos de proxy más cercanos (p. ej. `1` con un único Nginx).
 * - lista separada por comas de IPs, subredes CIDR o nombres de Express (`loopback`,
 *   `linklocal`, `uniquelocal`), p. ej. los rangos publicados de Cloudflare.
 * - `true` se rechaza: confiaría en cualquier `X-Forwarded-For` y la IP sería falsificable.
 */
export type ValorTrustProxy = false | number | string[];

function errorDeConfiguracion(detalle: string): Error {
  return new Error(
    `[Configuración] TRUST_PROXY no es válido: ${detalle} Usa un número de saltos de proxy ` +
      `(p. ej. "1") o una lista de IPs/subredes de confianza separadas por comas.`
  );
}

export function parsearTrustProxy(valor: string | undefined): ValorTrustProxy {
  const limpio = valor?.trim() ?? '';
  if (limpio === '' || limpio === 'false' || limpio === '0') {
    return false;
  }
  if (limpio === 'true') {
    throw errorDeConfiguracion('"true" confiaría en cualquier proxy y permitiría falsear la IP.');
  }
  if (/^\d+$/.test(limpio)) {
    return Number(limpio);
  }
  if (/^-?\d+(\.\d+)?$/.test(limpio)) {
    throw errorDeConfiguracion(`"${limpio}" no es un número entero positivo de saltos.`);
  }
  return limpio
    .split(',')
    .map((parte) => parte.trim())
    .filter((parte) => parte.length > 0);
}

/** Aplica `TRUST_PROXY` a la app de Express (no hace nada si está desactivado). */
export function aplicarTrustProxy(
  app: NestExpressApplication,
  entorno: Partial<Record<'TRUST_PROXY', string | undefined>> = process.env
): ValorTrustProxy {
  const valor = parsearTrustProxy(entorno.TRUST_PROXY);
  if (valor !== false) {
    app.set('trust proxy', valor);
  }
  return valor;
}
