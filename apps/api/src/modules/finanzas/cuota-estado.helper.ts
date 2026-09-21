/**
 * WU-H (RF-008): máquina de estados de la cuota como helper PURO y testeable.
 *
 * La transición que "vivía solo en el simulador de tests" (`CuotaStateMachine.procesarCorteDiario`
 * de `test/bdd/helpers/finance-test-engine.ts`) se implementa aquí para que el barrido diario real
 * (BillingReminderProcessor) use EXACTAMENTE la misma regla de negocio.
 *
 * Reglas del RF-008 §4.A implementadas:
 * - `Al Día / Pagada`: saldo pendiente $0.00 (sin importar el estado persistido previo).
 * - `Por Vencer`: faltan entre 5 y 0 días para `fecha_corte_utc` con saldo > $0.00.
 * - `Pendiente de Revisión`: PAUSA el barrido; no degrada a `VENCIDA` mientras un pago esté en
 *   revisión (Gherkin Escenario 2 + Escenario 3 "no existen pagos en estado Pendiente").
 * - `Vencida / En Mora`: `T > fecha_corte_utc` con saldo > $0.00.
 * - `Anulada`: estado terminal, el barrido nunca lo toca.
 *
 * Decisión documentada (WU-H): RF-008 NO define "avance de corte" ni renovación automática —
 * §7 lista las renovaciones automáticas como ausentes y el cuerpo del RF no las especifica. El
 * barrido, por tanto, NO inventa un nuevo periodo/corte: `VENCIDA` persiste con la misma
 * `fecha_corte_utc` y el saldo acumulado hasta que el pago la liquide o un humano la anule.
 */
import { EstadoCuota } from '@guachafit/shared';
import { toCents } from './finanzas.service';

/** Días previos a la fecha de corte en los que una cuota impaga pasa a `POR_VENCER` (RF-008 §4.A). */
export const DIAS_VENTANA_POR_VENCER = 5;

export const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Snapshot mínimo de la cuota que el barrido necesita evaluar. */
export interface CuotaParaBarrido {
  estado: EstadoCuota;
  saldoPendienteUsd: string;
  fechaCorteUtc: Date;
}

export interface ResultadoBarrido {
  /** Estado que corresponde tras el corte diario (puede ser el mismo que ya tenía). */
  estado: EstadoCuota;
  /** `true` solo cuando el estado persistido debe cambiar. */
  cambio: boolean;
  /** Motivo legible para logs/observabilidad (no se persiste). */
  motivo: 'anulada' | 'saldada' | 'pausa_revision' | 'mora' | 'por_vencer' | 'sin_cambio';
}

/**
 * Calcula el estado que corresponde a una cuota en el corte diario (RF-008 §4.A).
 *
 * `ahora` se recibe como parámetro para que la función sea determinista y testeable.
 */
export function calcularEstadoBarrido(
  cuota: CuotaParaBarrido,
  ahora: Date
): ResultadoBarrido {
  const sinCambio = (motivo: ResultadoBarrido['motivo']): ResultadoBarrido => ({
    estado: cuota.estado,
    cambio: false,
    motivo,
  });

  // 1. ANULADA es terminal: una cuota anulada jamás transiciona (ni siquiera a AL_DIA).
  if (cuota.estado === EstadoCuota.ANULADA) {
    return sinCambio('anulada');
  }

  // 2. Saldada: la deuda manda. Una cuota con saldo 0.00 es AL_DIA aunque su estado persistido
  //    haya quedado atrás (p. ej. EMITIDA tras un cobro directo legacy).
  if (toCents(cuota.saldoPendienteUsd) <= 0) {
    return cuota.estado === EstadoCuota.AL_DIA
      ? sinCambio('saldada')
      : { estado: EstadoCuota.AL_DIA, cambio: true, motivo: 'saldada' };
  }

  // 3. Pausa explícita: un pago reportado en revisión congela el estado (RF-008 Gherkin 2 y 3).
  if (cuota.estado === EstadoCuota.PENDIENTE_REVISION) {
    return sinCambio('pausa_revision');
  }

  const corteMs = cuota.fechaCorteUtc.getTime();
  const ahoraMs = ahora.getTime();

  // 4. Mora: se superó la fecha de corte con saldo pendiente.
  if (ahoraMs > corteMs) {
    return cuota.estado === EstadoCuota.VENCIDA
      ? sinCambio('mora')
      : { estado: EstadoCuota.VENCIDA, cambio: true, motivo: 'mora' };
  }

  // 5. Por Vencer: faltan entre 0 y 5 días para el corte (el día del corte también cuenta: la
  //    transición a VENCIDA ocurre recién cuando `ahora` supera la hora exacta de corte).
  if (corteMs - ahoraMs <= DIAS_VENTANA_POR_VENCER * MS_POR_DIA) {
    return cuota.estado === EstadoCuota.POR_VENCER
      ? sinCambio('por_vencer')
      : { estado: EstadoCuota.POR_VENCER, cambio: true, motivo: 'por_vencer' };
  }

  // 6. Lejos del corte: EMITIDA/ABONADA_PARCIAL conservan su estado. VENCIDA tampoco retrocede
  //    (no existe "des-vencer" en el RF).
  return sinCambio('sin_cambio');
}
