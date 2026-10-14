import { randomUUID } from 'node:crypto';
import type { Queue } from 'bullmq';
import {
  TIEMPO_MAX_ENCOLADO_CORREO_CUENTA_MS,
  TIPOS_CORREO_SEGURIDAD,
  type CorreoCuentaPayload,
  type ResultadoDespachoCorreoCuenta,
} from '../events/eventos-correo-cuenta';
import { construirCorreoCuenta } from '../correo/plantillas-correo';
import { leerConfigCorreo, obtenerUrlWeb } from '../../../common/config/correo';
import { esperarConLimite } from '../../../common/esperar-con-limite.util';
import { enmascararCorreo } from '../../../common/enmascarar-correo.util';
import {
  OPCIONES_JOB_EMAIL,
  RETENCION_FALLIDOS_CORREO_CUENTA,
} from '../notificaciones.config';
import type { ContextoDespachador } from './contexto-despachador';
import {
  construirHuellaCorreoCuenta,
  construirJobIdCorreoCuenta,
  construirMotivoFalloEncolado,
  esFalloCriticoCorreoCuenta,
} from './despachador-reglas';

/**
 * Encola el correo esperando la confirmación de Redis como máximo
 * `TIEMPO_MAX_ENCOLADO_CORREO_CUENTA_MS`.
 *
 * Con Redis caído (`maxRetriesPerRequest: null`) `Queue.add` quedaría pendiente para siempre en
 * la cola de comandos de ioredis, reteniendo en memoria el enlace con el código. Por eso:
 * - si la conexión no está lista, no se llama a `add` (el código no entra en esa cola);
 * - si vence el tiempo antes de llamar a `add`, se cancela y ya no se encola;
 * - la espera se acota con `esperarConLimite` (sin temporizadores colgados).
 * Límite conocido: un `add` ya enviado a ioredis no se puede retirar; si Redis vuelve, el
 * correo sale tarde (el enlace sigue siendo válido mientras no venza).
 * (Movido sin cambios desde `NotificationDispatcherService.despacharCorreoCuenta`.)
 */
export async function despacharCorreoCuenta(
  ctx: ContextoDespachador,
  payload: CorreoCuentaPayload,
): Promise<ResultadoDespachoCorreoCuenta> {
  const control = { cancelado: false };
  const resultado = await esperarConLimite(
    encolarCorreoCuenta(ctx, payload, control),
    TIEMPO_MAX_ENCOLADO_CORREO_CUENTA_MS,
    () => {
      control.cancelado = true;
    },
  );

  if (!resultado.ok) {
    const motivo = construirMotivoFalloEncolado(resultado);
    // Sin el código ni el correo completo: solo tipo, usuario y destinatario enmascarado.
    const linea = `No se pudo encolar el correo '${payload.tipo}' del usuario ${
      payload.usuarioId
    } (${enmascararCorreo(payload.email)}): ${motivo}`;
    // La recuperación no tiene respaldo visible (su respuesta es genérica): es un error. Las
    // bienvenidas tienen el enlace copiable en pantalla: aviso.
    if (esFalloCriticoCorreoCuenta(payload.tipo)) ctx.logger.error(linea);
    else ctx.logger.warn(linea);
    return { encolado: false, correoEnCamino: false };
  }

  ctx.logger.log(`Correo de cuenta '${payload.tipo}' encolado para el usuario ${payload.usuarioId}`);
  return { encolado: true, correoEnCamino: entregaRealDeCorreo(ctx) };
}

async function encolarCorreoCuenta(
  ctx: ContextoDespachador,
  payload: CorreoCuentaPayload,
  control: { cancelado: boolean },
): Promise<void> {
  await verificarColaEmailLista(ctx);
  if (control.cancelado) return;

  const correo = construirCorreoCuenta(payload, obtenerUrlWeb());
  // Idempotencia por enlace: el mismo código no se encola dos veces; un enlace nuevo sí. El id
  // lleva una huella del código, nunca el código en claro. Los avisos de seguridad sin enlace
  // (RF-018) no tienen código: cada uno lleva un id propio para que BullMQ no descarte el
  // segundo aviso por compartir id con uno anterior retenido.
  const huella = construirHuellaCorreoCuenta(payload.token, randomUUID());

  await ctx.emailQueue.add(
    'enviar-email',
    {
      usuarioId: payload.usuarioId,
      email: payload.email,
      nombreDestinatario: payload.nombre,
      asunto: correo.asunto,
      cuerpo: correo.texto,
      html: correo.html,
      tipoEvento: payload.tipo,
      esCriticoSeguridad: TIPOS_CORREO_SEGURIDAD.has(payload.tipo),
    },
    {
      ...OPCIONES_JOB_EMAIL,
      jobId: construirJobIdCorreoCuenta(payload.tipo, payload.usuarioId, huella),
      // El enlace de un solo uso no se retiene en Redis una vez entregado, y los fallidos solo
      // 24 h (la copia de la DLQ va sin el enlace).
      removeOnComplete: true,
      removeOnFail: RETENCION_FALLIDOS_CORREO_CUENTA,
    },
  );
}

/**
 * Lanza si la conexión de la cola existe pero no está lista (Redis caído o reconectando): así el
 * job con el enlace no queda esperando en memoria a que Redis vuelva.
 * (Movido sin cambios desde `NotificationDispatcherService.verificarColaEmailLista`.)
 */
async function verificarColaEmailLista(ctx: ContextoDespachador): Promise<void> {
  const cliente = (ctx.emailQueue as Partial<Queue>).client;
  if (!cliente) return;
  const conexion = (await cliente) as { status?: string } | undefined;
  if (conexion?.status && conexion.status !== 'ready') {
    throw new Error(`la conexión con la cola no está lista (${conexion.status})`);
  }
}

function entregaRealDeCorreo(ctx: ContextoDespachador): boolean {
  return ctx.adaptadorCorreo
    ? ctx.adaptadorCorreo.entregaReal
    : leerConfigCorreo().modo === 'brevo';
}
