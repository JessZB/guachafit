import type { VistaPreviaRecordatorioDTO } from '@guachafit/shared';
import type { ContextoCartera } from './contexto-cartera';
import { evaluarRecordatorioManual } from './evaluar-recordatorio-manual';

/**
 * UX-09a (RF-009 D2): vista previa de solo lectura del recordatorio manual.
 *
 * Devuelve el mismo texto que despacharía el envío, con las mismas reglas de negocio, para que
 * el coach lo revise antes de confirmar. No emite eventos, no despacha notificaciones y no
 * escribe datos.
 */
export async function obtenerVistaPreviaRecordatorio(
  ctx: ContextoCartera,
  entrenadorId: string,
  clienteId: string
): Promise<VistaPreviaRecordatorioDTO> {
  const evaluacion = await evaluarRecordatorioManual(ctx, entrenadorId, clienteId);

  if (!evaluacion.listo) {
    const { resultado } = evaluacion;
    return {
      puedeEnviar: false,
      motivo: resultado.motivo,
      mensaje: resultado.mensaje,
      titulo: null,
      cuerpo: null,
      saldoPendienteUsd: resultado.saldoPendienteUsd,
      saldoPendienteBs: resultado.saldoPendienteBs,
      proximoPermitidoUtc: resultado.proximoPermitidoUtc,
    };
  }

  return {
    puedeEnviar: true,
    motivo: 'listo',
    mensaje: 'El recordatorio está listo para enviarse.',
    titulo: evaluacion.mensaje.titulo,
    cuerpo: evaluacion.mensaje.cuerpo,
    saldoPendienteUsd: evaluacion.cuotaAbierta.saldoPendienteUsd,
    saldoPendienteBs: evaluacion.saldoPendienteBs,
    proximoPermitidoUtc: null,
  };
}
