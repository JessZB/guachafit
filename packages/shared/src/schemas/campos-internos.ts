import { z } from 'zod';
import {
  DECIMAL_STRING_REGEX,
  FECHA_CALENDARIO_REGEX,
  MENSAJE_ESFUERZO_INVALIDO,
  MENSAJE_FECHA_CALENDARIO,
  MENSAJE_PESO_FUERA_DE_RANGO,
  esFechaCalendarioReal,
  esPesoKgValido,
  esRpeValido,
} from './comunes';

// =============================================================================
// CAMPOS INTERNOS DE ESQUEMAS (fuera de la superficie pública de `@guachafit/shared`)
// =============================================================================
// Hogar único de los ayudantes que `schemas/index.ts` declaraba una vez en HEAD.
// Este módulo NO se reexporta a propósito desde el barril: los módulos de dominio
// lo importan directo desde `./campos-internos`.

/** Peso en kg del contrato: formato decimal y tope. `permiteVacio` acepta '' como "sin peso". */
export function campoPesoKg(mensajeFormato: string, opciones: { permiteVacio?: boolean } = {}) {
  return z.string().superRefine((valor, ctx) => {
    if (opciones.permiteVacio && valor === '') return;
    if (!DECIMAL_STRING_REGEX.test(valor)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: mensajeFormato });
    } else if (!esPesoKgValido(valor)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: MENSAJE_PESO_FUERA_DE_RANGO });
    }
  });
}

/** Esfuerzo del contrato (1–10 en pasos de 0,5). `permiteVacio` acepta '' como "sin esfuerzo". */
export function campoRpe(opciones: { permiteVacio?: boolean } = {}) {
  return z
    .string()
    .refine(
      (valor) => (opciones.permiteVacio && valor === '') || esRpeValido(valor),
      MENSAJE_ESFUERZO_INVALIDO
    );
}

export const fechaCalendarioRealSchema = z
  .string()
  .regex(FECHA_CALENDARIO_REGEX, MENSAJE_FECHA_CALENDARIO)
  .refine(esFechaCalendarioReal, MENSAJE_FECHA_CALENDARIO);
