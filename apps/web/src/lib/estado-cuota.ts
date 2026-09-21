/**
 * WU12b: badge del estado real de la cuota del mes para la tarjeta "Pagos y cuotas" del menú.
 *
 * Verdad de datos: el badge JAMÁS muestra verde con deuda. Un resumen ausente (cargando o error
 * de red) devuelve `null` para que el llamador omita el badge. "Al día" exige deuda cero tanto en
 * la cuota del mes como en el total acumulado: `saldoPendienteTotalUsd` puede retener cuotas de
 * periodos anteriores aunque la cuota encontrada para el periodo actual esté saldada.
 */
import { EstadoCuota, type ResumenFinancieroAlumnoDTO } from '@guachafit/shared';

/** Tono visual del badge; cada superficie decide sus clases concretas (ver DESIGN.md). */
export type TonoCuota = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface BadgeCuota {
  texto: string;
  tono: TonoCuota;
}

/** Campos del resumen financiero (`GET /finanzas/clientes/:id/historial`) que alimentan el badge. */
export type ResumenParaBadge = Pick<
  ResumenFinancieroAlumnoDTO,
  'cuotaMesActual' | 'saldoPendienteTotalUsd'
>;

/** true solo con un monto numérico estrictamente positivo; `''`, `null`, `undefined` o `'0.00'` no son deuda. */
function tieneSaldo(valor: string | null | undefined): boolean {
  const numero = Number(String(valor ?? '').trim());
  return Number.isFinite(numero) && numero > 0;
}

/**
 * Deriva el badge de cuota del mes.
 * - `null`/`undefined` → `null` (sin dato: cargando o error; nunca un verde falso).
 * - Sin cuota emitida → neutro "Sin cuota vigente".
 * - Estado nuevo del backend aún no mapeado → neutro "Sin dato" (nunca verde).
 */
export function badgeEstadoCuota(
  resumen: ResumenParaBadge | null | undefined
): BadgeCuota | null {
  if (!resumen) return null;

  const cuota = resumen.cuotaMesActual;
  if (!cuota) return { texto: 'Sin cuota vigente', tono: 'neutral' };

  switch (cuota.estado) {
    case EstadoCuota.AL_DIA:
      // Verde solo con deuda cero: el total acumulado puede incluir cuotas anteriores impagas.
      return tieneSaldo(cuota.saldoPendienteUsd) || tieneSaldo(resumen.saldoPendienteTotalUsd)
        ? { texto: 'Saldo pendiente', tono: 'warning' }
        : { texto: 'Al día', tono: 'success' };
    case EstadoCuota.ABONADA_PARCIAL:
      return { texto: 'Abono parcial', tono: 'warning' };
    case EstadoCuota.EMITIDA:
      return { texto: 'Pendiente', tono: 'warning' };
    case EstadoCuota.POR_VENCER:
      return { texto: 'Por vencer', tono: 'warning' };
    case EstadoCuota.PENDIENTE_REVISION:
      return { texto: 'Pago en revisión', tono: 'info' };
    case EstadoCuota.VENCIDA:
      return { texto: 'Vencida', tono: 'danger' };
    case EstadoCuota.ANULADA:
      // Una cuota anulada no está vigente para el alumno: mismo estado que no tener cuota.
      return { texto: 'Sin cuota vigente', tono: 'neutral' };
    default:
      return { texto: 'Sin dato', tono: 'neutral' };
  }
}
