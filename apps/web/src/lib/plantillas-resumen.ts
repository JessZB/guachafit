/**
 * M8 plantillas (fase B, prompt 58) · lógica pura del banco de plantillas.
 *
 * Extraída de `PlantillasPage.tsx:335-348` sin cambios (R5): deriva el resumen
 * del listado desde el detalle devuelto por el API (`POST`/`PATCH /plantillas`).
 * Difiere de `resumirPlantillaDemo` (`demo-plantillas.ts:188-203`) en que tolera
 * bloques sin `ejercicios` (`?.length ?? 0`, respuesta real del servidor).
 * La fusión de ambas queda para la fase D (fila 32 de la consolidación 48).
 */
import type {
  PlantillaRutinaDTO,
  PlantillaRutinaResumenDTO,
} from '@guachafit/shared';

/** Resumen (listado) derivado de un detalle del API: única fuente para el guardado real. */
export function resumirDetallePlantilla(res: PlantillaRutinaDTO): PlantillaRutinaResumenDTO {
  return {
    id: res.id,
    entrenadorId: res.entrenadorId,
    nombre: res.nombre,
    nivelObjetivo: res.nivelObjetivo,
    totalDias: res.bloques.length,
    totalEjercicios: res.bloques.reduce(
      (total, bloque) => total + (bloque.ejercicios?.length ?? 0),
      0
    ),
    activa: res.activa,
    createdAtUtc: res.createdAtUtc,
    updatedAtUtc: res.updatedAtUtc,
  };
}
