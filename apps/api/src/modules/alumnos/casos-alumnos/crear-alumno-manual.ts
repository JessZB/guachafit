import { ConflictException } from '@nestjs/common';
import { eq, perfilesAlumno, usuarios } from '@guachafit/database';
import {
  AltaManualAlumnoDTO,
  AltaManualAlumnoResultadoDTO,
  EstadoAlumno,
  EstadoUsuario,
  Rol,
} from '@guachafit/shared';
import {
  BienvenidaAlumnoEvent,
  publicarCorreoCuenta,
} from '../../notificaciones/events/eventos-correo-cuenta';
import type { ContextoCasosAlumnos } from './contexto-casos';
import { calcularEdadDesdeFecha } from './edad-reglas';

/**
 * Alta Manual de Alumno por el Entrenador (RF-011, Vía A)
 *
 * WU-E (RN-05): tras confirmar la transacción se publica el evento de bienvenida (evento →
 * despachador → cola `notificaciones-email` → worker); este servicio nunca envía el correo. El
 * token de un solo uso también se devuelve para que el entrenador comparta el enlace como
 * respaldo. `correoEnviado` (y el mensaje) solo afirman el envío si el correo quedó en camino.
 * Movido sin cambios desde `AlumnosService.crearAlumnoManual` (P3).
 */
export async function crearAlumnoManual(
  ctx: ContextoCasosAlumnos,
  entrenadorId: string,
  dto: AltaManualAlumnoDTO
): Promise<AltaManualAlumnoResultadoDTO> {
  const [existente] = await ctx.db
    .select()
    .from(usuarios)
    .where(eq(usuarios.email, dto.email.toLowerCase().trim()));

  if (existente) {
    throw new ConflictException(
      'Este correo ya se encuentra registrado. Si eres tú, inicia sesión o recupera tu contraseña.'
    );
  }

  const fichaCifrada = dto.fichaSaludPrivada
    ? ctx.cryptoService.encryptHealthRecord(dto.fichaSaludPrivada)
    : null;

  const { rawToken, tokenHash, expiresAt } = ctx.cryptoService.generateInvitationToken();

  const { nuevoUsuario, nuevoPerfil } = await ctx.withTenant({ entrenadorId }, async (tx) => {
    const [nuevoUsuario] = await tx
      .insert(usuarios)
      .values({
        email: dto.email.toLowerCase().trim(),
        rol: Rol.ALUMNO,
        estado: EstadoUsuario.ACTIVO,
        tokenInvitacionHash: tokenHash,
        tokenInvitacionExpira: expiresAt,
        activo: true,
      })
      .returning();

    const [nuevoPerfil] = await tx
      .insert(perfilesAlumno)
      .values({
        usuarioId: nuevoUsuario.id,
        entrenadorId: entrenadorId,
        tipoDocumento: dto.tipoDocumento,
        numeroDocumento: dto.numeroDocumento.trim(),
        nombres: dto.nombres.trim(),
        apellidos: dto.apellidos.trim(),
        fechaNacimiento: dto.fechaNacimiento,
        telefonoWhatsapp: dto.telefonoWhatsapp.trim(),
        fichaSaludPrivada: fichaCifrada,
        modalidad: dto.modalidad,
        tasaFijadaOverride: dto.tasaFijadaOverride || null,
        estadoActivacion: EstadoAlumno.ACTIVO,
      })
      .returning();

    return { nuevoUsuario, nuevoPerfil };
  });

  const correoEnviado = await publicarCorreoCuenta(
    ctx.eventEmitter,
    BienvenidaAlumnoEvent.NOMBRE,
    new BienvenidaAlumnoEvent({
      tipo: 'BIENVENIDA_ALUMNO',
      usuarioId: nuevoUsuario.id,
      email: nuevoUsuario.email,
      nombre: nuevoPerfil.nombres ?? null,
      token: rawToken,
    }),
    ctx.logger
  );

  return {
    id: nuevoPerfil.id,
    nombres: nuevoPerfil.nombres,
    apellidos: nuevoPerfil.apellidos,
    email: nuevoUsuario.email,
    edadCalculada: calcularEdadDesdeFecha(nuevoPerfil.fechaNacimiento),
    modalidad: nuevoPerfil.modalidad,
    estadoActivacion: nuevoPerfil.estadoActivacion,
    tokenInvitacion: rawToken,
    correoEnviado,
    mensaje: correoEnviado
      ? 'Alumno registrado con éxito. Le enviamos un correo con el enlace para crear su contraseña. Si no le llega, compártele el enlace de activación.'
      : 'Alumno registrado con éxito. Comparte el enlace de activación con tu alumno para que cree su contraseña.',
  };
}
