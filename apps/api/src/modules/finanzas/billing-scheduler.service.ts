/**
 * WU-H (RF-008 / ADR-008): planificador BullMQ de la cobranza.
 *
 * Responsabilidades:
 * 1. Al emitirse una cuota, agenda los 4 jobs diferidos de recordatorio (T-5, T-1, T, T+2)
 *    contra `fecha_corte_utc` con `jobId` determinista (dedupe) y retries/backoff del ADR-008.
 * 2. Al liquidarse una cuota (saldo $0.00), cancela los jobs futuros por id.
 * 3. Registra al boot, de forma idempotente (`upsertJobScheduler` por clave), el job repetible
 *    diario que ejecuta el barrido de estados para TODOS los tenants.
 *
 * El procesamiento real vive en `BillingReminderProcessor` (misma cola `cobranza`).
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  COBRANZA_QUEUE,
  CRON_BARRIDO_POR_DEFECTO,
  HITOS_COBRANZA,
  HitoCobranza,
  JOB_BARRIDO_ESTADOS,
  JOB_RECORDATORIO_CUOTA,
  JOB_SCHEDULER_BARRIDO_ID,
  calcularDiaLocalHito,
  calcularTimestampHito,
  construirJobIdCobranza,
} from './cobranza-hitos';
import { esperarConLimite } from '../../common/esperar-con-limite.util';
import { obtenerFechaLocalYyyyMmDd } from '../../common/adherencia.util';

/**
 * Reintentos y retención de los jobs de cobranza (ADR-008 §3.3 + observabilidad Bull-Board):
 * 3 intentos con backoff exponencial de 5s; retención acotada para que el dashboard no crezca
 * sin límite.
 */
export const OPCIONES_JOBS_COBRANZA = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

/**
 * Tope de espera de cada llamada a la cola. Con Redis caído (`maxRetriesPerRequest: null`) BullMQ
 * no responde nunca: sin este tope, emitir una cuota o cobrar en sala se quedaría colgado.
 */
export const TIEMPO_MAX_COLA_COBRANZA_MS = 3000;

export interface CuotaParaProgramar {
  id: string;
  fechaCorteUtc: Date;
  /** Zona IANA del alumno: con ella los hitos salen a las 09:00 locales (RF-008 §4.B). */
  zonaHoraria?: string;
}

