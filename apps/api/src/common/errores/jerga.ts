/**
 * LOTE API-2: fuente ÚNICA de la jerga que no debe llegar al usuario en un mensaje del API.
 *
 * La usan el traductor de errores de validación (`traducir-error-validacion.ts`) y el barrido de
 * mensajes de `test/bdd/api2-errores-claros.spec.ts`. La web tiene su propio filtro
 * (`PATRON_MENSAJE_TECNICO` en `apps/web/src/lib/mensajes-error.ts`); un test verifica que los
 * mensajes del API tampoco coincidan con él.
 */

/** Términos internos, formatos técnicos, códigos de reglas (RN-/RF-/RNF-) y valores snake_case. */
export const PATRON_JERGA = new RegExp(
  [
    'aislamiento de tenant',
    '\\btenant',
    'bearer',
    'jwt',
    'token',
    'refresh',
    '\\blogin\\b',
    '\\bRBAC\\b',
    'override',
    'zod',
    'undefined',
    '\\bnull\\b',
    'uuid',
    '\\bid\\b',
    '\\butc\\b',
    '\\biso\\b',
    '8601',
    'yyyy',
    '\\bstring\\b',
    'cadena decimal',
    // Tipos MIME (p. ej. `application/pdf`).
    '\\bapplication/',
    '\\benum\\b',
    'boolean',
    'booleano',
    'payload',
    'schema',
    '\\bdto\\b',
    'offset',
    'timestamp',
    'storage',
    'transici[oó]n inv[aá]lida',
    'operaci[oó]n denegada',
    'violaci[oó]n de unicidad',
    '\\bR(?:N|F|NF)-\\d',
    // snake_case (p. ej. `en_progreso`, `suspendida_superadmin`).
    '\\b[a-z]+_[a-z_]+\\b',
    '`',
  ].join('|'),
  'i'
);

/** Nombres técnicos de campos en camelCase (p. ej. `coachCode`, `fechaInicioUtc`). */
export const PATRON_CAMEL_CASE = /\b[a-z]+[A-Z][A-Za-z]*\b/;

/** Valores de enum en mayúsculas (p. ej. `COMPLETADA`); monedas y siglas cortas (USD, RPE) no. */
export const PATRON_ENUM_MAYUSCULAS = /\b(?!GUACHAFIT\b)[A-ZÁÉÍÓÚ]{5,}\b/;

/** `true` si el texto tiene jerga técnica que el usuario no debería ver. */
export function contieneJerga(texto: string): boolean {
  return (
    PATRON_JERGA.test(texto) || PATRON_CAMEL_CASE.test(texto) || PATRON_ENUM_MAYUSCULAS.test(texto)
  );
}
