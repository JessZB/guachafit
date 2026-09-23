/**
 * RF-003 RN-01 (WU RF-003a): planificador del recordatorio de check-in antropométrico.
 *
 * Mismo patrón que `ResumenSemanalSchedulerService` y `BillingSchedulerService` (ADR-008):
 * `upsertJobScheduler` con clave estable en el boot, de modo que N instancias de la API no
 * dupliquen el barrido. Si Redis no está disponible el API NO cae al arrancar: se loguea y el
 * scheduler queda sin registrar hasta el próximo boot.
 *
 * Cron: cada 15 minutos por defecto (configurable con `ANTROPOMETRIA_RECORDATORIO_CRON`).
 *
 * Aproximación documentada: como el cron es único para todo el mundo, el processor corre cada
 * 15 minutos y solo emite para los alumnos cuya HORA LOCAL es la del recordatorio (06:00, RN-01).
 * La cadencia cubre offsets de hora entera, media hora (p. ej. Asia/Kolkata) y 45 min (p. ej.
 * Asia/Kathmandu), que con el cron horario anterior nunca caían dentro de su hora local 6.
 * Límite: si el worker está caído durante TODA la hora local 6, ese día no hay reemisión (no hay
 * catch-up); el pre-chequeo por bandeja evita duplicados, pero no recupera barridos perdidos.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  COLA_ANTROPOMETRIA_RECORDATORIO,
  OPCIONES_JOB_ANTROPOMETRIA_RECORDATORIO,
} from '../notificaciones/notificaciones.config';

/** Clave determinista del job scheduler repetible (upsert idempotente al boot). */
export const JOB_SCHEDULER_ANTROPOMETRIA_ID = 'antropometria:recordatorio-checkin';

/** Nombre del job que barre los alumnos y emite los recordatorios del día. */
export const JOB_GENERAR_RECORDATORIO_ANTROPOMETRIA = 'generar-recordatorio-checkin-antropometrico';

/** Cada 15 minutos (UTC); el processor filtra por hora local del alumno (env opcional). */
export const CRON_RECORDATORIO_ANTROPOMETRIA_POR_DEFECTO = '*/15 * * * *';

export const ENV_RECORDATORIO_ANTROPOMETRIA_CRON = 'ANTROPOMETRIA_RECORDATORIO_CRON';

@Injectable()
export class AntropometriaRecordatorioSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AntropometriaRecordatorioSchedulerService.name);

  constructor(
    @InjectQueue(COLA_ANTROPOMETRIA_RECORDATORIO) private readonly recordatorioQueue: Queue
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.registrarRecordatorioHorario();
    } catch (error) {
      this.logger.error(
        `No se pudo registrar el recordatorio antropométrico: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /** Upsert idempotente del job repetible cada 15 min (cron UTC configurable por env). */
  async registrarRecordatorioHorario(): Promise<string> {
    const cron =
      process.env[ENV_RECORDATORIO_ANTROPOMETRIA_CRON]?.trim() ||
      CRON_RECORDATORIO_ANTROPOMETRIA_POR_DEFECTO;

    await this.recordatorioQueue.upsertJobScheduler(
      JOB_SCHEDULER_ANTROPOMETRIA_ID,
      { pattern: cron, tz: 'UTC' },
      {
        name: JOB_GENERAR_RECORDATORIO_ANTROPOMETRIA,
        data: {},
        opts: OPCIONES_JOB_ANTROPOMETRIA_RECORDATORIO,
      }
    );

    this.logger.log(`Recordatorio antropométrico registrado (cron UTC: '${cron}').`);
    return cron;
  }
}
