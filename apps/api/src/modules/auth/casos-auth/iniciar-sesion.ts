import { UnauthorizedException } from '@nestjs/common';
import { eq, perfilesAlumno, usuarios } from '@guachafit/database';
import {
  EstadoUsuario,
  Modalidad,
  Rol,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
  type JwtPayload,
  type LoginUsuarioDTO,
} from '@guachafit/shared';
import {
  MENSAJE_CREDENCIALES_INCORRECTAS,
  MENSAJE_CUENTA_ARCHIVADA,
  MENSAJE_CUENTA_DESACTIVADA,
} from '../../../common/mensajes-acceso';
import {
  generateTokens,
  verificarEntrenadorOperable,
  verificarLicenciaEntrenadorActiva,
} from './acceso-comun';
import type { ContextoCasosAuth } from './contexto-casos';

/**
 * A6: bcrypt hash of a text that is never a real password. Compared against
 * when the user does not exist or has no password yet, so response time does
 * not reveal which emails are registered. MUST keep the same cost as
 * `CryptoService.hashPassword` (`RONDAS_BCRYPT`, today 10 => `$2b$10$`
 * prefix); when rounds change, regenerate with
 * `bcrypt.hashSync(<random text>, RONDAS_BCRYPT)` (watched by
 * api1-seguridad-auth.spec.ts).
 */
const HASH_FICTICIO_SIN_USUARIO = '$2b$10$NE1sOETTV3S5BxjlNsXI6O6ENy1JcQJTkBlST32ZI6dQF5C04OVye';

/** User sign-in (SuperAdmin, Entrenador or Alumno). Moved verbatim (P3). */
export async function iniciarSesion(ctx: ContextoCasosAuth, dto: LoginUsuarioDTO) {
  const [usuario] = await ctx.db
    .select()
    .from(usuarios)
    .where(eq(usuarios.email, dto.email.toLowerCase().trim()));

  // A6: the password is ALWAYS verified BEFORE revealing the account state.
  // Without a user (or without a password yet) compare against a dummy hash
  // to avoid timing-based enumeration.
  const hashAComparar = usuario?.passwordHash || HASH_FICTICIO_SIN_USUARIO;
  const isMatch = await ctx.cryptoService.comparePassword(dto.password, hashAComparar);
  if (!usuario || !usuario.passwordHash || !isMatch) {
    throw new UnauthorizedException(MENSAJE_CREDENCIALES_INCORRECTAS);
  }

  if (usuario.estado === EstadoUsuario.BLOQUEADO || !usuario.activo) {
    throw new UnauthorizedException(MENSAJE_CUENTA_DESACTIVADA);
  }

  // Owning entrenador_id for the Tenancy claim.
  let entrenadorId: string | undefined;
  // RF-003 RN-03/RN-04 (WU RF-003a): the alumno modality travels in the
  // session so the web blocks the anthropometric form without an extra request.
  let modalidad: Modalidad | null = null;
  // ADR-019: the profile zone travels with the session (as in `/auth/me`) so
  // the web counts the nutrition-report window with the server zone from first render.
  let zonaHoraria: string | null = null;

  if (usuario.rol === Rol.ENTRENADOR) {
    entrenadorId = usuario.id;
    // RF-010 section 6: a suspended license blocks coach sign-in (same clear
    // 401 as a disabled account, without revealing whether the account exists).
    await verificarLicenciaEntrenadorActiva(ctx, usuario.id);
  } else if (usuario.rol === Rol.ALUMNO) {
    // RNF-003/ADR-011 (stage 3): self profile read with RLS (`current_usuario_id`).
    const [perfil] = await ctx.withTenant({ usuarioId: usuario.id }, (tx) =>
      tx.select().from(perfilesAlumno).where(eq(perfilesAlumno.usuarioId, usuario.id))
    );

    // RF-012 RN-02: soft delete revokes access of the linked account.
    if (perfil?.deletedAtUtc) {
      throw new UnauthorizedException(MENSAJE_CUENTA_ARCHIVADA);
    }

    entrenadorId = perfil?.entrenadorId;
    modalidad = perfil?.modalidad ?? null;
    zonaHoraria = perfil ? perfil.zonaHoraria ?? ZONA_HORARIA_ALUMNO_POR_DEFECTO : null;

    // RF-010 section 6 (CASCADA-COACH): the alumno session requires an
    // operable coach. Legacy rows without a coach skip the check.
    if (entrenadorId) {
      await verificarEntrenadorOperable(ctx, entrenadorId);
    }
  }

  const payload: JwtPayload = {
    sub: usuario.id,
    email: usuario.email,
    rol: usuario.rol as Rol,
    entrenadorId,
  };

  const tokens = generateTokens(ctx, payload);

  // Update last access UTC (ADR-002).
  await ctx.db
    .update(usuarios)
    .set({ ultimoAccesoUtc: new Date() })
    .where(eq(usuarios.id, usuario.id));

  return {
    mensaje: 'Inicio de sesión exitoso.',
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    usuario: {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol as Rol,
      entrenadorId,
      modalidad,
      zonaHoraria,
    },
  };
}
