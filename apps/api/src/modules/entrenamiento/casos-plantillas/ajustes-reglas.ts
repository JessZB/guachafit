import { BadRequestException } from '@nestjs/common';
import type { AjusteEjercicioPlantillaDTO, BloqueDiaRutinaDTO } from '@guachafit/shared';

/** LOTE API-2: un ajuste apunta a un día o ejercicio que no está en la plantilla. */
export const MENSAJE_AJUSTE_AJENO_A_PLANTILLA =
  'Uno de los ajustes no corresponde a esta plantilla. Ábrela de nuevo.';

/**
 * Aplica overrides de carga/series/reps/RPE sobre los bloques (copia con `diaId`
 * originales de la plantilla, previa a la clonación por alumno).
 */
export function aplicarAjustesBloques(
  bloques: BloqueDiaRutinaDTO[],
  ajustes: AjusteEjercicioPlantillaDTO[] | undefined
): void {
  if (!ajustes || ajustes.length === 0) return;

  for (const ajuste of ajustes) {
    const bloque = bloques.find((b) => b.diaId === ajuste.diaId);
    if (!bloque) {
      throw new BadRequestException(MENSAJE_AJUSTE_AJENO_A_PLANTILLA);
    }

    const ejercicio = bloque.ejercicios.find((e) =>
      ajuste.ejercicioId ? e.ejercicioId === ajuste.ejercicioId : e.nombre === ajuste.nombre
    );
    if (!ejercicio) {
      throw new BadRequestException(MENSAJE_AJUSTE_AJENO_A_PLANTILLA);
    }

    if (ajuste.pesoPrescritoKg !== undefined) ejercicio.peso = ajuste.pesoPrescritoKg;
    if (ajuste.series !== undefined) ejercicio.series = ajuste.series;
    if (ajuste.reps !== undefined) ejercicio.reps = ajuste.reps;
    if (ajuste.rpe !== undefined) ejercicio.rpe = ajuste.rpe;
  }
}
