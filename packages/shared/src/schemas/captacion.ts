import { z } from 'zod';

/**
 * D17: pausar o reanudar la captación por enlace (`PATCH /entrenador/captacion`).
 * `activa` es estrictamente booleano: ni "true" ni 1 se aceptan.
 */
export const ActualizarCaptacionSchema = z.object({
  activa: z.boolean(),
});
