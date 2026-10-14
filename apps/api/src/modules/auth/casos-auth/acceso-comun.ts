import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import {
  and,
  eq,
  ne,
  perfilesAlumno,
  perfilesEntrenador,
  usuarios,
} from '@guachafit/database';
import {
  EstadoLicencia,
  EstadoUsuario,
  MENSAJE_CORREO_EN_USO,
  MENSAJE_PASSWORD_ACTUAL_INCORRECTA,
  Rol,
  type JwtPayload,
} from '@guachafit/shared';
import {
  MENSAJE_CUENTA_ARCHIVADA,
  MENSAJE_CUENTA_DESACTIVADA,
  MENSAJE_SESION_VENCIDA,
} from '../../../common/mensajes-acceso';
import type { EventoCorreoCuenta } from '../../notificaciones/events/eventos-correo-cuenta';
import { publicarCorreoCuenta } from '../../notificaciones/events/eventos-correo-cuenta';
import type { ContextoAuth } from './contexto-auth';

/**
 * Ayudantes compartidos de sesión y acceso. Movido sin cambios desde los métodos privados de
 * `AuthService` (P3): mismas consultas, mismo orden, mismos errores y mensajes.
 */

/** Genera los tokens JWT de acceso (15 min) y refresco (7 días). */
export function generateTokens(
  ctx: Pick<ContextoAuth, 'jwtSecret' | 'refreshSecret'>,
  payload: JwtPayload
): { accessToken: string; refreshToken: string } {
  const accessToken = jwt.sign(payload, ctx.jwtSecret, { expiresIn: '15m' });
  const refreshToken = jwt.sign(
    { sub: payload.sub, email: payload.email, rol: payload.rol },
    ctx.refreshSecret,
    { expiresIn: '7d' }
  );
  return { accessToken, refreshToken };
}

/**
 * RF-010 §6 (WU Admin): una cuenta de entrenador SOLO opera con licencia `ACTIVA`.
 *
 * Mecanismo de revocación real (sin listas negras): el estado se verifica contra la BD en cada
 * ciclo de sesión - login, refresh y `GET /auth/me` -, así que deshabilitar la cuenta o
 * suspender la licencia bloquea de inmediato el refresh y cierra la sesión de la web en el
 * siguiente `/auth/me`. El UNICO límite es el access token ya emitido: al ser JWT stateless sin
 * consulta a BD en el guard, vive como máximo sus 15 minutos de TTL.
 */
export async function verificarLicenciaEntrenadorActiva(
  ctx: Pick<ContextoAuth, 'db'>,
  usuarioId: string
): Promise<{ nombres: string | null }> {
  const [perfil] = await ctx.db
    .select({
      estadoLicencia: perfilesEntrenador.estadoLicencia,
      nombres: perfilesEntrenador.nombres,
    })
    .from(perfilesEntrenador)
    .where(eq(perfilesEntrenador.usuarioId, usuarioId))
    .limit(1);

  if (!perfil || perfil.estadoLicencia !== EstadoLicencia.ACTIVA) {
    throw new UnauthorizedException(
      'La licencia de esta cuenta no está activa. Contacta al administrador de la plataforma.'
    );
  }
  return { nombres: perfil.nombres ?? null };
}

/**
 * RF-010 §6 (CASCADA-COACH): el alumno solo opera si su entrenador está operable - cuenta
 * habilitada (`usuarios.activo`) Y licencia vigente (`perfiles_entrenador.estado_licencia`).
 *
 * Se evalúa en autenticación y derivado en runtime (login, `/auth/me`, refresh y canje), NO por
 * request: el guard no consulta la BD y no paga coste por petición (RF-010 §7). Al reactivar
 * cualquiera de los dos interruptores, el desbloqueo del alumno es inmediato en su siguiente
 * ciclo de sesión. El mensaje es único y no revela cuál de los dos falló.
 *
 * Semántica espejo del helper de licencia: sin fila en `perfiles_entrenador` el entrenador no
 * es operable. Ambas tablas no tienen RLS: la lectura va por el pool raíz (`ctx.db`).
 */
export async function verificarEntrenadorOperable(
  ctx: Pick<ContextoAuth, 'db'>,
  entrenadorId: string
): Promise<void> {
  const [entrenador] = await ctx.db
    .select({
      activo: usuarios.activo,
      estadoLicencia: perfilesEntrenador.estadoLicencia,
    })
    .from(perfilesEntrenador)
    .innerJoin(usuarios, eq(usuarios.id, perfilesEntrenador.usuarioId))
    .where(eq(perfilesEntrenador.usuarioId, entrenadorId))
    .limit(1);

  if (!entrenador || !entrenador.activo || entrenador.estadoLicencia !== EstadoLicencia.ACTIVA) {
    throw new UnauthorizedException(
      'Tu entrenador no está disponible en este momento. Inténtalo de nuevo más tarde.'
    );
  }
}

/**
 * Publica un correo de cuenta y devuelve si quedó realmente en camino (espera acotada, ver
 * `publicarCorreoCuenta`). Un fallo del bus o de la cola NUNCA cambia el resultado del flujo de
 * negocio: solo se registra.
 */
