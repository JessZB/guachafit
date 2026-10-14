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
import type { ContextoAuth } from './contexto-auth';

/**
 * Creación de cuenta de Entrenador por SuperAdmin (RF-010, Escenario 1).
 * Movido sin cambios (P3).
 */
export async function crearEntrenador(
  ctx: ContextoAuth,
  dto: CrearEntrenadorDTO
): Promise<EntrenadorCreadoDTO> {
  // 1. Validar email único
  const [existenteEmail] = await ctx.db
    .select()
    .from(usuarios)
    .where(eq(usuarios.email, dto.email.toLowerCase().trim()));

  if (existenteEmail) {
    throw new ConflictException('Este correo ya se encuentra registrado.');
  }

  // 2. Validar coachCode único
  const [existenteCode] = await ctx.db
    .select()
    .from(perfilesEntrenador)
    .where(eq(perfilesEntrenador.coachCode, dto.coachCode.toUpperCase().trim()));

  if (existenteCode) {
    throw new ConflictException('Ese código de entrenador ya está en uso.');
  }

  // 3. Generar token de bienvenida o hashear contraseña directa
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

  // 4. Crear usuario
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

  // 5. Crear perfil de entrenador
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

  // RF-010 Escenario 1: sin contraseña directa, la bienvenida con el enlace de activación sale
  // por correo (evento → despachador → cola). Se espera la confirmación del encolado (acotada)
  // solo para no prometer un envío que no ocurrió; el enlace copiable del panel es el respaldo.
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
