import { eq, notificacionesInApp, usuarios } from '@guachafit/database';
import {
  type EventoNotificacionPayload,
  type PreferenciasNotificacionDTO,
} from '@guachafit/shared';
import { decidirCanalesNotificacion } from '../matriz-preferencias';
import { enmascararCorreo } from '../../../common/enmascarar-correo.util';
import {
  OPCIONES_JOB_EMAIL,
  OPCIONES_JOB_PUSH,
  construirJobIdNotificacion,
} from '../notificaciones.config';
import type { ContextoDespachador } from './contexto-despachador';
import { resolverRolDestinatario } from './resolver-rol-destinatario';
import type { DespachoResultado } from '../notification-dispatcher.service';

/**
 * Pipeline de despacho desacoplado Event-Driven (RF-014 RN-02).
 * 1. Registra de forma universal e inmediata en la bandeja In-App (campana del usuario).
 * 2. Consulta la matriz de preferencias del destinatario y su rol (RF-015 §A/§B).
 * 3. Resuelve la fila (rol + categoría): canales obligatorios (RN-01) + preferencias + defaults.
 * 4. Encola en 'notificaciones-push' y/o 'notificaciones-email' según esa decisión.
 * (Movido sin cambios desde `NotificationDispatcherService.despacharEvento`.)
 */
export async function despacharEvento(
  ctx: ContextoDespachador,
  evento: EventoNotificacionPayload,
): Promise<DespachoResultado> {
  const nowUtc = new Date();
  ctx.logger.log(
    `[Despachador] Procesando evento '${evento.tipoEvento}' (${evento.categoria}) para usuario ${evento.destinatarioUserId}`,
  );

  // -------------------------------------------------------------------------
  // 1. Fallback In-App Universal (RN-02 Paso 1 & RN-04)
  // -------------------------------------------------------------------------
  const [inApp] = await ctx.db
    .insert(notificacionesInApp)
    .values({
      usuarioId: evento.destinatarioUserId,
      titulo: evento.titulo,
      cuerpo: evento.cuerpo,
      tipoEvento: evento.tipoEvento,
      linkAccion: evento.linkAccion || null,
      // RF-003 §6 / RNF-004 §3: la referencia de origen también viaja al In-App para que un
      // barrido idempotente pueda pre-chequear su propio aviso (p. ej. expiración por alumno+fecha).
      referenciaId: evento.referenciaId?.trim() || null,
      leida: false,
      createdAtUtc: nowUtc,
    })
    .returning();

  // -------------------------------------------------------------------------
  // 2. Preferencias del destinatario + rol (matriz RF-015 §A/§B)
  // -------------------------------------------------------------------------
  let prefs: PreferenciasNotificacionDTO | null = null;
  try {
    prefs = await ctx.preferenciasService.obtenerPreferencias(evento.destinatarioUserId);
  } catch {
    ctx.logger.warn(
      `No se pudieron obtener preferencias para usuario ${evento.destinatarioUserId}. ` +
        'Se aplican los defaults del doc RF-015 (In-App universal + canales obligatorios).',
    );
  }

  const rolDestinatario =
    prefs?.rol ?? (await resolverRolDestinatario(ctx, evento.destinatarioUserId));

  // RF-015: fila de la matriz (rol + categoría) → canales efectivos. Los campos ausentes caen al
  // default del doc y los canales obligatorios (RN-01) se fuerzan siempre.
  const decision = decidirCanalesNotificacion(evento, rolDestinatario, prefs);

  let pushEnqueued = false;
  let emailEnqueued = false;
  let activeTokens: string[] = [];

  // -------------------------------------------------------------------------
  // 3. Evaluación y Encolamiento Canal Push (BullMQ)
  // -------------------------------------------------------------------------
  if (decision.push) {
    const activeDevices = await ctx.dispositivosService.listarDispositivosActivos(
      evento.destinatarioUserId,
    );
    activeTokens = activeDevices.map((d) => d.deviceToken);

    if (activeTokens.length > 0) {
      await ctx.pushQueue.add(
        'enviar-push',
        {
          usuarioId: evento.destinatarioUserId,
          tokens: activeTokens,
          titulo: evento.titulo,
          cuerpo: evento.cuerpo,
          tipoEvento: evento.tipoEvento,
          linkAccion: evento.linkAccion,
          datosAdicionales: evento.datosAdicionales,
        },
        {
          ...OPCIONES_JOB_PUSH,
          // RNF-004 §3: idempotencia — reintentos/re-emisiones del mismo día UTC no duplican.
          jobId: construirJobIdNotificacion(evento, nowUtc),
        },
      );
      pushEnqueued = true;
      ctx.logger.log(
        `Job push encolado para ${activeTokens.length} dispositivos (matriz ${decision.filaMatriz ?? 'sin-fila'})`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // 4. Evaluación y Encolamiento Canal Email (BullMQ)
  // -------------------------------------------------------------------------
  // `emailForzado` cubre RN-01: canal obligatorio de la fila (seguridad) o alerta crítica
  // transaccional (comprobante de pago aprobado).
  const isSecurityCritical = decision.emailForzado;

  if (decision.email) {
    const [destinatario] = await ctx.db
      .select({ email: usuarios.email })
      .from(usuarios)
      .where(eq(usuarios.id, evento.destinatarioUserId))
      .limit(1);

    if (destinatario?.email) {
      await ctx.emailQueue.add(
        'enviar-email',
        {
          usuarioId: evento.destinatarioUserId,
          email: destinatario.email,
          asunto: evento.titulo,
          cuerpo: evento.cuerpo,
          tipoEvento: evento.tipoEvento,
          linkAccion: evento.linkAccion,
          datosAdicionales: evento.datosAdicionales,
          esCriticoSeguridad: isSecurityCritical,
        },
        {
          ...OPCIONES_JOB_EMAIL,
          // RNF-004 §3: idempotencia — reintentos/re-emisiones del mismo día UTC no duplican.
          jobId: construirJobIdNotificacion(evento, nowUtc),
        },
      );
      emailEnqueued = true;
      ctx.logger.log(`Job email encolado hacia ${enmascararCorreo(destinatario.email)}`);
    }
  }

  return {
    inAppId: inApp.id,
    pushEnqueued,
    emailEnqueued,
    activeDeviceTokensCount: activeTokens.length,
  };
}
