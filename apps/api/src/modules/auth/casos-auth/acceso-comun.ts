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
import type { ContextoCasosAuth } from './contexto-casos';

/**
 * Shared session/access helpers. Moved verbatim from the private methods of
 * `AuthService` (P3): same queries, same order, same errors and messages.
 */

/** Generates the 15-minute access JWT and the 7-day refresh JWT. */
export function generateTokens(
  ctx: Pick<ContextoCasosAuth, 'jwtSecret' | 'refreshSecret'>,
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
 * RF-010 section 6 (WU Admin): a coach account only operates with an `ACTIVA`
 * license. Revocation is real (no blacklists): state is checked against the DB
 * on every session cycle.
 */
export async function verificarLicenciaEntrenadorActiva(
  ctx: Pick<ContextoCasosAuth, 'db'>,
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
 * RF-010 section 6 (CASCADA-COACH): the alumno only operates when their coach
 * is operable — enabled account (`usuarios.activo`) AND current license.
 * Single message that does not reveal which switch failed. Both tables have no
 * RLS: the read goes through the root pool (`ctx.db`).
 */
export async function verificarEntrenadorOperable(
  ctx: Pick<ContextoCasosAuth, 'db'>,
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
 * Publishes an account email and reports whether it is really on its way
 * (bounded wait, see `publicarCorreoCuenta`). A bus or queue failure NEVER
 * changes the business-flow outcome: it is only logged.
 */
export function publicarCorreoCuentaCaso(
  ctx: Pick<ContextoCasosAuth, 'eventEmitter' | 'logger'>,
  nombreEvento: string,
  evento: EventoCorreoCuenta
): Promise<boolean> {
  return publicarCorreoCuenta(ctx.eventEmitter, nombreEvento, evento, ctx.logger);
}

/**
 * Does the account have platform access? Same rule as login/refresh/redeem:
 * enabled and not blocked; coach with active license; alumno not archived and
 * with an operable coach (RF-010 section 6 cascade). Throws the matching 401;
 * returns the alumno or coach name (when known) to personalize the email.
 */
export async function verificarCuentaConAcceso(
  ctx: Pick<ContextoCasosAuth, 'db' | 'withTenant'>,
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
    // RNF-003/ADR-011 (stage 3): self profile read with RLS (`current_usuario_id`).
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
 * "Mi perfil" session user. The full access rules (archived alumno, coach
 * without license, coach cascade) were already enforced by login and each
 * refresh before issuing this token; here only an account disabled or blocked
 * afterwards is cut off.
 */
export async function usuarioConSesion(
  ctx: Pick<ContextoCasosAuth, 'db'>,
  usuarioId: string
) {
  const [usuario] = await ctx.db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
  if (!usuario || !usuario.activo || usuario.estado === EstadoUsuario.BLOQUEADO) {
    throw new UnauthorizedException(MENSAJE_SESION_VENCIDA);
  }
  return usuario;
}

export async function exigirPasswordActual(
  ctx: Pick<ContextoCasosAuth, 'cryptoService'>,
  passwordHash: string | null,
  passwordActual: string
) {
  const coincide =
    !!passwordHash && (await ctx.cryptoService.comparePassword(passwordActual, passwordHash));
  if (!coincide) {
    throw new BadRequestException(MENSAJE_PASSWORD_ACTUAL_INCORRECTA);
  }
}

/** 409 when the email is already the access email of ANOTHER account. */
export async function exigirCorreoLibre(
  ctx: Pick<ContextoCasosAuth, 'db'>,
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
 * Session and email data for the user: token `entrenadorId` and greeting name.
 * Self profile read (alumno RLS self, RNF-003).
 */
export async function datosSesionDe(
  ctx: Pick<ContextoCasosAuth, 'db' | 'withTenant'>,
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
