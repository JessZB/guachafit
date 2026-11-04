import { randomInt } from 'node:crypto';

/** Alfabeto de 32 símbolos sin O/0/I/1 para que el código se lea y se dicte sin ambigüedad. */
export const ALFABETO_COACH_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LONGITUD_COACH_CODE = 8;

/**
 * D17: código de entrenador aleatorio. Usa un generador criptográfico (`crypto.randomInt`) porque
 * el código es la llave del enlace de captación; `entero` solo se inyecta en los specs.
 */
export function generarCoachCode(
  entero: (maximoExclusivo: number) => number = (maximo) => randomInt(maximo)
): string {
  let codigo = '';
  for (let i = 0; i < LONGITUD_COACH_CODE; i++) {
    codigo += ALFABETO_COACH_CODE[entero(ALFABETO_COACH_CODE.length)];
  }
  return codigo;
}

/**
 * Devuelve el primer código para el que `existe` es `false`. Tras `maxIntentos` colisiones lanza
 * un error (con 32^8 combinaciones, agotar los intentos indica un fallo del generador).
 */
export async function generarCoachCodeUnico(
  existe: (codigo: string) => Promise<boolean>,
  generar: () => string = generarCoachCode,
  maxIntentos = 5
): Promise<string> {
  for (let intento = 0; intento < maxIntentos; intento++) {
    const codigo = generar();
    if (!(await existe(codigo))) return codigo;
  }
  throw new Error('No se pudo generar un código de entrenador único.');
}
