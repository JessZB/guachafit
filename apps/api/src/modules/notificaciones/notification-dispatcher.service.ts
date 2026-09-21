import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DRIZZLE_DB } from '../../database/database.module';
import { Database, eq, and, desc, notificacionesInApp, usuarios } from '@guachafit/database';
import { PreferenciasNotificacionService } from './preferencias-notificacion.service';
import { DispositivosService } from './dispositivos.service';
import { EventoNotificacionPayload, NotificacionInAppDTO } from '@guachafit/shared';

export interface DespachoResultado {
  inAppId: string;
  pushEnqueued: boolean;
  emailEnqueued: boolean;
  activeDeviceTokensCount: number;
}

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly preferenciasService: PreferenciasNotificacionService,
    private readonly dispositivosService: DispositivosService,
    @InjectQueue('notificaciones-push') private readonly pushQueue: Queue,
    @InjectQueue('notificaciones-email') private readonly emailQueue: Queue
  ) {}

  /**
   * Pipeline de despacho desacoplado Event-Driven (RF-014 RN-02).
   * 1. Registra de forma universal e inmediata en la bandeja In-App (campana del usuario).
   * 2. Consulta la matriz de preferencias del destinatario.
   * 3. Si Push está habilitado y tiene dispositivos activos, encola en 'notificaciones-push'.
   * 4. Si Email está habilitado (o si es alerta crítica de seguridad inviolable), encola en 'notificaciones-email'.
   */
  async despacharEvento(evento: EventoNotificacionPayload): Promise<DespachoResultado> {
    const nowUtc = new Date();
    this.logger.log(
      `[Despachador] Procesando evento '${evento.tipoEvento}' (${evento.categoria}) para usuario ${evento.destinatarioUserId}`
    );

    // -------------------------------------------------------------------------
    // 1. Fallback In-App Universal (RN-02 Paso 1 & RN-04)
    // -------------------------------------------------------------------------
    const [inApp] = await this.db
      .insert(notificacionesInApp)
      .values({
        usuarioId: evento.destinatarioUserId,
        titulo: evento.titulo,
        cuerpo: evento.cuerpo,
        tipoEvento: evento.tipoEvento,
        linkAccion: evento.linkAccion || null,
        leida: false,
        createdAtUtc: nowUtc,
      })
      .returning();

    // -------------------------------------------------------------------------
    // 2. Consulta de Preferencias del Destinatario
    // -------------------------------------------------------------------------
    let prefs;
    try {
      prefs = await this.preferenciasService.obtenerPreferencias(evento.destinatarioUserId);
    } catch {
      this.logger.warn(`No se pudieron obtener preferencias para usuario ${evento.destinatarioUserId}. Usando defaults.`);
      prefs = {
        notifyPaymentsPush: true,
        notifyPaymentsEmail: true,
        notifyWorkoutsPush: true,
        notifyWorkoutsEmail: false,
        notifyCheckinsPush: true,
        notifyCheckinsEmail: false,
        digestWeeklyEmail: false,
      };
    }

    let pushEnqueued = false;
    let emailEnqueued = false;
    let activeTokens: string[] = [];

    // -------------------------------------------------------------------------
    // 3. Evaluación y Encolamiento Canal Push (BullMQ)
    // -------------------------------------------------------------------------
    let shouldSendPush = false;
    switch (evento.categoria) {
      case 'FINANZAS':
        shouldSendPush = prefs.notifyPaymentsPush;
        break;
      case 'ENTRENAMIENTO':
        shouldSendPush = prefs.notifyWorkoutsPush;
        break;
      case 'ANTROPOMETRIA':
        shouldSendPush = prefs.notifyCheckinsPush;
        break;
      // WU-E: "Nuevos Registros" del coach (RF-015 §B) aún no tiene preferencia propia de
      // Push/Email; se garantiza el In-App universal (RN-04) sin robar la preferencia de otra
      // categoría. Al migrar RF-015 se enrutarán aquí sus canales.
      case 'ALUMNOS':
      case 'SEGURIDAD':
      case 'RESUMEN_SEMANAL':
      default:
        shouldSendPush = false;
        break;
    }

    if (shouldSendPush) {
      const activeDevices = await this.dispositivosService.listarDispositivosActivos(
        evento.destinatarioUserId
      );
      activeTokens = activeDevices.map((d) => d.deviceToken);

      if (activeTokens.length > 0) {
        await this.pushQueue.add(
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
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: 100,
            removeOnFail: 500,
          }
        );
        pushEnqueued = true;
        this.logger.log(`Job push encolado para ${activeTokens.length} dispositivos`);
      }
    }

    // -------------------------------------------------------------------------
    // 4. Evaluación y Encolamiento Canal Email (BullMQ)
    // -------------------------------------------------------------------------
    // Regla de Inviolabilidad de Seguridad (RF-015 RN-01)
    const isSecurityCritical = evento.esCriticoSeguridad === true || evento.categoria === 'SEGURIDAD';

    let shouldSendEmail = false;
    if (isSecurityCritical) {
      shouldSendEmail = true;
    } else {
      switch (evento.categoria) {
        case 'FINANZAS':
          shouldSendEmail = prefs.notifyPaymentsEmail;
          break;
        case 'ENTRENAMIENTO':
          shouldSendEmail = prefs.notifyWorkoutsEmail;
          break;
        case 'ANTROPOMETRIA':
          shouldSendEmail = prefs.notifyCheckinsEmail;
          break;
        case 'RESUMEN_SEMANAL':
          shouldSendEmail = prefs.digestWeeklyEmail;
          break;
        // WU-E: sin preferencia propia todavía (ver nota del switch de Push): In-App universal.
        case 'ALUMNOS':
          shouldSendEmail = false;
          break;
        default:
          shouldSendEmail = false;
          break;
      }
    }

    if (shouldSendEmail) {
      const [destinatario] = await this.db
        .select({ email: usuarios.email })
        .from(usuarios)
        .where(eq(usuarios.id, evento.destinatarioUserId))
        .limit(1);

      if (destinatario?.email) {
        await this.emailQueue.add(
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
            attempts: 5,
            backoff: { type: 'exponential', delay: 3000 },
            removeOnComplete: 100,
            removeOnFail: 500,
          }
        );
        emailEnqueued = true;
        this.logger.log(`Job email encolado hacia ${destinatario.email}`);
      }
    }

    return {
      inAppId: inApp.id,
      pushEnqueued,
      emailEnqueued,
      activeDeviceTokensCount: activeTokens.length,
    };
  }

  // ===========================================================================
  // BANDEJA IN-APP (Campana de Notificaciones)
  // ===========================================================================

  async listarNotificacionesInApp(usuarioId: string, limite = 50): Promise<NotificacionInAppDTO[]> {
    const rows = await this.db
      .select()
      .from(notificacionesInApp)
      .where(eq(notificacionesInApp.usuarioId, usuarioId))
      .orderBy(desc(notificacionesInApp.createdAtUtc))
      .limit(limite);

    return rows.map((r) => ({
      id: r.id,
      usuarioId: r.usuarioId,
      titulo: r.titulo,
      cuerpo: r.cuerpo,
      tipoEvento: r.tipoEvento,
      leida: r.leida,
      linkAccion: r.linkAccion,
      createdAtUtc:
        r.createdAtUtc instanceof Date
          ? r.createdAtUtc.toISOString()
          : new Date(r.createdAtUtc).toISOString(),
    }));
  }

  async marcarLeida(usuarioId: string, notificacionId: string): Promise<boolean> {
    const [actualizado] = await this.db
      .update(notificacionesInApp)
      .set({ leida: true })
      .where(
        and(
          eq(notificacionesInApp.id, notificacionId),
          eq(notificacionesInApp.usuarioId, usuarioId)
        )
      )
      .returning();

    if (!actualizado) {
      throw new NotFoundException(`Notificación '${notificacionId}' no encontrada`);
    }

    return true;
  }

  async marcarTodasLeidas(usuarioId: string): Promise<number> {
    const res = await this.db
      .update(notificacionesInApp)
      .set({ leida: true })
      .where(
        and(
          eq(notificacionesInApp.usuarioId, usuarioId),
          eq(notificacionesInApp.leida, false)
        )
      )
      .returning();

    return res.length;
  }
}
