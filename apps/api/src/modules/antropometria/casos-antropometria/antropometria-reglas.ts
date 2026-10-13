import type { TenantRlsContext } from '@guachafit/database';
import { Rol } from '@guachafit/shared';
import type {
  PerimetrosCorporalesDTO,
  PlieguesCutaneosDTO,
} from '@guachafit/shared';
import { R2StorageService } from '../r2-storage.service';
import type { CallerAntropometria } from './contexto-antropometria';

/**
 * Pure business rules of the antropometria module (no I/O).
 * Extracted verbatim from `antropometria.service.ts` (P3: identical semantics).
 */

export function toIsoUtcString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

/** LOTE API-2: control antropométrico inexistente o de otro alumno (sin mostrar identificadores). */
export const MENSAJE_CONTROL_NO_ENCONTRADO = 'No encontramos esa medición. Actualiza la pantalla.';

/**
 * RNF-001: the key must be an object of THIS student's antropometria vault,
 * with the structure emitted by the presign. Case-insensitive: the contract
 * accepts UUIDs in any case.
 */
export function esClaveFotoDelAlumno(storageKey: string, alumnoId: string): boolean {
  return (
    storageKey.toLowerCase().startsWith(`antropometria/${alumnoId.toLowerCase()}/`) &&
    R2StorageService.validarStorageKeyEstructura(storageKey)
  );
}

/**
 * RNF-003/ADR-011: RLS context of the profile according to the request actor.
 * - ALUMNO -> self-select (`current_usuario_id`).
 * - ENTRENADOR -> coach tenant.
 * - SUPERADMIN -> explicit bypass.
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
 * RF-003 RN-02: legacy aliases. `brazoCm` is the RELAXED arm and `musloCm` is
 * the MID thigh; the new payload takes precedence and the legacy one keeps
 * working (never both empty).
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

// Minimal structural view of a persisted control row (legacy columns included).
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
 * RF-003 RN-02: legacy aliases resolved on read. `brazoCm`/`musloCm` keep the
 * historical data (controls before the new columns) and the new model also
 * exposes them as `brazoRelajadoCm`/`musloMedioCm`; the new columns win.
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
