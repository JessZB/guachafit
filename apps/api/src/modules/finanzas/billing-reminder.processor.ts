/**
 * WU-H (RF-008 / ADR-008): worker de la cola `cobranza`.
 *
 * Procesa dos tipos de job:
 * 1. `recordatorio-cuota` (delayed, agendado al emitir): re-verifica en PostgreSQL que la cuota
 *    SIGA con saldo pendiente y no esté pausada/en revisión; recién entonces despacha el
 *    recordatorio por `NotificationDispatcherService` (categoría FINANZAS de la matriz RF-015,
 *    con In-App universal garantizado). Si ya está saldada, termina sin enviar.
 * 2. `barrido-estados` (repeatable diario): aplica la máquina de estados real
 *    (`calcularEstadoBarrido`) a TODAS las cuotas de TODOS los tenants.
 *
 * RUTA DE SISTEMA (tenancy): `cuotas_membresia` tiene sus políticas RLS creadas pero RLS NO
 * está habilitado todavía (migración 0004, etapa 2 pendiente), por lo que esta consulta
 * transversal no necesita contexto de tenant. Cuando RLS se habilite, este worker deberá correr
 * con el bypass explícito `is_superadmin` (ADR-009) o un rol de sistema, nunca con un
 * `entrenador_id` arbitrario.
 */
import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DRIZZLE_DB } from '../../database/database.module';
import {
  Database,
  and,
  eq,
  gt,
  notInArray,
  cuotasMembresia,
} from '@guachafit/database';
import { EstadoCuota } from '@guachafit/shared';
import { NotificationDispatcherService } from '../notificaciones/notification-dispatcher.service';
import { FinanzasService, toCents } from './finanzas.service';
import {
  COBRANZA_QUEUE,
  HitoCobranza,
  JOB_BARRIDO_ESTADOS,
  JOB_RECORDATORIO_CUOTA,
} from './cobranza-hitos';
import { calcularEstadoBarrido } from './cuota-estado.helper';

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

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly dispatcherService: NotificationDispatcherService,
    private readonly finanzasService: FinanzasService
  ) {
    super();
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

    const [cuota] = await this.db
      .select()
      .from(cuotasMembresia)
      .where(eq(cuotasMembresia.id, cuotaId));

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
      const tasa = await this.finanzasService.obtenerTasaVigente(
        cuota.entrenadorId,
        cuota.clienteId
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

    await this.dispatcherService.despacharEvento({
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
    });

    this.logger.log(`Recordatorio ${hito} despachado para cuota ${cuota.id} (${cuota.clienteId}).`);
    return { enviado: true, motivo: 'despachado' };
  }

  /**
   * Barrido diario de estados (RF-008 §4.A) para todas las cuotas de todos los tenants.
   *
   * Se excluyen las cuotas ANULADA (terminal) y AL_DIA (saldadas): el resto se evalúa con la
   * máquina pura y solo se persiste el cambio real de estado.
   */
  async procesarBarridoDiario(ahora: Date = new Date()): Promise<ResultadoBarrido> {
    const filas = await this.db
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

      await this.db
        .update(cuotasMembresia)
        .set({ estado: resultado.estado, updatedAtUtc: ahora })
        .where(eq(cuotasMembresia.id, fila.id));

      resumen.actualizadas += 1;
    }

    this.logger.log(
      `Barrido diario de cuotas: ${resumen.evaluadas} evaluadas, ${resumen.actualizadas} actualizadas ` +
        `(${resumen.porVencer} por vencer, ${resumen.vencidas} vencidas).`
    );

    return resumen;
  }
}
