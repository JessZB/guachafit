import { ConflictException } from '@nestjs/common';
import { eq, perfilesEntrenador, usuarios } from '@guachafit/database';
import {
  CrearEntrenadorDTO,
  EntrenadorCreadoDTO,
  EstadoLicencia,
  EstadoUsuario,
  Rol,
} from '@guachafit/shared';
import { BienvenidaEntrenadorEvent } from '../../notificaciones/events/eventos-correo-cuenta';
import { publicarCorreoCuentaCaso } from './acceso-comun';
import type { ContextoCasosAuth } from './contexto-casos';

/** Coach account creation by SuperAdmin (RF-010, Scenario 1). Moved verbatim (P3). */
export async function crearEntrenador(
  ctx: ContextoCasosAuth,
  dto: CrearEntrenadorDTO
): Promise<EntrenadorCreadoDTO> {
  // 1. Unique email.
  const [existenteEmail] = await ctx.db
    .select()
    .from(usuarios)
    .where(eq(usuarios.email, dto.email.toLowerCase().trim()));

  if (existenteEmail) {
    throw new ConflictException('Este correo ya se encuentra registrado.');
  }

  // 2. Unique coachCode.
  const [existenteCode] = await ctx.db
    .select()
    .from(perfilesEntrenador)
    .where(eq(perfilesEntrenador.coachCode, dto.coachCode.toUpperCase().trim()));

  if (existenteCode) {
    throw new ConflictException('Ese código de entrenador ya está en uso.');
  }

  // 3. Welcome token or direct-password hash.
  let passwordHash: string | null = null;
  let tokenHash: string | null = null;
  let tokenExpira: Date | null = null;
  let rawToken: string | null = null;

  if (dto.password) {
    passwordHash = await ctx.cryptoService.hashPassword(dto.password);
  } else {
    const tokenData = ctx.cryptoService.generateInvitationToken();
    tokenHash = tokenData.tokenHash;
    tokenExpira = tokenData.expiresAt;
    rawToken = tokenData.rawToken;
  }

  // 4. Create user.
  const [nuevoUsuario] = await ctx.db
    .insert(usuarios)
    .values({
      email: dto.email.toLowerCase().trim(),
      passwordHash,
      rol: Rol.ENTRENADOR,
      estado: EstadoUsuario.ACTIVO,
      tokenInvitacionHash: tokenHash,
      tokenInvitacionExpira: tokenExpira,
      activo: true,
    })
    .returning();

  // 5. Create coach profile.
  const [nuevoCoach] = await ctx.db
    .insert(perfilesEntrenador)
    .values({
      usuarioId: nuevoUsuario.id,
      nombres: dto.nombres.trim(),
      apellidos: dto.apellidos.trim(),
      nombreComercial: dto.nombreComercial?.trim() || null,
      coachCode: dto.coachCode.toUpperCase().trim(),
      capacidadMaxima: dto.capacidadMaxima,
      tasaCambioGlobal: dto.tasaCambioGlobal,
      telefonoContacto: dto.telefonoContacto.trim(),
      estadoLicencia: EstadoLicencia.ACTIVA,
    })
    .returning();

  // RF-010 Scenario 1: without a direct password, the welcome with the
  // activation link goes out by email (event → dispatcher → queue). Queueing
  // confirmation is awaited (bounded) only to avoid promising a send that did
  // not happen; the panel copyable link is the fallback.
  const correoEnviado = rawToken
    ? await publicarCorreoCuentaCaso(
        ctx,
        BienvenidaEntrenadorEvent.NOMBRE,
        new BienvenidaEntrenadorEvent({
          tipo: 'BIENVENIDA_ENTRENADOR',
          usuarioId: nuevoUsuario.id,
          email: nuevoUsuario.email,
          nombre: nuevoCoach.nombres ?? null,
          token: rawToken,
        })
      )
    : false;

  return {
    id: nuevoCoach.id,
    usuarioId: nuevoUsuario.id,
    nombres: nuevoCoach.nombres,
    apellidos: nuevoCoach.apellidos,
    email: nuevoUsuario.email,
    coachCode: nuevoCoach.coachCode,
    tokenInvitacion: rawToken,
    correoEnviado,
    mensaje: !rawToken
      ? 'Entrenador registrado exitosamente.'
      : correoEnviado
        ? 'Entrenador registrado exitosamente. Le enviamos un correo con el enlace para crear su contraseña. Si no le llega, compártele el enlace de activación.'
        : 'Entrenador registrado exitosamente. Comparte el enlace de activación con el entrenador para que cree su contraseña.',
  };
}
