import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DRIZZLE_DB } from '../../database/database.module';
import type { Database } from '@guachafit/database';
import { notificacionesInApp } from '@guachafit/database';
import { PreferenciasNotificacionService } from './preferencias-notificacion.service';
import { DispositivosService } from './dispositivos.service';
import type {
  BandejaNotificacionesInAppDTO,
  EventoNotificacionPayload,
  FiltroBandejaInAppDTO,
  NotificacionInAppDTO,
  Rol,
} from '@guachafit/shared';
import {
  EventoNotificacionDominio,
  PATRON_EVENTOS_NOTIFICACION,
} from './events/eventos-notificacion';
import {
  EventoCorreoCuenta,
  CorreoCuentaPayload,
  PATRON_EVENTOS_CORREO_CUENTA,
  ResultadoDespachoCorreoCuenta,
} from './events/eventos-correo-cuenta';
import { ADAPTADOR_CORREO, AdaptadorCorreo } from './correo/adaptador-correo';
import { COLA_EMAIL, COLA_PUSH } from './notificaciones.config';
import type { ContextoDespachador } from './casos-despachador/contexto-despachador';
import { mapearNotificacionInApp as mapearNotificacionInAppCaso } from './casos-despachador/despachador-reglas';
import { despacharCorreoCuenta as despacharCorreoCuentaCaso } from './casos-despachador/despachar-correo-cuenta';
import { despacharEvento as despacharEventoCaso } from './casos-despachador/despachar-evento';
import { listarNotificacionesInApp as listarNotificacionesInAppCaso } from './casos-despachador/listar-notificaciones-in-app';
import {
  marcarLeida as marcarLeidaCaso,
  marcarTodasLeidas as marcarTodasLeidasCaso,
} from './casos-despachador/marcar-notificaciones';
import { resolverRolDestinatario as resolverRolDestinatarioCaso } from './casos-despachador/resolver-rol-destinatario';

export interface DespachoResultado {
  inAppId: string;
  pushEnqueued: boolean;
  emailEnqueued: boolean;
  activeDeviceTokensCount: number;
}

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  /**
   * P2: contexto explícito de dependencias para los casos de uso en funciones planas,
   * construido una vez aquí. Nunca se registra como provider de Nest.
   */
  private readonly ctx: ContextoDespachador;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly preferenciasService: PreferenciasNotificacionService,
    private readonly dispositivosService: DispositivosService,
    @InjectQueue(COLA_PUSH) private readonly pushQueue: Queue,
    @InjectQueue(COLA_EMAIL) private readonly emailQueue: Queue,
    // Para saber si un correo de cuenta sale de verdad (Brevo) o solo se registra (simulado).
    // Sin adaptador (tests que instancian el servicio a mano) se decide por la configuración.
    @Optional() @Inject(ADAPTADOR_CORREO) private readonly adaptadorCorreo?: AdaptadorCorreo
  ) {
    this.ctx = {
      db: this.db,
      logger: this.logger,
      preferenciasService: this.preferenciasService,
      dispositivosService: this.dispositivosService,
      pushQueue: this.pushQueue,
      emailQueue: this.emailQueue,
      adaptadorCorreo: this.adaptadorCorreo,
    };
  }

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
    return despacharCorreoCuentaCaso(this.ctx, payload);
  }

  /** Pipeline de despacho (RF-014 RN-02): ver `casos-despachador/despachar-evento.ts`. */
  async despacharEvento(evento: EventoNotificacionPayload): Promise<DespachoResultado> {
    return despacharEventoCaso(this.ctx, evento);
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
    return resolverRolDestinatarioCaso(this.ctx, usuarioId);
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
    return listarNotificacionesInAppCaso(this.ctx, usuarioId, filtro);
  }

  private mapearNotificacionInApp(r: typeof notificacionesInApp.$inferSelect): NotificacionInAppDTO {
    return mapearNotificacionInAppCaso(r);
  }

  async marcarLeida(usuarioId: string, notificacionId: string): Promise<boolean> {
    return marcarLeidaCaso(this.ctx, usuarioId, notificacionId);
  }

  async marcarTodasLeidas(usuarioId: string): Promise<number> {
    return marcarTodasLeidasCaso(this.ctx, usuarioId);
  }
}
