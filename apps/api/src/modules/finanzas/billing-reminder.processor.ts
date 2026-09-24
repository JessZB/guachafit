/**
 * WU-H (RF-008 / ADR-008): worker de la cola `cobranza`.
 *
 * Procesa dos tipos de job:
 * 1. `recordatorio-cuota` (delayed, agendado al emitir): re-verifica en PostgreSQL que la cuota
 *    SIGA con saldo pendiente y no esté pausada/en revisión; recién entonces EMITE el evento de
 *    dominio `RecordatorioCuotaEvent` (RF-014 RN-01) que el `NotificationDispatcherService`
 *    escucha para persistir In-App y encolar Push/Email según la matriz RF-015. Si ya está
 *    saldada, termina sin enviar.
 * 2. `barrido-estados` (repeatable diario): aplica la máquina de estados real
 *    (`calcularEstadoBarrido`) a TODAS las cuotas de TODOS los tenants.
 *
 * RUTA DE SISTEMA (tenancy): `cuotas_membresia` tiene RLS habilitado (migración 0012, etapa 2).
 * Este worker barre las cuotas de TODOS los tenants, así que corre con el bypass explícito
 * `app.is_superadmin` vía withTenant() (ADR-009/ADR-011), nunca con un `entrenador_id` arbitrario.
 */
import { Inject, Logger, Optional } from '@nestjs/common';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job, Queue } from 'bullmq';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import {
  Database,
  WithTenantFn,
  withTenant as withTenantBase,
  and,
  eq,
  gt,
  notInArray,
  cuotasMembresia,
} from '@guachafit/database';
import { EstadoCuota } from '@guachafit/shared';
import { FinanzasService, toCents } from './finanzas.service';
import {
  COBRANZA_QUEUE,
  HitoCobranza,
  JOB_BARRIDO_ESTADOS,
  JOB_RECORDATORIO_CUOTA,
} from './cobranza-hitos';
import { calcularEstadoBarrido } from './cuota-estado.helper';
import { RecordatorioCuotaEvent } from '../notificaciones/events/eventos-notificacion';
import { moverJobADeadLetter } from '../notificaciones/dead-letter';
import { nombreColaDlq } from '../notificaciones/notificaciones.config';

export interface ResultadoRecordatorio {
  enviado: boolean;
  motivo:
    | 'despachado'
    | 'cuota_no_encontrada'
    | 'cuota_anulada'
    | 'cuota_saldada'
    | 'pausa_revision';
}

export interface ResultadoBarrido {
  evaluadas: number;
  actualizadas: number;
  porVencer: number;
  vencidas: number;
}

interface DatosRecordatorio {
  cuotaId: string;
  hito: HitoCobranza;
  timestampHitoUtc?: string;
}

/** Mensaje del RF-008 §4.B, adaptado al caso borde de abono parcial (§6). */
export function construirMensajeRecordatorio(
  hito: HitoCobranza,
  saldoPendienteUsd: string,
  saldoPendienteVes?: string
): { titulo: string; cuerpo: string; tipoEvento: string } {
  const saldoDual = saldoPendienteVes
    ? `$${saldoPendienteUsd} USD (o Bs. ${saldoPendienteVes})`
    : `$${saldoPendienteUsd} USD`;

  switch (hito) {
    case 'T_MINUS_5':
      return {
        tipoEvento: 'CUOTA_POR_VENCER',
        titulo: 'Tu mensualidad vence pronto',
        cuerpo: 'Tu mensualidad vence en 5 días. Recuerda registrar tu pago con anticipación.',
      };
    case 'T_MINUS_1':
      return {
        tipoEvento: 'CUOTA_POR_VENCER',
        titulo: 'Mañana vence tu mensualidad',
        cuerpo: `Mañana es tu fecha de corte. Tu saldo pendiente es de ${saldoDual}.`,
      };
    case 'T_ZERO':
      return {
        tipoEvento: 'CUOTA_VENCE_HOY',
        titulo: 'Hoy vence tu mensualidad',
        cuerpo: 'Hoy vence tu mensualidad. Reporta tu comprobante para mantener activo tu plan.',
      };
    case 'T_PLUS_2':
    default:
      return {
        tipoEvento: 'CUOTA_VENCIDA',
        titulo: 'Aviso de mora',
        cuerpo: `Aviso de mora: tu servicio se encuentra vencido con un saldo pendiente de ${saldoDual}. Por favor regulariza tu estatus.`,
      };
  }
}

