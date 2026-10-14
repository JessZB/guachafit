/** Base interna de la validación de arranque: entorno, nombres de variables y lectura. */

/** Entorno mínimo que lee la validación: solo las variables que necesita. */
export type EntornoConfiguracion = Partial<Record<string, string | undefined>>;

/** Nombres de las variables, interpolados en los mensajes para no incrustar identificadores. */
export const NOMBRE_CORS_ORIGINS = 'CORS_ORIGINS';
export const NOMBRE_BULL_BOARD_USER = 'BULL_BOARD_USER';
export const NOMBRE_BULL_BOARD_PASS = 'BULL_BOARD_PASS';

/** Primer valor no vacío del entorno entre los alias dados, ya recortado. */
export function primerValor(entorno: EntornoConfiguracion, nombres: readonly string[]): string | undefined {
  for (const nombre of nombres) {
    const valor = (entorno[nombre] ?? '').trim();
    if (valor) return valor;
  }
  return undefined;
}

/** Todas las variantes aceptadas de una variable, para nombrarlas en el mensaje al operador. */
export function etiquetas(nombres: readonly string[]): string {
  return nombres.join(' o ');
}
