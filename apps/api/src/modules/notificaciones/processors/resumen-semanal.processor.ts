/**
 * Ola 3 (RF-014/RF-015 §B "Resumen Semanal"): worker de la cola `notificaciones-resumen-semanal`.
 *
 * Genera el digest semanal de CADA coach activo (adherencia de la ventana + cobros/por vencer) y
 * publica un `ResumenSemanalCoachEvent` por coach; el despachador lo persiste In-App y lo encola
 * a Email solo si `digest_weekly_email` está activo (matriz RF-015 §B).
 *
 * Decisiones:
 * - Ventana: últimos 7 días UTC ([ahora - 7d, ahora]). Deliberadamente SIN huso por coach: el
 *   recordatorio antropométrico por huso IANA queda fuera del alcance de N1 (pendiente anotado).
 * - RF-002 §6 (WU RF-002a): además de adherencia y cobros, el digest alerta los días CERRADOS
 *   sin check-in nutricional de la cartera. LOTE API-N2: cada alumno cuenta SUS últimos 7 días
 *   cerrados en la zona de su perfil, y un día cierra al vencer su plazo (12:00 del día siguiente).
 *   La matriz RF-015 no define una categoría NUTRICION: la alerta viaja por la fila "Resumen
 *   Semanal" (Email/Push según preferencia) y la copia In-App universal del despachador, sin
 *   inventar categorías fuera del doc.
 * - Consultas en lote (una por métrica, no por coach) con agregación en memoria; las tablas
 *   financieras ya tienen RLS (etapa 2) y se leen con el bypass explícito `is_superadmin`, el
 *   mismo criterio de ruta de sistema que el barrido de cobranza.
 * - Un fallo al despachar un coach NO cancela el digest de los demás.
 */
import { Inject, Logger, Optional } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job, Queue } from 'bullmq';
import { DRIZZLE_DB, WITH_TENANT } from '../../../database/database.module';
import {
  Database,
  WithTenantFn,
  withTenant as withTenantBase,
} from '@guachafit/database';
import { COLA_RESUMEN_SEMANAL, nombreColaDlq } from '../notificaciones.config';
import { JOB_GENERAR_RESUMEN_SEMANAL } from '../resumen-semanal.scheduler';
import { moverJobADeadLetter } from '../dead-letter';

import { leerCarteraDigest } from './resumen-semanal/leer-cartera';
import { leerMetricasDigest } from './resumen-semanal/leer-metricas';
import { despacharDigest } from './resumen-semanal/despachar-digest';
import type { ResultadoResumenSemanal } from './resumen-semanal/cuerpo-resumen-reglas';
import type { ContextoResumenSemanal } from './resumen-semanal/contexto-resumen-semanal';

export const MS_POR_DIA = 24 * 60 * 60 * 1000;

export type { MetricasResumenSemanal, ResultadoResumenSemanal } from './resumen-semanal/cuerpo-resumen-reglas';
export { construirCuerpoResumenSemanal } from './resumen-semanal/cuerpo-resumen-reglas';

@Processor(COLA_RESUMEN_SEMANAL)
export class ResumenSemanalProcessor extends WorkerHost {
  private readonly logger = new Logger(ResumenSemanalProcessor.name);

  /**
   * RNF-003/ADR-011 (etapa 2): RUTA DE SISTEMA. El digest agrega cobros/cuotas de TODOS los
   * tenants; las lecturas sobre tablas con RLS corren con el bypass explícito `is_superadmin`.
   */
  private readonly withTenant: WithTenantFn;

  /** Contexto explícito de los pasos del digest (P2); se arma una sola vez aquí. */
  private readonly ctx: ContextoResumenSemanal;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue(nombreColaDlq(COLA_RESUMEN_SEMANAL)) private readonly dlq: Queue,
    @Optional() @Inject(WITH_TENANT) withTenant?: WithTenantFn
  ) {
    super();
    this.withTenant = withTenant ?? ((context, fn) => withTenantBase(context, fn, this.db));
    this.ctx = { db: this.db, withTenant: this.withTenant, eventEmitter: this.eventEmitter };
  }

  async process(job: Job): Promise<ResultadoResumenSemanal | { procesado: false }> {
    if (job.name !== JOB_GENERAR_RESUMEN_SEMANAL) {
      this.logger.warn(`Job desconocido '${job.name}' en la cola ${COLA_RESUMEN_SEMANAL}; ignorado.`);
      return { procesado: false };
    }
    return this.generarYDespachar();
  }

  /** Genera el digest de todos los coaches activos y emite un evento por coach. */
  async generarYDespachar(ahora: Date = new Date()): Promise<ResultadoResumenSemanal> {
    const desdeUtc = new Date(ahora.getTime() - 7 * MS_POR_DIA);

    const cartera = await leerCarteraDigest(this.ctx);
    if (cartera.coaches.length === 0) {
      return { coaches: 0, despachados: 0 };
    }

    const metricas = await leerMetricasDigest(this.ctx, cartera, ahora, desdeUtc);
    return despacharDigest(this.ctx, this.logger, cartera.coaches, cartera, metricas);
  }

  /** RNF-004 §4: al agotar intentos, el job se copia a la DLQ (visible en Bull-Board). */
  @OnWorkerEvent('failed')
  async alAgotarIntentos(job: Job, error: Error): Promise<void> {
    await moverJobADeadLetter(this.dlq, COLA_RESUMEN_SEMANAL, job, error);
  }
}
