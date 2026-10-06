/**
 * Eventos de dominio de los correos de CUENTA (ADR-008/ADR-010, RF-014 RN-01).
 *
 * Bienvenidas (alta manual de alumno, entrenador creado por el superadmin) y recuperación de
 * contraseña. Los servicios de negocio solo publican estas clases en `EventEmitter2`; el
 * `NotificationDispatcherService` las escucha (`correo-cuenta.**`) y encola el correo en
 * `notificaciones-email`.
 *
 * Usan un espacio de nombres propio (no `notificacion.**`) a propósito: son correos
 * transaccionales de acceso, así que NO pasan por la bandeja In-App (el destinatario aún no puede
 * entrar) ni por la matriz de preferencias (RF-015): se envían siempre.
 *
 * `token` es el código en claro del enlace de un solo uso: solo vive en memoria y en el job de la
 * cola hasta que se entrega (el despachador lo encola con `removeOnComplete: true` y retención
 * corta de fallidos; la DLQ guarda una versión sin el enlace).
 */
import { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { esperarConLimite } from '../../../common/esperar-con-limite.util';

/** Patrón EventEmitter2 que escucha el despachador (requiere `wildcard: true`). */
export const PATRON_EVENTOS_CORREO_CUENTA = 'correo-cuenta.**';

export const TIPOS_CORREO_CUENTA = [
  'BIENVENIDA_ALUMNO',
  'BIENVENIDA_ENTRENADOR',
  'RECUPERACION_PASSWORD',
  // RF-018: cambio de correo y de contraseña desde "Mi perfil".
  'CONFIRMACION_CAMBIO_CORREO',
  'AVISO_CORREO_CAMBIADO',
  'AVISO_PASSWORD_CAMBIADA',
] as const;

export type TipoCorreoCuenta = (typeof TIPOS_CORREO_CUENTA)[number];

/** Correos de cuenta críticos de seguridad (RF-015 RN-01: siempre por correo). */
export const TIPOS_CORREO_SEGURIDAD: ReadonlySet<TipoCorreoCuenta> = new Set<TipoCorreoCuenta>([
  'RECUPERACION_PASSWORD',
  'CONFIRMACION_CAMBIO_CORREO',
  'AVISO_CORREO_CAMBIADO',
  'AVISO_PASSWORD_CAMBIADA',
]);

/**
 * `true` si el `tipoEvento` de un job de correo es un correo de cuenta. Las bienvenidas, la
 * recuperación y la confirmación de correo llevan enlace con código; los avisos de RF-018 no.
 */
export function esTipoCorreoCuenta(tipo: unknown): tipo is TipoCorreoCuenta {
  return typeof tipo === 'string' && (TIPOS_CORREO_CUENTA as readonly string[]).includes(tipo);
}

export interface CorreoCuentaPayload {
  tipo: TipoCorreoCuenta;
  usuarioId: string;
  email: string;
  nombre: string | null;
  /** Código en claro del enlace; vacío en los avisos de seguridad, que no llevan enlace. */
  token: string;
  /** RF-018 RN-06: correo nuevo, para mencionarlo enmascarado en el aviso al correo anterior. */
  correoNuevo?: string;
}

/**
 * Lo que devuelve el despachador al escuchar un correo de cuenta.
 * - `encolado`: Redis confirmó el job dentro del tiempo límite.
 * - `correoEnCamino`: además hay un proveedor real configurado (en modo simulado el correo solo
 *   se escribe en el log, así que no se le puede decir al usuario que se envió).
 */
export interface ResultadoDespachoCorreoCuenta {
  encolado: boolean;
  correoEnCamino: boolean;
}

/**
 * Tiempo máximo para confirmar el encolado. Corto a propósito: el alta ya se confirmó y solo se
 * espera para decidir el texto de la respuesta; con Redis caído no se debe colgar la petición.
 */
export const TIEMPO_MAX_ENCOLADO_CORREO_CUENTA_MS = 2_500;

/** Margen del emisor sobre el límite del despachador (lectura del bus, armado del correo). */
const MARGEN_EMISOR_MS = 500;

export abstract class EventoCorreoCuenta {
  readonly ocurridoEnUtc = new Date().toISOString();

  constructor(public readonly payload: CorreoCuentaPayload) {}
}

/** RF-011 RN-05: el entrenador dio de alta al alumno a mano (enlace /activar). */
export class BienvenidaAlumnoEvent extends EventoCorreoCuenta {
  static readonly NOMBRE = 'correo-cuenta.bienvenida-alumno';
}

/** RF-010 Escenario 1: el superadmin creó la cuenta del entrenador sin contraseña. */
export class BienvenidaEntrenadorEvent extends EventoCorreoCuenta {
  static readonly NOMBRE = 'correo-cuenta.bienvenida-entrenador';
}

/** El usuario pidió restablecer su contraseña (enlace /restablecer). */
export class RecuperacionPasswordSolicitadaEvent extends EventoCorreoCuenta {
  static readonly NOMBRE = 'correo-cuenta.recuperacion-password';
}

/** RF-018 RN-05: confirmar el correo nuevo (enlace /confirmar-correo, enviado al correo NUEVO). */
export class ConfirmacionCambioCorreoEvent extends EventoCorreoCuenta {
  static readonly NOMBRE = 'correo-cuenta.confirmacion-cambio-correo';
}

/** RF-018 RN-06: aviso de seguridad al correo ANTERIOR tras confirmar el cambio (sin enlace). */
export class AvisoCorreoCambiadoEvent extends EventoCorreoCuenta {
  static readonly NOMBRE = 'correo-cuenta.aviso-correo-cambiado';
}

/** RF-018 RN-08: aviso de seguridad tras cambiar la contraseña desde "Mi perfil" (sin enlace). */
export class AvisoPasswordCambiadaEvent extends EventoCorreoCuenta {
  static readonly NOMBRE = 'correo-cuenta.aviso-password-cambiada';
}

/**
 * Publica un correo de cuenta y espera, con tiempo límite, la confirmación del despachador.
 *
 * Devuelve `true` solo si el correo quedó realmente en camino. Nunca lanza: un fallo del bus o de
 * la cola, o que no confirme a tiempo, se registra como aviso y devuelve `false` (la operación de
 * negocio ya se confirmó y el enlace copiable sigue siendo el respaldo).
 */
export async function publicarCorreoCuenta(
  emisor: Pick<EventEmitter2, 'emitAsync'> | undefined,
  nombreEvento: string,
  evento: EventoCorreoCuenta,
  logger: Pick<Logger, 'warn'>
): Promise<boolean> {
  if (!emisor) return false;
  const { tipo, usuarioId } = evento.payload;
  const resultado = await esperarConLimite(
    Promise.resolve().then(() => emisor.emitAsync(nombreEvento, evento)),
    TIEMPO_MAX_ENCOLADO_CORREO_CUENTA_MS + MARGEN_EMISOR_MS
  );

  if (!resultado.ok) {
    const detalle =
      resultado.motivo === 'tiempo'
        ? 'no se confirmó a tiempo'
        : resultado.error instanceof Error
          ? resultado.error.message
          : String(resultado.error);
    logger.warn(`No se pudo encolar el correo '${tipo}' del usuario ${usuarioId}: ${detalle}`);
    return false;
  }

  const respuestas = Array.isArray(resultado.valor) ? resultado.valor : [];
  return respuestas.some(
    (r) => (r as Partial<ResultadoDespachoCorreoCuenta> | null)?.correoEnCamino === true
  );
}
