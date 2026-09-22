/**
 * Ola 3 (RF-014/RF-015 §B "Resumen Semanal"): planificador del digest semanal del coach.
 *
 * Mismo patrón que `BillingSchedulerService` (ADR-008): `upsertJobScheduler` con clave estable en
 * el boot, de modo que N instancias de la API no dupliquen el digest. Si Redis no está disponible
 * el API NO cae al arrancar: se loguea y el scheduler queda sin registrar hasta el próximo boot.
 *
 * Cron: lunes 08:00 UTC por defecto (configurable con `RESUMEN_SEMANAL_CRON`).
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { COLA_RESUMEN_SEMANAL, OPCIONES_JOB_RESUMEN_SEMANAL } from './notificaciones.config';

/** Clave determinista del job scheduler repetible (upsert idempotente al boot). */
export const JOB_SCHEDULER_RESUMEN_SEMANAL_ID = 'notificaciones:resumen-semanal';

/** Nombre del job que genera y despacha el digest. */
export const JOB_GENERAR_RESUMEN_SEMANAL = 'generar-resumen-semanal';

/** Lunes 08:00 UTC (env `RESUMEN_SEMANAL_CRON`). */
export const CRON_RESUMEN_SEMANAL_POR_DEFECTO = '0 8 * * 1';

export const ENV_RESUMEN_SEMANAL_CRON = 'RESUMEN_SEMANAL_CRON';

@Injectable()
export class ResumenSemanalSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ResumenSemanalSchedulerService.name);

  constructor(@InjectQueue(COLA_RESUMEN_SEMANAL) private readonly resumenQueue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.registrarResumenSemanal();
    } catch (error) {
      this.logger.error(
        `No se pudo registrar el resumen semanal del coach: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /** Upsert idempotente del job repetible semanal (cron UTC configurable por env). */
  async registrarResumenSemanal(): Promise<string> {
    const cron =
      process.env[ENV_RESUMEN_SEMANAL_CRON]?.trim() || CRON_RESUMEN_SEMANAL_POR_DEFECTO;

    await this.resumenQueue.upsertJobScheduler(
      JOB_SCHEDULER_RESUMEN_SEMANAL_ID,
      { pattern: cron, tz: 'UTC' },
      {
        name: JOB_GENERAR_RESUMEN_SEMANAL,
        data: {},
        opts: OPCIONES_JOB_RESUMEN_SEMANAL,
      }
    );

    this.logger.log(`Resumen semanal del coach registrado (cron UTC: '${cron}').`);
    return cron;
  }
}
