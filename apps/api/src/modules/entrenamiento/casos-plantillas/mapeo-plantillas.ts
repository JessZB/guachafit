import type {
  BloqueDiaRutinaDTO,
  NivelObjetivoPlantilla,
  PlantillaRutinaDTO,
  PlantillaRutinaResumenDTO,
} from '@guachafit/shared';
import type { PlantillaRow } from './contexto-plantillas';

export function mapearPlantillaDTO(fila: PlantillaRow): PlantillaRutinaDTO {
  return {
    id: fila.id,
    entrenadorId: fila.entrenadorId,
    nombre: fila.nombre,
    nivelObjetivo: fila.nivelObjetivo as NivelObjetivoPlantilla,
    bloques: fila.bloques as BloqueDiaRutinaDTO[],
    activa: fila.activa,
    createdAtUtc: aIsoString(fila.createdAtUtc),
    updatedAtUtc: aIsoString(fila.updatedAtUtc),
  };
}

export function mapearPlantillaResumen(fila: PlantillaRow): PlantillaRutinaResumenDTO {
  const bloques = (fila.bloques as BloqueDiaRutinaDTO[]) ?? [];
  return {
    id: fila.id,
    entrenadorId: fila.entrenadorId,
    nombre: fila.nombre,
    nivelObjetivo: fila.nivelObjetivo as NivelObjetivoPlantilla,
    totalDias: bloques.length,
    totalEjercicios: bloques.reduce((total, bloque) => total + (bloque.ejercicios?.length ?? 0), 0),
    activa: fila.activa,
    createdAtUtc: aIsoString(fila.createdAtUtc),
    updatedAtUtc: aIsoString(fila.updatedAtUtc),
  };
}

function aIsoString(fecha: Date | string): string {
  return typeof fecha === 'string' ? new Date(fecha).toISOString() : fecha.toISOString();
}
