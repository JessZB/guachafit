/** Lectura de CORS: de dónde salen los orígenes permitidos. */
import { NOMBRE_CORS_ORIGINS, type EntornoConfiguracion } from './lectura-entorno';

/**
 * Orígenes permitidos para CORS. En producción solo `CORS_ORIGINS` (validado al arrancar); fuera
 * de producción se conserva el origen local por defecto.
 */
export function origenesCors(entorno: EntornoConfiguracion = process.env): string[] {
  const crudo = (entorno[NOMBRE_CORS_ORIGINS] ?? '').trim();
  if (crudo) {
    return crudo
      .split(',')
      .map((origen) => origen.trim())
      .filter((origen) => origen.length > 0);
  }
  return entorno.NODE_ENV === 'production' ? [] : ['http://localhost:3000'];
}
