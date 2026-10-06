import {
  applyDecorators,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  Optional,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  normalizeIp,
  SkipThrottle,
  Throttle,
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import { MENSAJE_DEMASIADOS_INTENTOS } from '../mensajes-acceso';
import { enmascararCorreo } from '../enmascarar-correo.util';

/**
 * A5 (LOTE API-1): límite de intentos en las rutas sensibles sin sesión.
 *
 * Se aplica SOLO donde se declara uno de los decoradores de abajo (`LimitarIntentosLogin`,
 * `LimitarIntentosRefresh`, `LimitarIntentosRecuperacion`, `LimitarIntentosPublico` y, con
 * sesión, `LimitarIntentosCuenta` de RF-018). El resto del API no se limita.
 *
 * Dos contadores (throttlers con nombre); la clave incluye además la ruta, así que cada endpoint
 * cuenta por separado:
 * - `por-ip`: por IP del cliente (`req.ip`, que respeta `TRUST_PROXY`; ver `config/trust-proxy`).
 * - `por-correo`: por IP + correo normalizado, solo en el login. Así muchos alumnos tras la
 *   misma IP (wifi/NAT del gimnasio) no se bloquean entre sí.
 *
 * `@nestjs/throttler` 6 cuenta TODAS las peticiones (también los aciertos): no tiene opción para
 * contar solo fallos ni el almacén expone un decremento.
 */

/** Ventana de conteo: 1 minuto. */
export const VENTANA_LIMITE_INTENTOS_MS = 60_000;
/** Login: 5 intentos por minuto para el mismo correo desde la misma IP (fuerza bruta). */
export const LIMITE_INTENTOS_LOGIN = 5;
/** Login: tope por IP, holgado para un gimnasio con IP compartida; frena el rociado de correos. */
export const LIMITE_INTENTOS_LOGIN_POR_IP = 60;
/** Refresh: requiere un refresh token válido; tope holgado por IP (pestañas, dispositivos, NAT). */
export const LIMITE_INTENTOS_REFRESH = 60;
/** Rutas públicas (código de coach, registro, activación): 20 por minuto y por IP. */
export const LIMITE_INTENTOS_PUBLICO = 20;

/**
 * Recuperación de contraseña: 3 pedidos por IP + correo cada 15 minutos (evita inundar un buzón
 * con correos) además del tope público por IP.
 */
export const LIMITE_INTENTOS_RECUPERACION_POR_CORREO = 3;
export const VENTANA_RECUPERACION_MS = 15 * 60_000;

/**
 * Recuperación: además, 3 pedidos por hora para el MISMO correo venga de la IP que venga. Sin
 * este tope, alguien que rote IPs podría saturar el buzón de otra persona.
 */
export const LIMITE_RECUPERACION_SOLO_CORREO = 3;
export const VENTANA_RECUPERACION_SOLO_CORREO_MS = 60 * 60_000;

/**
 * RF-018 RN-10 ("Mi perfil"): cambio de contraseña y de correo con sesión. 5 intentos por usuario
 * cada 15 minutos: cada intento exige la contraseña actual, así se frena el adivinarla.
 */
export const LIMITE_INTENTOS_CUENTA = 5;
export const VENTANA_INTENTOS_CUENTA_MS = 15 * 60_000;

const LIMITE_POR_IP = 'por-ip';
const LIMITE_POR_CORREO = 'por-correo';
/** Solo lo usa la recuperación; las demás rutas lo saltan explícitamente. */
const LIMITE_SOLO_CORREO = 'solo-correo';
/** Solo lo usan las rutas de "Mi perfil" con sesión; las demás lo saltan explícitamente. */
const LIMITE_POR_USUARIO = 'por-usuario';

/** IP del cliente tal como la calcula Express (respeta `trust proxy`), normalizada como throttler. */
function ipDelCliente(req: Record<string, any>): string {
  return typeof req.ip === 'string' && req.ip ? normalizeIp(req.ip) : 'ip-desconocida';
}

function correoNormalizado(req: Record<string, any>): string {
  const email = req.body?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/** Tracker del login: `IP|correo` con el correo en minúsculas y sin espacios. */
export function trackerPorIpYCorreo(req: Record<string, any>): string {
  return `${ipDelCliente(req)}|${correoNormalizado(req)}`;
}

/**
 * Tracker por usuario autenticado (`req.user.sub`, que pone `JwtAuthGuard` antes que este guard).
 * Sin sesión cae a la IP para no compartir un contador vacío.
 */
export function trackerPorUsuario(req: Record<string, any>): string {
  const sub = req.user?.sub;
  return typeof sub === 'string' && sub ? `usuario|${sub}` : `ip|${ipDelCliente(req)}`;
}

/** Tracker de la recuperación por correo: `*|correo` (cualquier IP). */
export function trackerSoloCorreo(req: Record<string, any>): string {
  return `*|${correoNormalizado(req)}`;
}

/** Versión apta para logs del tracker: el usuario del correo queda como `j***`. */
export function enmascararTracker(tracker: string): string {
  const separador = tracker.indexOf('|');
  if (separador === -1) return tracker;
  const ip = tracker.slice(0, separador);
  const correo = tracker.slice(separador + 1);
  if (!correo) return `${ip}|(sin correo)`;
  return `${ip}|${enmascararCorreo(correo)}`;
}

/** Login: 5/min por IP + correo y 60/min por IP. */
export const LimitarIntentosLogin = () =>
  applyDecorators(
    UseGuards(LimiteIntentosGuard),
    Throttle({
      [LIMITE_POR_IP]: { limit: LIMITE_INTENTOS_LOGIN_POR_IP, ttl: VENTANA_LIMITE_INTENTOS_MS },
      [LIMITE_POR_CORREO]: { limit: LIMITE_INTENTOS_LOGIN, ttl: VENTANA_LIMITE_INTENTOS_MS },
    }),
    SkipThrottle({ [LIMITE_SOLO_CORREO]: true, [LIMITE_POR_USUARIO]: true })
  );

/** Refresh: 60/min por IP; no comparte cupo con el login. */
export const LimitarIntentosRefresh = () =>
  applyDecorators(
    UseGuards(LimiteIntentosGuard),
    Throttle({
      [LIMITE_POR_IP]: { limit: LIMITE_INTENTOS_REFRESH, ttl: VENTANA_LIMITE_INTENTOS_MS },
    }),
    SkipThrottle({ [LIMITE_POR_CORREO]: true, [LIMITE_SOLO_CORREO]: true, [LIMITE_POR_USUARIO]: true })
  );

/**
 * Recuperación de contraseña: 20/min por IP, 3 cada 15 min por IP + correo y 3 por hora por
 * correo (independiente de la IP).
 */
export const LimitarIntentosRecuperacion = () =>
  applyDecorators(
    UseGuards(LimiteIntentosGuard),
    Throttle({
      [LIMITE_POR_IP]: { limit: LIMITE_INTENTOS_PUBLICO, ttl: VENTANA_LIMITE_INTENTOS_MS },
      [LIMITE_POR_CORREO]: {
        limit: LIMITE_INTENTOS_RECUPERACION_POR_CORREO,
        ttl: VENTANA_RECUPERACION_MS,
      },
      [LIMITE_SOLO_CORREO]: {
        limit: LIMITE_RECUPERACION_SOLO_CORREO,
        ttl: VENTANA_RECUPERACION_SOLO_CORREO_MS,
      },
    }),
    SkipThrottle({ [LIMITE_POR_USUARIO]: true })
  );

/** Rutas públicas sin sesión: 20/min por IP. */
export const LimitarIntentosPublico = () =>
  applyDecorators(
    UseGuards(LimiteIntentosGuard),
    Throttle({
      [LIMITE_POR_IP]: { limit: LIMITE_INTENTOS_PUBLICO, ttl: VENTANA_LIMITE_INTENTOS_MS },
    }),
    SkipThrottle({ [LIMITE_POR_CORREO]: true, [LIMITE_SOLO_CORREO]: true, [LIMITE_POR_USUARIO]: true })
  );

/**
 * RF-018 RN-10: rutas de "Mi perfil" que exigen la contraseña actual (cambio de contraseña y de
 * correo). 5 intentos por usuario cada 15 minutos. Declarar DESPUÉS de `JwtAuthGuard` (a nivel de
 * clase) para que el contador sea por usuario.
 */
export const LimitarIntentosCuenta = () =>
  applyDecorators(
    UseGuards(LimiteIntentosGuard),
    Throttle({
      [LIMITE_POR_USUARIO]: { limit: LIMITE_INTENTOS_CUENTA, ttl: VENTANA_INTENTOS_CUENTA_MS },
    }),
    SkipThrottle({ [LIMITE_POR_IP]: true, [LIMITE_POR_CORREO]: true, [LIMITE_SOLO_CORREO]: true })
  );

type EntornoLimite = Partial<Record<'NODE_ENV' | 'LIMITE_INTENTOS_DESACTIVADO', string | undefined>>;

/**
 * Opciones del throttler. La desactivación es EXPLÍCITA y solo existe en `NODE_ENV=test`
 * (`LIMITE_INTENTOS_DESACTIVADO=true`, p. ej. para suites que golpean el login muchas veces);
 * en desarrollo y producción la bandera se ignora.
 */
export function crearOpcionesLimiteIntentos(entorno: EntornoLimite = process.env): ThrottlerModuleOptions {
  const desactivado =
    entorno.NODE_ENV === 'test' && entorno.LIMITE_INTENTOS_DESACTIVADO === 'true';
  return {
    throttlers: [
      {
        name: LIMITE_POR_IP,
        limit: LIMITE_INTENTOS_PUBLICO,
        ttl: VENTANA_LIMITE_INTENTOS_MS,
        getTracker: ipDelCliente,
      },
      {
        name: LIMITE_POR_CORREO,
        limit: LIMITE_INTENTOS_LOGIN,
        ttl: VENTANA_LIMITE_INTENTOS_MS,
        getTracker: trackerPorIpYCorreo,
      },
      {
        name: LIMITE_SOLO_CORREO,
        limit: LIMITE_RECUPERACION_SOLO_CORREO,
        ttl: VENTANA_RECUPERACION_SOLO_CORREO_MS,
        getTracker: trackerSoloCorreo,
      },
      {
        name: LIMITE_POR_USUARIO,
        limit: LIMITE_INTENTOS_CUENTA,
        ttl: VENTANA_INTENTOS_CUENTA_MS,
        getTracker: trackerPorUsuario,
      },
    ],
    errorMessage: MENSAJE_DEMASIADOS_INTENTOS,
    skipIf: () => desactivado,
  };
}

@Injectable()
export class LimiteIntentosGuard extends ThrottlerGuard {
  private readonly registro = new Logger(LimiteIntentosGuard.name);

  constructor(
    // `@Optional()`: en la app real `ThrottlerModule` (global) provee opciones y almacén
    // compartidos; los tests que montan un controlador suelto no lo importan y el guard usa
    // valores por defecto con un almacén propio en memoria.
    @Optional() @InjectThrottlerOptions() options: ThrottlerModuleOptions | undefined,
    @Optional() @InjectThrottlerStorage() storage: ThrottlerStorage | undefined,
    // Token explícito: los transformadores de test (esbuild) no emiten `design:paramtypes`.
    @Inject(Reflector) reflector: Reflector
  ) {
    super(
      options ?? crearOpcionesLimiteIntentos(),
      storage ?? new ThrottlerStorageService(),
      reflector
    );
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    // Guard declarado con `@UseGuards`: se garantiza la inicialización aunque el ciclo de vida
    // no haya llamado a `onModuleInit` (p. ej. en módulos de prueba).
    if (!this.throttlers) {
      await this.onModuleInit();
    }
    return super.canActivate(context);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detalle: ThrottlerLimitDetail
  ): Promise<void> {
    const req = context.switchToHttp().getRequest();
    // Ruta declarada (sin parámetros) y tracker enmascarado: nada de correos completos en logs.
    const ruta = req?.route?.path ?? req?.url ?? '(desconocida)';
    this.registro.warn(
      `Límite de intentos superado en ${req?.method ?? ''} ${ruta} ` +
        `(tracker: ${enmascararTracker(detalle.tracker)}, intentos: ${detalle.totalHits}/${detalle.limit}).`
    );
    throw new ThrottlerException(MENSAJE_DEMASIADOS_INTENTOS);
  }
}
