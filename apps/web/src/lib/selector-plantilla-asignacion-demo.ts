/**
 * Lógica pura del módulo `selector-plantilla-asignacion` (prompt 71, lote A).
 *
 * MODO DEMO EXPLÍCITO: la asignación se simula en estado local, sin llamada API.
 * No se invoca `onAsignada`: el refresco del padre consulta la API real,
 * innecesaria en demo porque el expediente ya se hidrata de fixtures.
 */
import {
  ModoAsignacionPlantilla,
  type AsignacionPlantillaResponseDTO,
  type PlantillaRutinaDTO,
} from '@guachafit/shared';

/** Construye el `AsignacionPlantillaResponseDTO` de una asignación demo (siempre 1/1). */
export function construirResultadoDemoAsignacion(
  detalle: PlantillaRutinaDTO,
  modo: ModoAsignacionPlantilla,
  alumnoId: string
): AsignacionPlantillaResponseDTO {
  return {
    plantillaId: detalle.id,
    modo,
    totalSolicitados: 1,
    exitosos: 1,
    fallidos: 0,
    resultados: [
      {
        alumnoId,
        exito: true,
        rutinaId: `demo-rutina-${alumnoId}`,
        rutinaNombre: detalle.nombre,
        bloquesTotal: detalle.bloques.length,
      },
    ],
  };
}
