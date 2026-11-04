import { z } from 'zod';
import { ActualizarCaptacionSchema } from '../schemas';

export type ActualizarCaptacionDTO = z.infer<typeof ActualizarCaptacionSchema>;

/**
 * D17: estado del enlace de captación del entrenador.
 * `registrosPorEnlace` cuenta los alumnos con origen `enlace` creados desde la última rotación
 * (todos los de origen `enlace` si el enlace nunca se rotó).
 */
export interface CaptacionEntrenadorDTO {
  coachCode: string;
  captacionActiva: boolean;
  /** ISO 8601 UTC de la última rotación; `null` si nunca se rotó. */
  enlaceRotadoEnUtc: string | null;
  registrosPorEnlace: number;
}

/** D17: resultado de rotar o pausar/reanudar. `cambioAplicado = false` cuando ya estaba así. */
export type CaptacionEntrenadorResultadoDTO = CaptacionEntrenadorDTO & {
  cambioAplicado: boolean;
  mensaje: string;
};
