/**
 * LOTE API-2: validación de entradas con el contrato compartido (fuente única).
 *
 * Devuelve los datos de SALIDA del contrato (con `.default()` aplicados) o lanza 400 con el primer
 * problema traducido a español claro. Así un ZodError nunca termina en un 500 genérico.
 *
 * Se usa `ZodType<T, any, any>` (no `ZodSchema<T>`) para que T sea el tipo de salida.
 */
import { BadRequestException } from '@nestjs/common';
import type { ZodType } from 'zod';
import { traducirErrorValidacion } from './traducir-error-validacion';

export function parsearContrato<T>(schema: ZodType<T, any, any>, datos: unknown): T {
  const resultado = schema.safeParse(datos);
  if (!resultado.success) {
    throw new BadRequestException(traducirErrorValidacion(resultado.error));
  }
  return resultado.data;
}
