import { z } from 'zod';

/**
 * WU-I (RF-009 §4.B): pestañas del tablero de control de cartera del coach.
 *
 * - `mora`: cuotas con corte superado y saldo > 0 (excluye pagos en revisión).
 * - `por_vencer`: cuotas con corte en los próximos ≤ 5 días y saldo > 0.
 * - `revision`: comprobantes reportados esperando conciliación.
 * - `al_dia`: cuotas del ciclo en curso cubiertas al 100%.
 */
export const PestanaCarteraSchema = z.enum(['mora', 'por_vencer', 'revision', 'al_dia']);

/** WU-I: página por defecto y techo duro de `GET /finanzas/cartera`. */
export const LIMITE_CARTERA_POR_DEFECTO = 25;
export const LIMITE_CARTERA_MAXIMO = 100;

/**
 * WU-I (RF-009): filtros server-side del tablero de cartera.
 *
 * `q` busca por nombre/apellido del alumno (case-insensitive, texto literal) y `pestana`
 * selecciona la lista; el `resumen` (KPIs + contadores) siempre describe la cartera completa.
 */
export const FiltroCarteraSchema = z.object({
  q: z.string().max(200, 'El término de búsqueda no puede exceder 200 caracteres').optional(),
  pestana: PestanaCarteraSchema.optional().default('mora'),
  limit: z
    .coerce
    .number()
    .int('El límite debe ser un número entero')
    .min(1, 'El límite debe ser al menos 1')
    .max(LIMITE_CARTERA_MAXIMO, 'El límite no puede exceder 100')
    .optional()
    .default(LIMITE_CARTERA_POR_DEFECTO),
  offset: z
    .coerce
    .number()
    .int('La posición de inicio debe ser un número entero')
    .min(0, 'La posición de inicio no puede ser negativa')
    .optional()
    .default(0),
});
