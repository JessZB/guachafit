import { z } from 'zod';
import { NivelObjetivoPlantilla, ModoAsignacionPlantilla } from '../enums';
import {
  DECIMAL_STRING_REGEX,
  MENSAJE_PESO_FUERA_DE_RANGO,
  MENSAJE_ESFUERZO_INVALIDO,
  esPesoKgValido,
  esRpeValido,
} from './comunes';
import { BloqueDiaRutinaSchema } from './entrenamiento';
import { campoPesoKg, campoRpe } from './campos-internos';

// =============================================================================
// RF-017: BANCO DE PLANTILLAS DE RUTINA Y PRESCRIPCIÓN REUTILIZABLE
// =============================================================================

/**
 * RF-017 RN-01: plantilla reutilizable del coach. Reutiliza BloqueDiaRutinaSchema
 * para la estructura de días/ejercicios (series, reps, peso prescrito, RPE, notas).
 */
export const CrearPlantillaRutinaSchema = z.object({
  nombre: z
    .string()
    .min(3, 'El nombre de la plantilla debe tener al menos 3 caracteres')
    .max(120, 'El nombre de la plantilla no puede exceder 120 caracteres'),
  nivelObjetivo: z.nativeEnum(NivelObjetivoPlantilla, {
    errorMap: () => ({
      message: 'El nivel objetivo no es válido (principiante, intermedio, avanzado)',
    }),
  }),
  bloques: z
    .array(BloqueDiaRutinaSchema)
    .min(1, 'La plantilla debe definir al menos un bloque de día de entrenamiento')
    .max(7, 'Una plantilla no puede exceder 7 bloques de entrenamiento'),
  activa: z.boolean().optional(),
});

export const ActualizarPlantillaRutinaSchema = z.object({
  nombre: z.string().min(3, 'El nombre de la plantilla debe tener al menos 3 caracteres').max(120).optional(),
  nivelObjetivo: z.nativeEnum(NivelObjetivoPlantilla).optional(),
  bloques: z
    .array(BloqueDiaRutinaSchema)
    .min(1, 'La plantilla debe definir al menos un bloque de día de entrenamiento')
    .max(7, 'Una plantilla no puede exceder 7 bloques de entrenamiento')
    .optional(),
  activa: z.boolean().optional(),
});

/**
 * RF-017 Escenario 2: ajuste puntual de cargas/series/reps antes de confirmar la
 * asignación. Se localiza por `diaId` + (`ejercicioId` o `nombre` del ejercicio).
 */
export const AjusteEjercicioPlantillaSchema = z
  .object({
    diaId: z.string().min(1, 'El día del ajuste es obligatorio'),
    ejercicioId: z.string().uuid('No encontramos ese ejercicio. Actualiza la pantalla e inténtalo de nuevo.').optional(),
    nombre: z.string().min(2).max(120, 'El nombre del ejercicio no puede exceder 120 caracteres').optional(),
    pesoPrescritoKg: campoPesoKg('El peso prescrito debe tener formato decimal (ej. 60.00)').optional(),
    series: z.number().int().min(1).max(50).optional(),
    reps: z.string().min(1).max(30).optional(),
    rpe: campoRpe().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.ejercicioId && !data.nombre) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ejercicioId'],
        message: 'Cada ajuste debe indicar el ejercicio (elígelo de la lista o escribe su nombre)',
      });
    }
    const sinCambios =
      data.pesoPrescritoKg === undefined &&
      data.series === undefined &&
      data.reps === undefined &&
      data.rpe === undefined;
    if (sinCambios) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['series'],
        message: 'Cada ajuste debe cambiar al menos el peso, las series, las repeticiones o el RPE',
      });
    }
  });

/**
 * RF-017 RN-03: asignación (individual o masiva) de una plantilla a uno o más alumnos.
 * `ajustes` aplica overrides de carga/series/reps antes de confirmar la prescripción.
 */
export const AsignarPlantillaSchema = z.object({
  alumnoIds: z
    .array(z.string().uuid('No encontramos uno de los alumnos elegidos. Actualiza la pantalla e inténtalo de nuevo.'))
    .min(1, 'Debe indicar al menos un alumno')
    .max(50, 'No se pueden asignar más de 50 alumnos en una sola solicitud'),
  modo: z.nativeEnum(ModoAsignacionPlantilla, {
    errorMap: () => ({ message: 'Elige si la rutina reemplaza la actual o se combina con ella' }),
  }),
  ajustes: z
    .array(AjusteEjercicioPlantillaSchema)
    .max(100, 'No se pueden aplicar más de 100 ajustes por asignación')
    .optional(),
});
