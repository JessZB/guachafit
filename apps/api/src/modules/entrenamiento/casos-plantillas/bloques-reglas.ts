import type { BloqueDiaRutinaDTO } from '@guachafit/shared';
import { obtenerDiaSugeridoBloque } from '../../../common/adherencia.util';

/** Máximo de días de una rutina semanal (`GuardarRutinaSemanalSchema.bloques.max(7)`). */
export const MAX_DIAS_RUTINA = 7;

/**
 * Copia profunda e independiente de los bloques. Regenera `diaId` (UUID) para que
 * dos asignaciones de la misma plantilla no compartan identificadores de bloque.
 * Los ajustes se aplican ANTES sobre una copia con los `diaId` originales, por lo
 * que aquí los bloques ya llegan ajustados.
 */
export function clonarYRegenerarDiaIds(bloques: BloqueDiaRutinaDTO[]): BloqueDiaRutinaDTO[] {
  const clonados = structuredClone(bloques) as BloqueDiaRutinaDTO[];
  for (const bloque of clonados) {
    bloque.diaId = crypto.randomUUID();
  }
  return clonados;
}

/**
 * Los días añadidos por FUSIONAR no repiten el día sugerido de los existentes ni
 * entre sí. Cada día nuevo conserva su día si está libre; si no, toma el siguiente libre de la
 * semana (con 7 días como máximo siempre hay uno). Los días existentes no se tocan.
 */
export function asignarDiasLibres(
  existentes: BloqueDiaRutinaDTO[],
  nuevos: BloqueDiaRutinaDTO[]
): BloqueDiaRutinaDTO[] {
  const ocupados = new Set(existentes.map((bloque, idx) => obtenerDiaSugeridoBloque(bloque, idx)));
  return nuevos.map((bloque) => {
    let dia =
      bloque.diaSugerido && bloque.diaSugerido >= 1 && bloque.diaSugerido <= 7
        ? bloque.diaSugerido
        : 1;
    for (let paso = 0; paso < 7 && ocupados.has(dia); paso++) {
      dia = (dia % 7) + 1;
    }
    ocupados.add(dia);
    return { ...bloque, diaSugerido: dia };
  });
}
