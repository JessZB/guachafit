import { Injectable, Inject, Logger, NotFoundException, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DRIZZLE_DB } from '../../database/database.module';
import {
  Database,
  eq,
  and,
  desc,
  count,
  notificacionesInApp,
  usuarios,
} from '@guachafit/database';
import { PreferenciasNotificacionService } from './preferencias-notificacion.service';
import { DispositivosService } from './dispositivos.service';
import {
  BandejaNotificacionesInAppDTO,
  EventoNotificacionPayload,
  FiltroBandejaInAppDTO,
  LIMITE_IN_APP_POR_DEFECTO,
  NotificacionInAppDTO,
  PreferenciasNotificacionDTO,
  Rol,
} from '@guachafit/shared';
import { decidirCanalesNotificacion } from './matriz-preferencias';
import {
  EventoNotificacionDominio,
  PATRON_EVENTOS_NOTIFICACION,
} from './events/eventos-notificacion';
import {
  EventoCorreoCuenta,
  CorreoCuentaPayload,
  PATRON_EVENTOS_CORREO_CUENTA,
  ResultadoDespachoCorreoCuenta,
  TIEMPO_MAX_ENCOLADO_CORREO_CUENTA_MS,
  TIPOS_CORREO_SEGURIDAD,
} from './events/eventos-correo-cuenta';
import { construirCorreoCuenta } from './correo/plantillas-correo';
import { ADAPTADOR_CORREO, AdaptadorCorreo } from './correo/adaptador-correo';
import { leerConfigCorreo, obtenerUrlWeb } from '../../common/config/correo';
import { esperarConLimite } from '../../common/esperar-con-limite.util';
import { enmascararCorreo } from '../../common/enmascarar-correo.util';
import { createHash, randomUUID } from 'node:crypto';
import {
  COLA_EMAIL,
  COLA_PUSH,
  OPCIONES_JOB_EMAIL,
  OPCIONES_JOB_PUSH,
  RETENCION_FALLIDOS_CORREO_CUENTA,
  construirJobIdNotificacion,
} from './notificaciones.config';

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
    @InjectQueue(COLA_PUSH) private readonly pushQueue: Queue,
    @InjectQueue(COLA_EMAIL) private readonly emailQueue: Queue,
    // Para saber si un correo de cuenta sale de verdad (Brevo) o solo se registra (simulado).
    // Sin adaptador (tests que instancian el servicio a mano) se decide por la configuración.
    @Optional() @Inject(ADAPTADOR_CORREO) private readonly adaptadorCorreo?: AdaptadorCorreo
  ) {}

  /**
   * RF-014 RN-01/RN-02: punto de entrada event-driven del despachador.
   *
   * Escucha TODOS los eventos de dominio `notificacion.**` (requiere `wildcard: true` en
   * `EventEmitterModule.forRoot`) y delega en el pipeline. `suppressErrors: false` propaga el
   * fallo al emisor que decidió esperar (`emitAsync`): la cobranza lo usa para reintentar el job
   * y los emisores fire-and-forget lo consumen con `.catch(...)` para no romper su transacción.
   */
  @OnEvent(PATRON_EVENTOS_NOTIFICACION, { suppressErrors: false })
  async alEventoDeNotificacion(evento: EventoNotificacionDominio): Promise<DespachoResultado> {
    return this.despacharEvento(evento.payload);
  }

  /**
   * Correos de CUENTA (ADR-008/ADR-010): bienvenidas y recuperación de contraseña.
   *
   * No pasan por la bandeja In-App ni por las preferencias (RF-015): son transaccionales de acceso
   * y se envían siempre. El correo se arma aquí (plantillas puras + `APP_URL`) y el worker solo lo
   * entrega. Devuelve si el correo quedó en camino: el alta lo usa para no prometer un envío que
   * no ocurrió. No lanza: los fallos se registran aquí.
   */
  @OnEvent(PATRON_EVENTOS_CORREO_CUENTA, { suppressErrors: false })
  async alEventoCorreoCuenta(evento: EventoCorreoCuenta): Promise<ResultadoDespachoCorreoCuenta> {
    return this.despacharCorreoCuenta(evento.payload);
  }

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
   */
  async despacharCorreoCuenta(payload: CorreoCuentaPayload): Promise<ResultadoDespachoCorreoCuenta> {
    const control = { cancelado: false };
    const resultado = await esperarConLimite(
      this.encolarCorreoCuenta(payload, control),
      TIEMPO_MAX_ENCOLADO_CORREO_CUENTA_MS,
      () => {
        control.cancelado = true;
      }
    );

    if (!resultado.ok) {
      const motivo =
        resultado.motivo === 'tiempo'
          ? `la cola no respondió en ${TIEMPO_MAX_ENCOLADO_CORREO_CUENTA_MS} ms`
          : resultado.error instanceof Error
            ? resultado.error.message
            : String(resultado.error);
      // Sin el código ni el correo completo: solo tipo, usuario y destinatario enmascarado.
      const linea = `No se pudo encolar el correo '${payload.tipo}' del usuario ${
        payload.usuarioId
      } (${enmascararCorreo(payload.email)}): ${motivo}`;
      // La recuperación no tiene respaldo visible (su respuesta es genérica): es un error. Las
      // bienvenidas tienen el enlace copiable en pantalla: aviso.
      if (payload.tipo === 'RECUPERACION_PASSWORD') this.logger.error(linea);
      else this.logger.warn(linea);
      return { encolado: false, correoEnCamino: false };
    }

    this.logger.log(`Correo de cuenta '${payload.tipo}' encolado para el usuario ${payload.usuarioId}`);
    return { encolado: true, correoEnCamino: this.entregaRealDeCorreo() };
  }

  private async encolarCorreoCuenta(
    payload: CorreoCuentaPayload,
    control: { cancelado: boolean }
  ): Promise<void> {
    await this.verificarColaEmailLista();
    if (control.cancelado) return;

    const correo = construirCorreoCuenta(payload, obtenerUrlWeb());
    // Idempotencia por enlace: el mismo código no se encola dos veces; un enlace nuevo sí. El id
    // lleva una huella del código, nunca el código en claro. Los avisos de seguridad sin enlace
    // (RF-018) no tienen código: cada uno lleva un id propio para que BullMQ no descarte el
    // segundo aviso por compartir id con uno anterior retenido.
    const huella = payload.token
      ? createHash('sha256').update(payload.token).digest('hex').slice(0, 16)
      : `aviso_${randomUUID()}`;

    await this.emailQueue.add(
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
        jobId: `cuenta_${payload.tipo}_${payload.usuarioId}_${huella}`,
        // El enlace de un solo uso no se retiene en Redis una vez entregado, y los fallidos solo
        // 24 h (la copia de la DLQ va sin el enlace).
        removeOnComplete: true,
        removeOnFail: RETENCION_FALLIDOS_CORREO_CUENTA,
      }
    );
  }

  /**
   * Lanza si la conexión de la cola existe pero no está lista (Redis caído o reconectando): así el
   * job con el enlace no queda esperando en memoria a que Redis vuelva.
   */
  private async verificarColaEmailLista(): Promise<void> {
    const cliente = (this.emailQueue as Partial<Queue>).client;
    if (!cliente) return;
    const conexion = (await cliente) as { status?: string } | undefined;
    if (conexion?.status && conexion.status !== 'ready') {
      throw new Error(`la conexión con la cola no está lista (${conexion.status})`);
    }
  }

  private entregaRealDeCorreo(): boolean {
    return this.adaptadorCorreo
      ? this.adaptadorCorreo.entregaReal
      : leerConfigCorreo().modo === 'brevo';
  }

  /**
   * Pipeline de despacho desacoplado Event-Driven (RF-014 RN-02).
   * 1. Registra de forma universal e inmediata en la bandeja In-App (campana del usuario).
   * 2. Consulta la matriz de preferencias del destinatario y su rol (RF-015 §A/§B).
   * 3. Resuelve la fila (rol + categoría): canales obligatorios (RN-01) + preferencias + defaults.
   * 4. Encola en 'notificaciones-push' y/o 'notificaciones-email' según esa decisión.
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
      prefs = await this.preferenciasService.obtenerPreferencias(evento.destinatarioUserId);
    } catch {
      this.logger.warn(
        `No se pudieron obtener preferencias para usuario ${evento.destinatarioUserId}. ` +
          'Se aplican los defaults del doc RF-015 (In-App universal + canales obligatorios).'
      );
    }

    const rolDestinatario =
      prefs?.rol ?? (await this.resolverRolDestinatario(evento.destinatarioUserId));

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
            ...OPCIONES_JOB_PUSH,
            // RNF-004 §3: idempotencia — reintentos/re-emisiones del mismo día UTC no duplican.
            jobId: construirJobIdNotificacion(evento, nowUtc),
          }
        );
        pushEnqueued = true;
        this.logger.log(
          `Job push encolado para ${activeTokens.length} dispositivos (matriz ${decision.filaMatriz ?? 'sin-fila'})`
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
            ...OPCIONES_JOB_EMAIL,
            // RNF-004 §3: idempotencia — reintentos/re-emisiones del mismo día UTC no duplican.
            jobId: construirJobIdNotificacion(evento, nowUtc),
          }
        );
        emailEnqueued = true;
        this.logger.log(`Job email encolado hacia ${enmascararCorreo(destinatario.email)}`);
      }
    }

    return {
      inAppId: inApp.id,
      pushEnqueued,
      emailEnqueued,
      activeDeviceTokensCount: activeTokens.length,
    };
  }

  /**
   * RF-015: rol del destinatario para elegir la mitad correcta de la matriz (§A alumno / §B coach).
   *
   * Se consulta solo cuando las preferencias no lo trajeron (fila legada o servicio caído). El
   * fallback es `ALUMNO`: ante un rol irresoluble se conserva el comportamiento más conservador
   * (categorías exclusivas del coach — `ALUMNOS`/`RESUMEN_SEMANAL` — siguen resolviéndose por
   * `buscarDefinicionUnica` en `matriz-preferencias`).
   */
  private async resolverRolDestinatario(usuarioId: string): Promise<Rol> {
    try {
      const [fila] = await this.db
        .select({ rol: usuarios.rol })
        .from(usuarios)
        .where(eq(usuarios.id, usuarioId))
        .limit(1);

      return fila?.rol ?? Rol.ALUMNO;
    } catch {
      return Rol.ALUMNO;
    }
  }

  // ===========================================================================
  // BANDEJA IN-APP (Campana de Notificaciones)
  // ===========================================================================

  /**
   * RF-014 (Ola 3): bandeja In-App paginada para la campana de N2.
   *
   * - Orden: más recientes primero con desempate estable por `id` (mismo criterio de paginación
   *   server-side del ADR-013: `offset` avanza sin repetir ni saltar filas).
   * - `total` es el COUNT real del filtro aplicado; `totalNoLeidas` cuenta SIEMPRE todas las no
   *   leídas del usuario para que el badge no dependa de la página ni del filtro.
   */
  async listarNotificacionesInApp(
    usuarioId: string,
    filtro: Partial<FiltroBandejaInAppDTO> = {}
  ): Promise<BandejaNotificacionesInAppDTO> {
    const limit = filtro.limit ?? LIMITE_IN_APP_POR_DEFECTO;
    const offset = filtro.offset ?? 0;
    const soloNoLeidas = filtro.soloNoLeidas ?? false;

    const condicionUsuario = eq(notificacionesInApp.usuarioId, usuarioId);
    const condicionLista = soloNoLeidas
      ? and(condicionUsuario, eq(notificacionesInApp.leida, false))
      : condicionUsuario;

    const [filaTotal] = await this.db
      .select({ total: count() })
      .from(notificacionesInApp)
      .where(condicionLista);

    const [filaNoLeidas] = await this.db
      .select({ total: count() })
      .from(notificacionesInApp)
      .where(and(condicionUsuario, eq(notificacionesInApp.leida, false)));

    const rows = await this.db
      .select()
      .from(notificacionesInApp)
      .where(condicionLista)
      .orderBy(desc(notificacionesInApp.createdAtUtc), desc(notificacionesInApp.id))
      .limit(limit)
      .offset(offset);

    return {
      items: rows.map((r) => this.mapearNotificacionInApp(r)),
      total: filaTotal?.total ?? 0,
      limit,
      offset,
      totalNoLeidas: filaNoLeidas?.total ?? 0,
    };
  }

  private mapearNotificacionInApp(r: typeof notificacionesInApp.$inferSelect): NotificacionInAppDTO {
    return {
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
    };
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
      throw new NotFoundException('No encontramos ese aviso. Actualiza la pantalla.');
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
