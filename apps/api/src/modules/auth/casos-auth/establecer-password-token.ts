import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { and, eq, gt, perfilesAlumno, usuarios } from '@guachafit/database';
import {
  EstablecerPasswordConTokenDTO,
  EstadoUsuario,
  Modalidad,
  Rol,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
  type JwtPayload,
} from '@guachafit/shared';
import {
  MENSAJE_CUENTA_ARCHIVADA,
  MENSAJE_CUENTA_DESACTIVADA,
} from '../../../common/mensajes-acceso';
import {
  generateTokens,
  verificarEntrenadorOperable,
  verificarLicenciaEntrenadorActiva,
} from './acceso-comun';
import type { ContextoAuth } from './contexto-auth';

/**
 * Establece contraseña definitiva a partir de token SHA-256 de invitación (RF-011, ARCH-003 §2.1).
 *
 * WU-E: un token vigente NO habilita por sí solo la activación. Se rechazan cuentas inactivas o
 * bloqueadas (RF-012 "bloqueado total") y alumnos con baja lógica, sin consumir el token.
 * Movido sin cambios (P3).
 */
export async function establecerPasswordConToken(
  ctx: ContextoAuth,
  dto: EstablecerPasswordConTokenDTO
) {
  const tokenHash = ctx.cryptoService.hashSha256(dto.token);
  const now = new Date();

  const [usuario] = await ctx.db
    .select()
    .from(usuarios)
    .where(
      and(
        eq(usuarios.tokenInvitacionHash, tokenHash),
        gt(usuarios.tokenInvitacionExpira, now)
      )
    );

  if (!usuario) {
    throw new NotFoundException(
      'El enlace de invitación no es válido o venció (dura 48 horas). Pide uno nuevo a tu entrenador.'
    );
  }

  if (!usuario.activo || usuario.estado === EstadoUsuario.BLOQUEADO) {
    throw new UnauthorizedException(MENSAJE_CUENTA_DESACTIVADA);
  }

  // La resolución del perfil ocurre ANTES de escribir: un alumno archivado no activa su cuenta.
  let entrenadorId: string | undefined;
  let modalidad: Modalidad | null = null;
  // ADR-019: la zona del perfil viaja con la sesión (como en `/auth/me`) para que la web cuente
  // la ventana del reporte nutricional con la misma zona que el servidor desde el primer render.
  let zonaHoraria: string | null = null;
  if (usuario.rol === Rol.ENTRENADOR) {
    // RF-010 §6: una licencia suspendida tampoco puede canjear la invitación (el canje emite
    // tokens; sería una tercera vía de sesión sin el ciclo de verificación).
    await verificarLicenciaEntrenadorActiva(ctx, usuario.id);
  } else if (usuario.rol === Rol.ALUMNO) {
    // RNF-003/ADR-011 (etapa 3): canje de invitación — lectura self del perfil con RLS.
    const [perfil] = await ctx.withTenant({ usuarioId: usuario.id }, (tx) =>
      tx.select().from(perfilesAlumno).where(eq(perfilesAlumno.usuarioId, usuario.id))
    );

    // RF-012 RN-02: la baja lógica revoca el acceso; el mensaje es el mismo que en el login.
    if (perfil?.deletedAtUtc) {
      throw new UnauthorizedException(MENSAJE_CUENTA_ARCHIVADA);
    }

    entrenadorId = perfil?.entrenadorId;
    modalidad = perfil?.modalidad ?? null;
    zonaHoraria = perfil ? perfil.zonaHoraria ?? ZONA_HORARIA_ALUMNO_POR_DEFECTO : null;

    // RF-010 §6 (CASCADA-COACH): el canje emite sesión, así que también exige un entrenador
    // operable; el token no se consume cuando la cascada bloquea.
    if (entrenadorId) {
      await verificarEntrenadorOperable(ctx, entrenadorId);
    }
  }

  const passwordHash = await ctx.cryptoService.hashPassword(dto.password);

  // Actualizar usuario: guardar contraseña y limpiar token (Un solo uso, RNF-003)
  await ctx.db
    .update(usuarios)
    .set({
      passwordHash,
      tokenInvitacionHash: null,
      tokenInvitacionExpira: null,
      ultimoAccesoUtc: now,
    })
    .where(eq(usuarios.id, usuario.id));

  const payload: JwtPayload = {
    sub: usuario.id,
    email: usuario.email,
    rol: usuario.rol as Rol,
    entrenadorId,
  };

  const tokens = generateTokens(ctx, payload);

  return {
    mensaje: 'Contraseña establecida con éxito. Bienvenido a GUACHAFIT.',
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
