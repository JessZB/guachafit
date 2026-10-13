import { BadRequestException } from '@nestjs/common';
import type { RecursoNutricionalDTO } from '@guachafit/shared';
import { R2StorageService } from '../../antropometria/r2-storage.service';

// =============================================================================
// GUARDS DE TENANCY DE CLAVES DE BÓVEDA (RNF-001) — lógica pura sin I/O
// =============================================================================

export type ModuloClaveNutricion = 'comidas' | 'nutricion-recursos';

export function esClaveDelAlumnoEnModulo(
  storageKey: string,
  alumnoId: string,
  modulo: ModuloClaveNutricion
): boolean {
  return (
    storageKey.startsWith(`${modulo}/${alumnoId}/`) &&
    R2StorageService.validarStorageKeyEstructura(storageKey)
  );
}

/**
 * RNF-001: guard de tenancy por alumno de una clave de recurso: estructuralmente válida y
 * dentro del prefijo `nutricion-recursos/{alumnoId}/`. Compartido por el validador del PUT y
 * por el borrado post-replace (la tabla no tiene RLS; este guard es la frontera).
 */
export function esClaveDeRecursoDelAlumno(storageKey: string, alumnoId: string): boolean {
  return esClaveDelAlumnoEnModulo(storageKey, alumnoId, 'nutricion-recursos');
}

/**
 * LOTE API-N1 (RNF-001): guard de tenancy de una foto de plato: estructura válida y dentro del
 * prefijo `comidas/{alumnoId}/` que emite el presign del módulo `comidas`.
 */
export function esClaveDeFotoComidaDelAlumno(storageKey: string, alumnoId: string): boolean {
  return esClaveDelAlumnoEnModulo(storageKey, alumnoId, 'comidas');
}

/** Claves de bóveda no vacías de una lista de recursos (los enlaces externos no tienen). */
export function storageKeysDeRecursos(recursos: RecursoNutricionalDTO[]): string[] {
  return recursos
    .map((recurso) => recurso.storageKey)
    .filter((storageKey): storageKey is string => Boolean(storageKey));
}

/**
 * RNF-001 (pendiente): cada `storageKey` de recurso debe ser estructuralmente válido y
 * pertenecer al módulo `nutricion-recursos` del MISMO alumno dueño de las metas. Una clave
 * ajena (otro alumno u otro módulo) es un 400, nunca un recurso guardado que apunte a datos
 * de terceros.
 */
export function validarStorageKeysDeRecursos(
  recursos: RecursoNutricionalDTO[],
  alumnoId: string
): void {
  for (const recurso of recursos) {
    if (!recurso.storageKey) continue;
    if (!esClaveDeRecursoDelAlumno(recurso.storageKey, alumnoId)) {
      throw new BadRequestException(
        'El archivo del recurso no pertenece a este alumno o no es una clave válida. Súbelo de nuevo desde el editor de metas.'
      );
    }
  }
}