/**
 * Variante del T+2 cuando hubo abono parcial (RF-008 §6): la cuota está "parcialmente vencida"
 * con saldo remanente, no impaga por completo.
 */
export function construirMensajeMoraParcial(
  saldoPendienteUsd: string,
  saldoPendienteVes?: string
): { titulo: string; cuerpo: string; tipoEvento: string } {
  const saldoDual = saldoPendienteVes
    ? `$${saldoPendienteUsd} USD (o Bs. ${saldoPendienteVes})`
    : `$${saldoPendienteUsd} USD`;

  return {
    tipoEvento: 'CUOTA_VENCIDA',
    titulo: 'Aviso de mora',
    cuerpo: `Tu cuota se encuentra parcialmente vencida con un saldo remanente de ${saldoDual}. Por favor regulariza tu estatus.`,
  };
}

@Processor(COBRANZA_QUEUE)
export class BillingReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(BillingReminderProcessor.name);

  /**
   * RNF-003/ADR-011 (etapa 2): RUTA DE SISTEMA. `cuotas_membresia` tiene RLS habilitado; este
   * worker barre TODOS los tenants, así que corre con el bypass explícito `is_superadmin`.
   */
  private readonly withTenant: WithTenantFn;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    // RF-014 RN-01: la cobranza ya no conoce al despachador; publica eventos de dominio.
    private readonly eventEmitter: EventEmitter2,
    private readonly finanzasService: FinanzasService,
    // RNF-004 §4: DLQ de la cola de cobranza (visible en Bull-Board).
    @InjectQueue(nombreColaDlq(COBRANZA_QUEUE)) private readonly dlq: Queue,
    @Optional() @Inject(WITH_TENANT) withTenant?: WithTenantFn
  ) {
    super();
    this.withTenant = withTenant ?? ((context, fn) => withTenantBase(context, fn, this.db));
  }

  async process(job: Job): Promise<ResultadoRecordatorio | ResultadoBarrido | { procesado: false }> {
    switch (job.name) {
      case JOB_RECORDATORIO_CUOTA:
        return this.procesarRecordatorio(job as Job<DatosRecordatorio>);
      case JOB_BARRIDO_ESTADOS:
        return this.procesarBarridoDiario();
      default:
        this.logger.warn(`Job desconocido '${job.name}' en la cola ${COBRANZA_QUEUE}; ignorado.`);
        return { procesado: false };
    }
  }

  /**
   * Verifica el estado real de la cuota antes de enviar: la fuente de verdad es PostgreSQL, no
   * el payload agendado (el saldo pudo cambiar entre la emisión y el hito).
   */
  async procesarRecordatorio(job: Job<DatosRecordatorio>): Promise<ResultadoRecordatorio> {
    const { cuotaId, hito } = job.data;

    // RUTA DE SISTEMA (RNF-003/ADR-011): bypass explícito de superadmin; la emisión de eventos
    // (Redis) queda fuera de la transacción, después del commit de lectura.
    const [cuota] = await this.withTenant({ isSuperadmin: true }, async (tx) =>
      tx.select().from(cuotasMembresia).where(eq(cuotasMembresia.id, cuotaId))
    );

    if (!cuota) {
      this.logger.warn(`Recordatorio ${hito}: cuota ${cuotaId} no existe; sin envío.`);
      return { enviado: false, motivo: 'cuota_no_encontrada' };
    }

    if (cuota.estado === EstadoCuota.ANULADA) {
      return { enviado: false, motivo: 'cuota_anulada' };
    }

    if (cuota.estado === EstadoCuota.AL_DIA || toCents(cuota.saldoPendienteUsd) <= 0) {
      return { enviado: false, motivo: 'cuota_saldada' };
    }

    // RF-008 Gherkin 2: los recordatorios de cobro se pausan mientras haya un pago en revisión.
    if (cuota.estado === EstadoCuota.PENDIENTE_REVISION) {
      return { enviado: false, motivo: 'pausa_revision' };
    }

    // Proyección informativa en Bs solo con tasa real (misma regla que emisión/historial).
    let saldoPendienteVes: string | undefined;
    try {
      // RNF-003/ADR-011 (etapa 3): la tasa override lee `perfiles_alumno` (RLS); ruta de sistema
      // con el bypass explícito `is_superadmin` (barrido multi-tenant).
      const tasa = await this.withTenant({ isSuperadmin: true }, (tx) =>
        this.finanzasService.obtenerTasaVigente(cuota.entrenadorId, cuota.clienteId, tx)
      );
      if (tasa.tasaEfectiva) {
        saldoPendienteVes = this.finanzasService.proyectarVES(
          cuota.saldoPendienteUsd,
          tasa.tasaEfectiva
        );
      }
    } catch {
      saldoPendienteVes = undefined;
    }

    const esMoraParcial = hito === 'T_PLUS_2' && toCents(cuota.montoAbonadoUsd) > 0;
    const mensaje = esMoraParcial
      ? construirMensajeMoraParcial(cuota.saldoPendienteUsd, saldoPendienteVes)
      : construirMensajeRecordatorio(hito, cuota.saldoPendienteUsd, saldoPendienteVes);

    await this.eventEmitter.emitAsync(
      RecordatorioCuotaEvent.NOMBRE,
      new RecordatorioCuotaEvent({
        tipoEvento: mensaje.tipoEvento,
        destinatarioUserId: cuota.clienteId,
        entrenadorId: cuota.entrenadorId,
        categoria: 'FINANZAS', // RF-015 §A "Finanzas y Pagos" (Push+Email configurables, In-App universal)
        titulo: mensaje.titulo,
        cuerpo: mensaje.cuerpo,
        linkAccion: '/app/pagos',
        datosAdicionales: {
          cuotaId: cuota.id,
          hito,
          saldoPendienteUsd: cuota.saldoPendienteUsd,
        },
        esCriticoSeguridad: false,
        // RNF-004 §3: ref de origen del jobId determinista (cuota + hito).
        referenciaId: `${cuota.id}_${hito}`,
      })
    );

    this.logger.log(`Recordatorio ${hito} despachado para cuota ${cuota.id} (${cuota.clienteId}).`);
    return { enviado: true, motivo: 'despachado' };
  }

  /** RNF-004 §4: al agotar intentos, el job se copia a la DLQ (visible en Bull-Board). */
  @OnWorkerEvent('failed')
  async alAgotarIntentos(job: Job, error: Error): Promise<void> {
    await moverJobADeadLetter(this.dlq, COBRANZA_QUEUE, job, error);
  }

  /**
   * Barrido diario de estados (RF-008 §4.A) para todas las cuotas de todos los tenants.
   *
   * Se excluyen las cuotas ANULADA (terminal) y AL_DIA (saldadas): el resto se evalúa con la
   * máquina pura y solo se persiste el cambio real de estado.
   */
  async procesarBarridoDiario(ahora: Date = new Date()): Promise<ResultadoBarrido> {
    // RUTA DE SISTEMA (RNF-003/ADR-011): barrido transversal de TODOS los tenants con el bypass
    // explícito `is_superadmin`. Lectura + actualizaciones en UNA transacción (no N transacciones).
    const resumen = await this.withTenant({ isSuperadmin: true }, async (tx) => {
      const filas = await tx
        .select({
          id: cuotasMembresia.id,
          estado: cuotasMembresia.estado,
          saldoPendienteUsd: cuotasMembresia.saldoPendienteUsd,
          fechaCorteUtc: cuotasMembresia.fechaCorteUtc,
        })
        .from(cuotasMembresia)
        .where(
          and(
            notInArray(cuotasMembresia.estado, [EstadoCuota.ANULADA, EstadoCuota.AL_DIA]),
            gt(cuotasMembresia.saldoPendienteUsd, '0')
          )
        );

      const resumen: ResultadoBarrido = {
        evaluadas: filas.length,
        actualizadas: 0,
        porVencer: 0,
        vencidas: 0,
      };

      for (const fila of filas) {
        const resultado = calcularEstadoBarrido(
          {
            estado: fila.estado,
            saldoPendienteUsd: fila.saldoPendienteUsd,
            fechaCorteUtc: fila.fechaCorteUtc,
          },
          ahora
        );

        if (resultado.estado === EstadoCuota.POR_VENCER) resumen.porVencer += 1;
        if (resultado.estado === EstadoCuota.VENCIDA) resumen.vencidas += 1;

        if (!resultado.cambio) continue;

        await tx
          .update(cuotasMembresia)
          .set({ estado: resultado.estado, updatedAtUtc: ahora })
          .where(eq(cuotasMembresia.id, fila.id));

        resumen.actualizadas += 1;
      }

      return resumen;
    });

    this.logger.log(
      `Barrido diario de cuotas: ${resumen.evaluadas} evaluadas, ${resumen.actualizadas} actualizadas ` +
        `(${resumen.porVencer} por vencer, ${resumen.vencidas} vencidas).`
    );

    return resumen;
  }
}
