/**
 * WU20: filtros del historial de pagos del alumno (chips por estado de conciliación).
 *
 * Espeja EXACTAMENTE lo que cada fila ya renderiza: aprobado → "Verificado",
 * rechazado → "Rechazado", revertido → "Revertido" (RF-007) y cualquier otro valor → "En Revisión"
 * (pendiente).
 *
 * Expone también `tonoEstadoTransaccion` (tono del badge de la fila, con el mismo criterio de
 * estados que las etiquetas).
 */
import { EstadoConciliacion, type TransaccionPagoDetalleDTO } from '@guachafit/shared';
import type { TonoSemaforo } from './adherencia';

export type FiltroEstadoTransaccionPago = EstadoConciliacion | 'todos';

type TransaccionFiltrable = Pick<TransaccionPagoDetalleDTO, 'estadoConciliacion'>;

/** Normaliza el estado crudo al grupo visible (desconocidos cuentan como pendientes). */
export function normalizarEstadoTransaccion(
  estado: string | null | undefined
): EstadoConciliacion {
  if (estado === EstadoConciliacion.APROBADO) return EstadoConciliacion.APROBADO;
  if (estado === EstadoConciliacion.RECHAZADO) return EstadoConciliacion.RECHAZADO;
  if (estado === EstadoConciliacion.REVERTIDO) return EstadoConciliacion.REVERTIDO;
  return EstadoConciliacion.PENDIENTE;
}

/** Etiqueta visible de cada estado (la misma que muestra el badge de la fila). */
export function etiquetaEstadoTransaccion(estado: string | null | undefined): string {
  switch (normalizarEstadoTransaccion(estado)) {
    case EstadoConciliacion.APROBADO:
      return 'Verificado';
    case EstadoConciliacion.RECHAZADO:
      return 'Rechazado';
    case EstadoConciliacion.REVERTIDO:
      return 'Revertido';
    default:
      return 'En Revisión';
  }
}

/** Tono del badge según el estado normalizado (mismo criterio que el filtro). */
export function tonoEstadoTransaccion(estado: string | null | undefined): TonoSemaforo {
  switch (normalizarEstadoTransaccion(estado)) {
    case EstadoConciliacion.APROBADO:
      return 'success';
    case EstadoConciliacion.RECHAZADO:
      return 'danger';
    case EstadoConciliacion.REVERTIDO:
      return 'neutral';
    default:
      return 'warning';
  }
}

/** Filtro por estado; `todos` devuelve una copia preservando el orden recibido. */
export function filtrarTransaccionesPorEstado<T extends TransaccionFiltrable>(
  txs: readonly T[],
  filtro: FiltroEstadoTransaccionPago = 'todos'
): T[] {
  if (filtro === 'todos') return [...txs];
  return txs.filter((tx) => normalizarEstadoTransaccion(tx.estadoConciliacion) === filtro);
}

/** ¿Hay un chip de estado activo? (para el contador "N de M" y el vacío "Sin resultados"). */
export function hayFiltroHistorialActivo(filtro: FiltroEstadoTransaccionPago = 'todos'): boolean {
  return filtro !== 'todos';
}