@Injectable()
export class BillingSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(BillingSchedulerService.name);

  constructor(@InjectQueue(COBRANZA_QUEUE) private readonly cobranzaQueue: Queue) {}

  /**
   * Registro idempotente al boot: `upsertJobScheduler` con clave estable garantiza que N
   * instancias de la API no dupliquen el barrido diario.
   *
   * Si Redis no está disponible el API no debe caer al arrancar: se loguea el fallo y el
   * scheduler quedará sin registrar hasta el próximo boot (mismo criterio resiliente que usan
   * los despachos de notificación existentes).
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.registrarBarridoDiario();
    } catch (error) {
      this.logger.error(
        `No se pudo registrar el barrido diario de cobranza: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /** Upsert idempotente del job repetible diario (cron UTC configurable por env). */
  async registrarBarridoDiario(): Promise<string> {
    const cron = process.env.COBRANZA_BARRIDO_CRON?.trim() || CRON_BARRIDO_POR_DEFECTO;

    await this.cobranzaQueue.upsertJobScheduler(
      JOB_SCHEDULER_BARRIDO_ID,
      { pattern: cron, tz: 'UTC' },
      {
        name: JOB_BARRIDO_ESTADOS,
        data: {},
        opts: OPCIONES_JOBS_COBRANZA,
      }
    );

    this.logger.log(`Barrido diario de cobranza registrado (cron UTC: '${cron}').`);
    return cron;
  }

  /**
   * Agenda los hitos FUTUROS del cronograma para una cuota recién emitida.
   *
   * Un hito cuyo timestamp ya pasó al momento de emitir se omite deliberadamente: enviar
   * "vence en 5 días" cuando faltan 3 (o cuando ya venció) sería un mensaje incorrecto.
   * Excepción (con zona): si el hito cae HOY en el día local del alumno y solo pasó su hora
   * (09:00), se envía ya; el mensaje sigue siendo cierto y así no se pierde el T-5 de una cuota
   * emitida esa misma tarde.
   *
   * Si la cola no responde a tiempo o falla, deja de intentar el resto (Redis caído) y devuelve
   * los hitos que sí quedaron agendados. Nunca lanza.
   */
  async programarRecordatoriosCuota(
    cuota: CuotaParaProgramar,
    ahora: Date = new Date()
  ): Promise<HitoCobranza[]> {
    const programados: HitoCobranza[] = [];

    for (const hito of HITOS_COBRANZA) {
      const timestampHito = calcularTimestampHito(cuota.fechaCorteUtc, hito, cuota.zonaHoraria);
      let delay = timestampHito.getTime() - ahora.getTime();

      if (delay <= 0) {
        const esHoyLocal =
          cuota.zonaHoraria !== undefined &&
          calcularDiaLocalHito(cuota.fechaCorteUtc, hito, cuota.zonaHoraria) ===
            obtenerFechaLocalYyyyMmDd(ahora, cuota.zonaHoraria);
        if (!esHoyLocal) continue;
        delay = 0;
      }

      const resultado = await esperarConLimite(
        this.cobranzaQueue.add(
          JOB_RECORDATORIO_CUOTA,
          {
            cuotaId: cuota.id,
            hito,
            timestampHitoUtc: timestampHito.toISOString(),
          },
          {
            ...OPCIONES_JOBS_COBRANZA,
            jobId: construirJobIdCobranza(cuota.id, hito),
            delay,
          }
        ),
        TIEMPO_MAX_COLA_COBRANZA_MS
      );

      if (!resultado.ok) {
        this.logger.warn(
          `No se pudieron agendar los recordatorios de la cuota ${cuota.id} desde ${hito}: ${describirFallo(
            resultado
          )}`
        );
        break;
      }

      programados.push(hito);
    }

    this.logger.log(
      `Recordatorios programados para cuota ${cuota.id}: ${
        programados.length > 0 ? programados.join(', ') : 'ninguno (hitos ya vencidos)'
      }`
    );

    return programados;
  }

  /**
   * Cancela los 4 jobs de recordatorio de una cuota (ADR-008 §3.2).
   *
   * `Queue.remove` devuelve 0 si el job no existe y puede lanzar si el job está activo/locked;
   * cada hito se intenta de forma independiente para que un fallo no bloquee el resto. Si la cola
   * no responde a tiempo (Redis caído) se deja de intentar: el procesador descarta igualmente el
   * recordatorio de una cuota ya saldada.
   */
  async cancelarRecordatoriosCuota(cuotaId: string): Promise<number> {
    let eliminados = 0;

    for (const hito of HITOS_COBRANZA) {
      const jobId = construirJobIdCobranza(cuotaId, hito);
      const resultado = await esperarConLimite(
        this.cobranzaQueue.remove(jobId),
        TIEMPO_MAX_COLA_COBRANZA_MS
      );
      if (resultado.ok) {
        eliminados += resultado.valor;
        continue;
      }
      this.logger.warn(`No se pudo cancelar el job '${jobId}': ${describirFallo(resultado)}`);
      if (resultado.motivo === 'tiempo') break;
    }

    return eliminados;
  }
}

function describirFallo(
  resultado: { ok: false; motivo: 'tiempo' } | { ok: false; motivo: 'error'; error: unknown }
): string {
  if (resultado.motivo === 'tiempo') {
    return `la cola no respondió en ${TIEMPO_MAX_COLA_COBRANZA_MS} ms`;
  }
  return resultado.error instanceof Error ? resultado.error.message : String(resultado.error);
}
