import type { TenantRlsContext } from '@guachafit/database';
import { Rol } from '@guachafit/shared';
import type {
  PerimetrosCorporalesDTO,
  PlieguesCutaneosDTO,
} from '@guachafit/shared';
import { R2StorageService } from '../r2-storage.service';
import type { CallerAntropometria } from './contexto-antropometria';

/**
 * Reglas puras de negocio del módulo de antropometría (sin E/S).
 * Extraído sin cambios de `antropometria.service.ts` (P3: semántica idéntica).
 */

export function toIsoUtcString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

/** LOTE API-2: control antropométrico inexistente o de otro alumno (sin mostrar identificadores). */
export const MENSAJE_CONTROL_NO_ENCONTRADO = 'No encontramos esa medición. Actualiza la pantalla.';

/**
 * RNF-001: la clave es un objeto de la bóveda de antropometría de ESE alumno, con la estructura que
 * emite el presign. Sin distinguir mayúsculas: el contrato acepta UUID en cualquier caja.
 */
export function esClaveFotoDelAlumno(storageKey: string, alumnoId: string): boolean {
  return (
    storageKey.toLowerCase().startsWith(`antropometria/${alumnoId.toLowerCase()}/`) &&
    R2StorageService.validarStorageKeyEstructura(storageKey)
  );
}

/**
 * RNF-003/ADR-011 (etapa 3): contexto RLS del perfil según el actor de la petición.
 * - ALUMNO -> self-select (`current_usuario_id`).
 * - ENTRENADOR -> tenant del coach.
 * - SUPERADMIN -> bypass explícito.
 */
export function contextoRlsDeCaller(caller: CallerAntropometria): TenantRlsContext {
  if (caller.rol === Rol.ALUMNO) return { usuarioId: caller.id };
  if (caller.rol === Rol.SUPERADMIN) return { isSuperadmin: true };
  return { entrenadorId: caller.entrenadorId ?? caller.id };
}

export interface PerimetroEntrada {
  cuelloCm?: string | null;
  pechoCm?: string | null;
  cinturaCm?: string | null;
  caderaCm?: string | null;
  brazoCm?: string | null;
  musloCm?: string | null;
  brazoRelajadoCm?: string | null;
  brazoContraidoCm?: string | null;
  musloMedioCm?: string | null;
}

/**
 * RF-003 RN-02 (WU RF-003a): alias legados. `brazoCm` = brazo RELAJADO y `musloCm` = muslo
 * MEDIO; el payload nuevo tiene precedencia y el legado sigue funcionando (nunca ambos vacíos).
 */
export function resolverAliasPerimetros(perimetro?: PerimetroEntrada | null): {
  brazoRelajadoCm: string | null;
  musloMedioCm: string | null;
} {
  return {
    brazoRelajadoCm: perimetro?.brazoRelajadoCm ?? perimetro?.brazoCm ?? null,
    musloMedioCm: perimetro?.musloMedioCm ?? perimetro?.musloCm ?? null,
  };
}

// Vista estructural mínima de una fila de control persistida (incluye columnas legadas).
export interface FilaControlAntropometrico {
  cuelloCm?: string | null;
  pechoCm?: string | null;
  cinturaCm?: string | null;
  caderaCm?: string | null;
  brazoCm?: string | null;
  musloCm?: string | null;
  brazoRelajadoCm?: string | null;
  brazoContraidoCm?: string | null;
  musloMedioCm?: string | null;
  pliegueTricepsMm?: string | null;
  pliegueSubescapularMm?: string | null;
  pliegueSuprailiacoMm?: string | null;
  pliegueAbdominalMm?: string | null;
}

/**
 * RF-003 RN-02 (WU RF-003a): alias legados resueltos en lectura. `brazoCm`/`musloCm` conservan
 * los datos históricos (controles previos a las columnas nuevas) y el modelo nuevo los expone
 * también como `brazoRelajadoCm`/`musloMedioCm`; las columnas nuevas tienen precedencia.
 */
export function construirPerimetrosDTO(
  control: FilaControlAntropometrico
): PerimetrosCorporalesDTO | null {
  const brazoRelajadoCm = control.brazoRelajadoCm ?? control.brazoCm ?? null;
  const musloMedioCm = control.musloMedioCm ?? control.musloCm ?? null;

  return control.cuelloCm ||
    control.pechoCm ||
    control.cinturaCm ||
    control.caderaCm ||
    brazoRelajadoCm ||
    control.brazoContraidoCm ||
    musloMedioCm
    ? {
        cuelloCm: control.cuelloCm ?? undefined,
        pechoCm: control.pechoCm ?? undefined,
        cinturaCm: control.cinturaCm ?? undefined,
        caderaCm: control.caderaCm ?? undefined,
        brazoRelajadoCm: brazoRelajadoCm ?? undefined,
        brazoContraidoCm: control.brazoContraidoCm ?? undefined,
        musloMedioCm: musloMedioCm ?? undefined,
        brazoCm: brazoRelajadoCm ?? undefined,
        musloCm: musloMedioCm ?? undefined,
      }
    : null;
}

export function construirPlieguesDTO(
  control: FilaControlAntropometrico
): PlieguesCutaneosDTO | null {
  return control.pliegueTricepsMm ||
    control.pliegueSubescapularMm ||
    control.pliegueSuprailiacoMm ||
    control.pliegueAbdominalMm
    ? {
        tricepsMm: control.pliegueTricepsMm ?? undefined,
        subescapularMm: control.pliegueSubescapularMm ?? undefined,
        suprailiacoMm: control.pliegueSuprailiacoMm ?? undefined,
        abdominalMm: control.pliegueAbdominalMm ?? undefined,
      }
    : null;
}
