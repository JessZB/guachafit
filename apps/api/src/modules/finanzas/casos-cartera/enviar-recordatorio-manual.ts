import {
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RecordatorioManualResultadoDTO } from '@guachafit/shared';
import { RecordatorioManualCobroEvent } from '../../notificaciones/events/eventos-notificacion';
import type { ContextoCartera } from './contexto-cartera';
import { evaluarRecordatorioManual } from './evaluar-recordatorio-manual';
import { TIPO_EVENTO_RECORDATORIO_MANUAL } from './mensaje-recordatorio-reglas';

/**
 * RN-02: recordatorio manual de un clic al alumno.
 *
 * Despacha por el Despachador (categoría FINANZAS: In-App universal garantizado y canales
 * Push/Email según las preferencias del alumno) con el saldo exacto y su proyección en Bs.
 * No dispara si no hay saldo pendiente, si el pago está en revisión (pausa de cobro, WU-H) o
 * si ya se envió un recordatorio manual dentro del cooldown anti-spam.
 */
export async function enviarRecordatorioManual(
  ctx: ContextoCartera,
  entrenadorId: string,
  clienteId: string
): Promise<RecordatorioManualResultadoDTO> {
  // UX-09a (D2): la evaluación (cartera, saldo, revisión, cooldown y mensaje) vive en
  // `evaluarRecordatorioManual`; aquí solo se envía cuando el caso está listo.
  const evaluacion = await evaluarRecordatorioManual(ctx, entrenadorId, clienteId);

  if (!evaluacion.listo) {
    return evaluacion.resultado;
  }

  const { nombreCompleto, cuotaAbierta, saldoPendienteBs, mensaje, ahora, cooldownMs } = evaluacion;

  if (!ctx.eventEmitter) {
    throw new ServiceUnavailableException(
      'El servicio de notificaciones no está disponible en este momento.'
    );
  }

  // RF-014 RN-01: se emite el evento y se ESPERA su resultado (emitAsync) porque la respuesta
  // del endpoint describe si hubo push; el despachador sigue siendo el único que encola.
  const resultados = await ctx.eventEmitter.emitAsync(
    RecordatorioManualCobroEvent.NOMBRE,
    new RecordatorioManualCobroEvent({
      tipoEvento: TIPO_EVENTO_RECORDATORIO_MANUAL,
      destinatarioUserId: clienteId,
      entrenadorId,
      categoria: 'FINANZAS',
      titulo: mensaje.titulo,
      cuerpo: mensaje.cuerpo,
      linkAccion: '/app/pagos',
      datosAdicionales: {
        cuotaId: cuotaAbierta.id,
        saldoPendienteUsd: cuotaAbierta.saldoPendienteUsd,
        saldoPendienteBs,
        origen: 'recordatorio_manual',
      },
      esCriticoSeguridad: false,
      // RNF-004 §3: ref de origen del jobId determinista.
      referenciaId: cuotaAbierta.id,
    })
  );

  const despacho = (resultados?.[0] ?? null) as { pushEnqueued?: boolean } | null;

  ctx.logger.log(
    `Recordatorio manual despachado a ${clienteId} (cuota ${cuotaAbierta.id}) por coach ${entrenadorId}.`
  );

  return {
    enviado: true,
    motivo: 'despachado',
    mensaje: despacho?.pushEnqueued
      ? `Recordatorio enviado a ${nombreCompleto} (notificación in-app + push).`
      : `Recordatorio enviado a ${nombreCompleto} (notificación in-app).`,
    mensajeSugerido: mensaje.cuerpo,
    saldoPendienteUsd: cuotaAbierta.saldoPendienteUsd,
    saldoPendienteBs,
    ultimaGestionUtc: ahora.toISOString(),
    proximoPermitidoUtc: new Date(ahora.getTime() + cooldownMs).toISOString(),
  };
}
