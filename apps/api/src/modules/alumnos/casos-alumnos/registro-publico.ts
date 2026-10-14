import { ConflictException, NotFoundException } from '@nestjs/common';
import { eq, perfilesAlumno, perfilesEntrenador, usuarios } from '@guachafit/database';
import {
  EstadoAlumno,
  EstadoLicencia,
  EstadoUsuario,
  RegistroPublicoAlumnoDTO,
  Rol,
} from '@guachafit/shared';
import { AlumnoRegistradoEvent } from '../../notificaciones/events/eventos-notificacion';
import type { ContextoCasosAlumnos } from './contexto-casos';

/**
 * WU-E (RF-011 RN-07.4): publica el evento de dominio "Nuevo alumno registrado" hacia el coach.
 * La categoría `ALUMNOS` ("Nuevos Registros" en RF-015 §B) se persiste siempre en la bandeja
 * In-App (RF-014 RN-04); los canales externos quedan deshabilitados hasta que RF-015 defina
 * sus columnas de preferencia (no se reutilizan las de otra categoría).
 * Movido sin cambios desde `AlumnosService.notificarCoachNuevoAlumno` (P3).
 */
function notificarCoachNuevoAlumno(
  ctx: Pick<ContextoCasosAlumnos, 'eventEmitter' | 'logger'>,
  coach: { usuarioId: string; coachCode: string; nombres: string; apellidos: string; nombreComercial: string | null },
  alumno: {
    alumnoId: string;
    usuarioId: string;
    email: string;
    nombres: string;
    apellidos: string;
  }
): void {
  if (!ctx.eventEmitter) return;

  const nombreCompleto = `${alumno.nombres} ${alumno.apellidos}`.trim();

  void ctx.eventEmitter
    .emitAsync(
      AlumnoRegistradoEvent.NOMBRE,
      new AlumnoRegistradoEvent({
        tipoEvento: 'ALUMNO_REGISTRADO',
        destinatarioUserId: coach.usuarioId,
        entrenadorId: coach.usuarioId,
        categoria: 'ALUMNOS',
        titulo: 'Nuevo alumno registrado',
        cuerpo: `${nombreCompleto} se registró con tu enlace de invitación.`,
        linkAccion: `/coach/alumnos/${alumno.alumnoId}`,
        datosAdicionales: {
          alumnoId: alumno.alumnoId,
          usuarioId: alumno.usuarioId,
          email: alumno.email,
          coachCode: coach.coachCode,
        },
        esCriticoSeguridad: false,
        referenciaId: alumno.alumnoId,
      })
    )
    .catch((error) => {
      ctx.logger.warn(
        `No se pudo notificar al coach ${coach.usuarioId} el registro del alumno ${alumno.alumnoId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
}

/**
 * Registro Público Autónomo vía Deep Link coachCode (RF-011, Vía B)
 *
 * RN-07: valida el código y la operabilidad del coach (cuenta habilitada y licencia vigente),
 * crea la cuenta vinculada al tenant y notifica al coach del nuevo registro.
 * Movido sin cambios desde `AlumnosService.registroPublico` (P3).
 */
export async function registroPublico(
  ctx: ContextoCasosAlumnos,
  dto: RegistroPublicoAlumnoDTO
) {
  const [coach] = await ctx.db
    .select({
      usuarioId: perfilesEntrenador.usuarioId,
      coachCode: perfilesEntrenador.coachCode,
      nombres: perfilesEntrenador.nombres,
      apellidos: perfilesEntrenador.apellidos,
      nombreComercial: perfilesEntrenador.nombreComercial,
      estadoLicencia: perfilesEntrenador.estadoLicencia,
      activo: usuarios.activo,
    })
    .from(perfilesEntrenador)
    .innerJoin(usuarios, eq(usuarios.id, perfilesEntrenador.usuarioId))
    .where(eq(perfilesEntrenador.coachCode, dto.coachCode.trim().toUpperCase()));

  if (!coach) {
    throw new NotFoundException(
      'El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach.'
    );
  }

  if (coach.estadoLicencia !== EstadoLicencia.ACTIVA || !coach.activo) {
    throw new NotFoundException(
      'El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach.'
    );
  }

  const [existente] = await ctx.db
    .select()
    .from(usuarios)
    .where(eq(usuarios.email, dto.email.toLowerCase().trim()));

  if (existente) {
    throw new ConflictException(
      'Este correo ya se encuentra registrado. Si eres tú, inicia sesión o recupera tu contraseña.'
    );
  }

  const passwordHash = await ctx.cryptoService.hashPassword(dto.password);

  const { nuevoUsuario, nuevoPerfil } = await ctx.withTenant(
    { entrenadorId: coach.usuarioId },
    async (tx) => {
      const [nuevoUsuario] = await tx
        .insert(usuarios)
        .values({
          email: dto.email.toLowerCase().trim(),
          passwordHash,
          rol: Rol.ALUMNO,
          estado: EstadoUsuario.ACTIVO,
          activo: true,
        })
        .returning();

      const [nuevoPerfil] = await tx
        .insert(perfilesAlumno)
        .values({
          usuarioId: nuevoUsuario.id,
          entrenadorId: coach.usuarioId,
          tipoDocumento: dto.tipoDocumento,
          numeroDocumento: dto.numeroDocumento.trim(),
          nombres: dto.nombres.trim(),
          apellidos: dto.apellidos.trim(),
          fechaNacimiento: dto.fechaNacimiento,
          telefonoWhatsapp: dto.telefonoWhatsapp.trim(),
          modalidad: dto.modalidad,
          estadoActivacion: EstadoAlumno.ACTIVO,
        })
        .returning();

      return { nuevoUsuario, nuevoPerfil };
    }
  );

  notificarCoachNuevoAlumno(ctx, coach, {
    alumnoId: nuevoPerfil.id,
    usuarioId: nuevoUsuario.id,
    email: nuevoUsuario.email,
    nombres: nuevoPerfil.nombres,
    apellidos: nuevoPerfil.apellidos,
  });

  return {
    id: nuevoPerfil.id,
    nombres: nuevoPerfil.nombres,
    email: nuevoUsuario.email,
    coachAsignado: coach.nombreComercial || `${coach.nombres} ${coach.apellidos}`,
    mensaje: 'Registro completado con éxito.',
  };
}
