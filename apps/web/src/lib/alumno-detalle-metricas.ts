/**
 * Reglas puras de la ficha del alumno: semáforo de pago, último entrenamiento y edad.
 *
 * Lógica pura extraída de `pages/entrenador/AlumnoDetallePage.tsx` (SL-1, R1).
 * D2: sin resumen financiero real no se inventa un semáforo (nada de "moroso" por fallo de red).
 */
import {
  EstadoSesion,
  type ResumenFinancieroAlumnoDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import type { SemaforoPago } from './etiquetas-dominio';
import type { ControlAntroFila } from './alumno-detalle-controles';

/** Sesiones que cuentan como entrenamiento realizado (nunca una 'planificada'). */
export function esSesionRealizada(sesion?: SesionEntrenamientoDetalleDTO | null): boolean {
  return (
    sesion?.estado === EstadoSesion.COMPLETADA || sesion?.estado === EstadoSesion.EN_PROGRESO
  );
}

/**
 * D2: resuelve el semáforo de pago sin inventar estado. Si el perfil no lo trae y no hay
 * resumen financiero, devuelve `null` (el llamador muestra "Sin dato", nunca "moroso").
 */
export function calcularSemaforoPago(
  semaforoPerfil: SemaforoPago | null | undefined,
  finanzas: ResumenFinancieroAlumnoDTO | null
): SemaforoPago | null {
  if (semaforoPerfil) return semaforoPerfil;
  if (!finanzas) return null;
  return Number(finanzas.saldoPendienteTotalUsd) > 0 ? 'moroso' : 'al_dia';
}

/**
 * WU5: "Último Entrenamiento Realizado" solo considera sesiones completadas o en progreso.
 * WU25b: la fuente canónica es el endpoint `/ultima` y el historial solo es respaldo
 * (la página 1 ya es lo más reciente).
 */
export function resolverUltimoEntrenamiento(
  ultimaSesion: SesionEntrenamientoDetalleDTO | null,
  historialSesiones: SesionEntrenamientoDetalleDTO[]
): SesionEntrenamientoDetalleDTO | null {
  return (
    (esSesionRealizada(ultimaSesion) ? ultimaSesion : null) ??
    historialSesiones.find((ses) => esSesionRealizada(ses)) ??
    null
  );
}

/** Edad en años cumplidos desde una fecha ISO; sin fecha o inválida devuelve 0. */
export function calcularEdadAlumno(fechaStr: string): number {
  if (!fechaStr) return 0;
  const nacimiento = new Date(fechaStr);
  if (isNaN(nacimiento.getTime())) return 0;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const m = hoy.getMonth() - nacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--;
  }
  return Math.max(0, edad);
}

export interface DeltasAntropometricos {
  deltaPeso: string | null;
  deltaGrasa: string | null;
  deltaCintura: string | null;
}

/**
 * Deltas entre los dos controles más recientes del tab Antropometría.
 * N3: con datos reales los perímetros/% grasa pueden faltar en cualquiera de los dos
 * controles; sin ambos valores no hay delta (nunca NaN).
 */
export function calcularDeltasAntropometricos(
  actual: ControlAntroFila,
  anterior?: ControlAntroFila | null
): DeltasAntropometricos {
  if (!anterior) return { deltaPeso: null, deltaGrasa: null, deltaCintura: null };
  return {
    deltaPeso: (Number(actual.pesoKg) - Number(anterior.pesoKg)).toFixed(1),
    deltaGrasa:
      actual.grasaPorcentaje && anterior.grasaPorcentaje
        ? (Number(actual.grasaPorcentaje) - Number(anterior.grasaPorcentaje)).toFixed(1)
        : null,
    deltaCintura:
      actual.cinturaCm && anterior.cinturaCm
        ? (Number(actual.cinturaCm) - Number(anterior.cinturaCm)).toFixed(1)
        : null,
  };
}
