import { z } from 'zod';
import {
  FiltroCarteraSchema,
  PestanaCarteraSchema,
} from '../schemas';
import {
  EstadoCuota,
  Moneda,
  MetodoPago,
} from '../enums';
import type { PaginadoDTO } from './comunes';

// =============================================================================
// WU-I (RF-009): TABLERO DE CONTROL DE CARTERA DEL COACH
// =============================================================================

/** WU-I (RF-009): filtros server-side del tablero de cartera (`q`, `pestana`, `limit`, `offset`). */
export type FiltroCarteraDTO = z.infer<typeof FiltroCarteraSchema>;

/** Pestañas del tablero de cartera (mismo orden del RF-009 §4.B). */
export type PestanaCarteraDTO = z.infer<typeof PestanaCarteraSchema>;

/**
 * KPIs superiores y contadores de pestaña del tablero de cartera.
 *
 * Todos describen la cartera COMPLETA del coach (nunca la página cargada):
 * - `recaudadoMesUsd` (KPI-01): pagos aprobados del mes UTC en curso.
 * - `totalEnMoraUsd`/`alumnosEnMora` (KPI-02): suma de saldos vencidos y alumnos distintos.
 *   Un pago en revisión PAUSA la mora (misma regla de la máquina de estados WU-H).
 * - `totalPorVencerUsd`/`proximosAVencer` (KPI-03): saldo y alumnos con corte ≤ 5 días.
 * - `pagosPorValidar` (KPI-04): comprobantes en estado pendiente de verificación.
 * - `tasaVigente`: tasa activa del coach para proyectar Bs; `null` honesto si no configuró.
 */
export interface ResumenCarteraDTO {
  recaudadoMesUsd: string;
  totalEnMoraUsd: string;
  alumnosEnMora: number;
  totalPorVencerUsd: string;
  proximosAVencer: number;
  pagosPorValidar: number;
  contadores: {
    enMora: number;
    porVencer: number;
    revision: number;
    alDia: number;
  };
  tasaVigente: string | null;
}

/**
 * WU-I: fila del tablero de cartera. La forma es única para las cuatro pestañas; cada bloque de
 * campos opcionales solo se completa en las pestañas que lo usan (los nulos son datos honestos,
 * p. ej. `saldoPendienteBs = null` cuando el coach no tiene tasa configurada).
 */
export interface FilaCarteraDTO {
  /** `usuarios.id` del alumno (clave de cobro y de notificación). */
  alumnoUsuarioId: string;
  /** `perfiles_alumno.id` para "Ver ficha"; `null` si el perfil no se pudo resolver. */
  alumnoPerfilId: string | null;
  /**
   * M5-P1 (ADR-020): vencimiento (`YYYY-MM-DD`, día local del alumno) de la próxima cuota que
   * emitirá su suscripción; `null` si no tiene plan asignado.
   */
  proximoCorte: string | null;
  /** RF-006 RN-05: saldo a favor del alumno (USD), `'0.00'` si no tiene. */
  saldoAFavorUsd: string;
  alumnoNombre: string;
  telefonoWhatsapp: string | null;
  /** Mora / por vencer: cuota más urgente del alumno (vencida más antigua o corte más próximo). */
  cuotaId: string | null;
  estadoCuota: EstadoCuota | null;
  fechaCorteUtc: string | null;
  saldoPendienteUsd: string | null;
  /** Proyección a Bs con la tasa aplicable (override del alumno o tasa activa del coach). */
  saldoPendienteBs: string | null;
  tasaAplicada: string | null;
  /** Días de atraso (mora): días transcurridos desde el corte más antiguo. */
  diasAtraso: number | null;
  /** Días restantes para el corte (por vencer). */
  diasRestantes: number | null;
  /** Último recordatorio MANUAL enviado a este alumno; `null` si nunca se envió uno. */
  ultimaGestionUtc: string | null;
  /** Al Día: plan de la cuota cubierta y ciclo (`YYYY-MM`). */
  planNombre: string | null;
  periodo: string | null;
  /** Pendiente de revisión: pago reportado por el alumno. */
  pagoId: string | null;
  montoReportado: string | null;
  monedaOriginal: Moneda | null;
  metodoPago: MetodoPago | null;
  referenciaBancaria: string | null;
  comprobanteUrl: string | null;
  fechaReporteUtc: string | null;
  /** Días que el comprobante lleva esperando validación (revisión). */
  diasEspera: number | null;
}

/** WU-I: respuesta paginada de `GET /finanzas/cartera` con los KPIs de la cartera completa. */
export interface CarteraDTO extends PaginadoDTO<FilaCarteraDTO> {
  resumen: ResumenCarteraDTO;
}

/**
 * WU-I (RF-009 RN-02): resultado del recordatorio manual de un clic.
 *
 * `enviado=false` NO es un fallo técnico: expresa reglas de negocio honestas (sin saldo
 * pendiente, pago en revisión o cooldown anti-spam) con un `mensaje` listo para mostrar.
 * `mensajeSugerido` es el texto despachado, para copiar/abrir WhatsApp.
 */
export interface RecordatorioManualResultadoDTO {
  enviado: boolean;
  motivo: 'despachado' | 'sin_saldo_pendiente' | 'pausa_revision' | 'cooldown_activo';
  mensaje: string;
  mensajeSugerido: string | null;
  saldoPendienteUsd: string | null;
  saldoPendienteBs: string | null;
  ultimaGestionUtc: string | null;
  proximoPermitidoUtc: string | null;
}

/**
 * UX-09a (RF-009 D2): vista previa de solo lectura del recordatorio manual.
 *
 * El coach ve el texto EXACTO que se enviaría antes de confirmar. Se construye con las mismas
 * reglas de negocio que el envío y nunca emite eventos ni escribe datos.
 * - `puedeEnviar = true` solo con `motivo = 'listo'`; `titulo` y `cuerpo` vienen completos.
 * - Con cualquier bloqueo (`sin_saldo_pendiente`, `pausa_revision`, `cooldown_activo`),
 *   `puedeEnviar = false`, `titulo` y `cuerpo` son `null` y `mensaje` explica el motivo.
 * - `proximoPermitidoUtc` solo se completa en `cooldown_activo`.
 */
export interface VistaPreviaRecordatorioDTO {
  puedeEnviar: boolean;
  motivo: 'listo' | 'sin_saldo_pendiente' | 'pausa_revision' | 'cooldown_activo';
  mensaje: string;
  titulo: string | null;
  cuerpo: string | null;
  saldoPendienteUsd: string | null;
  saldoPendienteBs: string | null;
  proximoPermitidoUtc: string | null;
}
