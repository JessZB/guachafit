import { eq, perfilesEntrenador } from '@guachafit/database';
import type { Database } from '@guachafit/database';

/**
 * D17: `true` si algún perfil de entrenador ya usa `codigo` (comparación exacta, ya normalizado).
 * Compartido por el alta de entrenador y la rotación del enlace.
 */
export async function coachCodeEnUso(
  db: Pick<Database, 'select'>,
  codigo: string
): Promise<boolean> {
  const filas = await db
    .select({ coachCode: perfilesEntrenador.coachCode })
    .from(perfilesEntrenador)
    .where(eq(perfilesEntrenador.coachCode, codigo));
  return filas.some((fila) => fila.coachCode === codigo);
}
