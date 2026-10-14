/** Resumen local y bandera de Swagger: lo que el arranque muestra fuera de producción. */
import type { EntornoConfiguracion } from './lectura-entorno';
import type { ProblemaConfiguracion } from './tipos-configuracion';

/**
 * Única línea que resume, fuera de producción, los problemas detectados: evita un aviso por
 * variable cuando `.env.example` usa valores de ejemplo a propósito.
 */
export function resumenProblemasConfiguracion(
  problemas: readonly ProblemaConfiguracion[]
): string {
  const variables = [...new Set(problemas.map((problema) => problema.variable))];
  return (
    `La configuración local usa ${problemas.length} valores de ejemplo o incompletos; en ` +
    `producción el API no arrancaría con ellos: ${variables.join(', ')}.`
  );
}

/**
 * `true` si debe montarse Swagger UI (`/api/docs`): fuera de producción siempre; en producción
 * solo cuando `SWAGGER_HABILITADO=true`.
 */
export function debeExponerSwagger(entorno: EntornoConfiguracion = process.env): boolean {
  if (entorno.NODE_ENV !== 'production') return true;
  return (entorno.SWAGGER_HABILITADO ?? '').trim() === 'true';
}