export function publicarCorreoCuentaCaso(
  ctx: Pick<ContextoAuth, 'eventEmitter' | 'logger'>,
  nombreEvento: string,
  evento: EventoCorreoCuenta
): Promise<boolean> {
  return publicarCorreoCuenta(ctx.eventEmitter, nombreEvento, evento, ctx.logger);
}

/**
 * ¿La cuenta tiene acceso a la plataforma? Misma regla que login/refresh/canje:
 * habilitada y no bloqueada; coach con licencia activa; alumno no archivado y con entrenador
 * operable (cascada RF-010 §6). Lanza el 401 claro correspondiente; devuelve el nombre del
 * alumno o del entrenador (si lo hay) para personalizar el correo.
 */
export async function verificarCuentaConAcceso(
  ctx: Pick<ContextoAuth, 'db' | 'withTenant'>,
  usuario: {
    id: string;
    rol: string;
    activo: boolean;
    estado: string;
  }
): Promise<{ nombre: string | null }> {
  if (!usuario.activo || usuario.estado === EstadoUsuario.BLOQUEADO) {
    throw new UnauthorizedException(MENSAJE_CUENTA_DESACTIVADA);
  }
  if (usuario.rol === Rol.ENTRENADOR) {
    const { nombres } = await verificarLicenciaEntrenadorActiva(ctx, usuario.id);
    return { nombre: nombres };
  }
  if (usuario.rol === Rol.ALUMNO) {
    // RNF-003/ADR-011 (etapa 3): lectura self del perfil con RLS (`current_usuario_id`).
    const [perfil] = await ctx.withTenant({ usuarioId: usuario.id }, (tx) =>
      tx.select().from(perfilesAlumno).where(eq(perfilesAlumno.usuarioId, usuario.id))
    );
    if (perfil?.deletedAtUtc) {
      throw new UnauthorizedException(MENSAJE_CUENTA_ARCHIVADA);
    }
    if (perfil?.entrenadorId) {
      await verificarEntrenadorOperable(ctx, perfil.entrenadorId);
    }
    return { nombre: perfil?.nombres ?? null };
  }
  return { nombre: null };
}

/**
 * Usuario de la sesión de "Mi perfil". Las reglas completas de acceso (alumno archivado, coach
 * sin licencia, cascada del entrenador) ya las aplicaron el login y cada refresh antes de emitir
 * este token; aquí solo se corta una cuenta que se deshabilitó o bloqueó después.
 */
export async function usuarioConSesion(
  ctx: Pick<ContextoAuth, 'db'>,
  usuarioId: string
) {
  const [usuario] = await ctx.db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!usuario || !usuario.activo || usuario.estado === EstadoUsuario.BLOQUEADO) {
    throw new UnauthorizedException(MENSAJE_SESION_VENCIDA);
  }
  return usuario;
}

export async function exigirPasswordActual(
  ctx: Pick<ContextoAuth, 'cryptoService'>,
  passwordHash: string | null,
  passwordActual: string
) {
  const coincide =
    !!passwordHash && (await ctx.cryptoService.comparePassword(passwordActual, passwordHash));
  if (!coincide) {
    throw new BadRequestException(MENSAJE_PASSWORD_ACTUAL_INCORRECTA);
  }
}

/** 409 si el correo ya es el de acceso de OTRA cuenta. */
export async function exigirCorreoLibre(
  ctx: Pick<ContextoAuth, 'db'>,
  correo: string,
  usuarioId: string
) {
  const [ocupado] = await ctx.db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.email, correo), ne(usuarios.id, usuarioId)));
  if (ocupado) {
    throw new ConflictException(MENSAJE_CORREO_EN_USO);
  }
}

/**
 * Datos para la sesión y los correos del usuario: `entrenadorId` del token y nombre para el
 * saludo. Lectura del perfil propio (RLS self del alumno, RNF-003).
 */
export async function datosSesionDe(
  ctx: Pick<ContextoAuth, 'db' | 'withTenant'>,
  usuario: {
    id: string;
    rol: string;
  }
): Promise<{ entrenadorId: string | undefined; nombre: string | null }> {
  if (usuario.rol === Rol.ALUMNO) {
    const [perfil] = await ctx.withTenant({ usuarioId: usuario.id }, (tx) =>
      tx.select().from(perfilesAlumno).where(eq(perfilesAlumno.usuarioId, usuario.id))
    );
    return { entrenadorId: perfil?.entrenadorId ?? undefined, nombre: perfil?.nombres ?? null };
  }
  if (usuario.rol === Rol.ENTRENADOR) {
    const [perfil] = await ctx.db
      .select({ nombres: perfilesEntrenador.nombres })
      .from(perfilesEntrenador)
      .where(eq(perfilesEntrenador.usuarioId, usuario.id));
    return { entrenadorId: usuario.id, nombre: perfil?.nombres ?? null };
  }
  return { entrenadorId: undefined, nombre: null };
}
