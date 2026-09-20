/**
 * WU19: filtros del monitor de adherencia (búsqueda por nombre + chips del semáforo).
 *
 * Lógica pura y testeable: el componente solo mantiene el estado y aplica estas funciones sobre
 * la lista YA ordenada, de modo que el filtro respeta el orden activo (riesgo o nombre A–Z).
 *
 * WU25a: el filtrado real pasa a ser server-side (`?q=` + `?semaforo=`); estos helpers quedan
 * como la referencia semántica compartida (y como filtro del modo demo, que trabaja local).
 */
import {
  SemaforoAdherencia,
  type MonitorAdherenciaSemanalDTO,
  type ResumenMonitorAdherenciaDTO,
  type SemaforoFiltroMonitorDTO,
} from '@guachafit/shared';
import { normalizarTextoBusqueda } from './texto-busqueda';

// WU20: la normalización vive en `./texto-busqueda` (compartida con el resto de filtros);
// se re-exporta aquí para no romper a los consumidores existentes del monitor.
export { normalizarTextoBusqueda };

export type FiltroSemaforoMonitor = 'todos' | 'rojo' | 'amarillo' | 'verde' | 'sin_plan';

/**
 * WU25a: traduce el chip de la UI al valor que acepta `GET /entrenador/monitor-adherencia`
 * (`sin_plan` de la UI => `sinPlan` del API). `todos` no viaja al servidor.
 */
export function aParametroSemaforoMonitor(
  filtro: FiltroSemaforoMonitor
): SemaforoFiltroMonitorDTO | null {
  if (filtro === 'todos') return null;
  return filtro === 'sin_plan' ? 'sinPlan' : filtro;
}

type AlumnoFiltrable = Pick<
  MonitorAdherenciaSemanalDTO,
  'nombreCompleto' | 'tienePlanActivo' | 'sinPendientesSemana' | 'semaforoAdherencia'
>;

/**
 * Paridad EXACTA con los contadores del resumen superior del monitor:
 * - `rojo`: con plan, con pendientes y semáforo ROJO (un 0/0 sin bloques vencidos NO es riesgo).
 * - `amarillo`/`verde`: con plan y semáforo correspondiente.
 * - `sin_plan`: sin rutina activa.
 * Los alumnos con plan y sin pendientes aún ("Al día — sin pendientes") solo aparecen en `todos`.
 */
export function coincideFiltroSemaforo(
  alumno: AlumnoFiltrable,
  filtro: FiltroSemaforoMonitor
): boolean {
  if (filtro === 'todos') return true;
  if (filtro === 'sin_plan') return !alumno.tienePlanActivo;
  if (!alumno.tienePlanActivo) return false;
  if (filtro === 'rojo') {
    return !alumno.sinPendientesSemana && alumno.semaforoAdherencia === SemaforoAdherencia.ROJO;
  }
  if (filtro === 'amarillo') {
    return alumno.semaforoAdherencia === SemaforoAdherencia.AMARILLO;
  }
  return alumno.semaforoAdherencia === SemaforoAdherencia.VERDE;
}

export interface OpcionesFiltroMonitor {
  busqueda?: string;
  filtroSemaforo?: FiltroSemaforoMonitor;
}

/** Filtro combinado (nombre + semáforo) preservando el orden de la lista recibida. */
export function filtrarMonitorAlumnos<T extends AlumnoFiltrable>(
  alumnos: readonly T[],
  opciones: OpcionesFiltroMonitor = {}
): T[] {
  const termino = normalizarTextoBusqueda(opciones.busqueda);
  const filtro = opciones.filtroSemaforo ?? 'todos';
  if (termino.length === 0 && filtro === 'todos') return [...alumnos];

  return alumnos.filter((alumno) => {
    if (!coincideFiltroSemaforo(alumno, filtro)) return false;
    if (termino.length === 0) return true;
    return normalizarTextoBusqueda(alumno.nombreCompleto).includes(termino);
  });
}

/** ¿Hay algún filtro o búsqueda activa? (para "N resultados" y el estado vacío honesto). */
export function hayFiltroMonitorActivo(opciones: OpcionesFiltroMonitor = {}): boolean {
  return (
    normalizarTextoBusqueda(opciones.busqueda).length > 0 ||
    (opciones.filtroSemaforo ?? 'todos') !== 'todos'
  );
}

/**
 * WU25a: resumen de la cartera COMPLETA del monitor en modo demo, con paridad EXACTA con el
 * `resumen` que calcula el servidor (`calcularSemanaAdherencia`): `rojo` excluye a los alumnos
 * con plan pero sin bloques vencidos (0/0 neutral de D6) y `sinPendientes` los cuenta aparte.
 */
export function calcularResumenMonitorAdherencia(
  alumnos: readonly MonitorAdherenciaSemanalDTO[]
): ResumenMonitorAdherenciaDTO {
  const conPlan = alumnos.filter((alumno) => alumno.tienePlanActivo);
  return {
    rojo: conPlan.filter(
      (alumno) =>
        !alumno.sinPendientesSemana && alumno.semaforoAdherencia === SemaforoAdherencia.ROJO
    ).length,
    amarillo: conPlan.filter((alumno) => alumno.semaforoAdherencia === SemaforoAdherencia.AMARILLO)
      .length,
    verde: conPlan.filter((alumno) => alumno.semaforoAdherencia === SemaforoAdherencia.VERDE)
      .length,
    sinPlan: alumnos.length - conPlan.length,
    sinPendientes: conPlan.filter((alumno) => alumno.sinPendientesSemana).length,
    total: alumnos.length,
  };
}
