import { ConflictException } from '@nestjs/common';
import { eq, perfilesAlumno, usuarios } from '@guachafit/database';
import {
  EstadoAlumno,
  EstadoUsuario,
  OrigenRegistro,
  RegistroPublicoAlumnoDTO,
  Rol,
} from '@guachafit/shared';
import { AlumnoRegistradoEvent } from '../../notificaciones/events/eventos-notificacion';
import {
  buscarCoachPublico,
  coachAdmiteCaptacion,
  enlaceNoDisponible,
  leerCupoOcupado,
} from './captacion-publica';
import type { ContextoAlumnos } from './contexto-alumnos';

/**
 * WU-E (RF-011 RN-07.4): publica el evento de dominio "Nuevo alumno registrado" hacia el coach.
 * La categoría `ALUMNOS` ("Nuevos Registros" en RF-015 §B) se persiste siempre en la bandeja
 * In-App (RF-014 RN-04); los canales externos quedan deshabilitados hasta que RF-015 defina
 * sus columnas de preferencia (no se reutilizan las de otra categoría).
 * Movido sin cambios desde `AlumnosService.notificarCoachNuevoAlumno` (P3).
 */
function notificarCoachNuevoAlumno(
  ctx: Pick<ContextoAlumnos, 'eventEmitter' | 'logger'>,
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
 *
 * D17: el ciclo de vida del enlace gobierna el acceso. Orden de comprobaciones: código → cuenta y
 * licencia → captación activa → cupo → correo no repetido. Las cuatro primeras negativas responden
 * el MISMO 404 uniforme (no se revela el motivo). El conteo del cupo y el INSERT ocurren dentro de
 * la misma transacción con la fila del entrenador bloqueada (`FOR UPDATE`), así que dos registros
 * simultáneos no superan la capacidad. El hash de la contraseña se calcula antes de la transacción
 * para no retener ese bloqueo. El alumno queda con `origen_registro = 'enlace'`.
 */
export async function registroPublico(
  ctx: ContextoAlumnos,
  dto: RegistroPublicoAlumnoDTO
) {
  const codigo = dto.coachCode.trim().toUpperCase();

  // Filtro barato y sin bloqueo: descarta códigos inexistentes, rotados o inoperables antes de
  // abrir la transacción del tenant (el `usuarioId` del coach define el contexto RLS).
  const coachPrevio = await buscarCoachPublico(ctx.db, codigo);

  if (!coachPrevio || !coachAdmiteCaptacion(coachPrevio)) {
    throw enlaceNoDisponible();
  }

  // El hash (costoso) se calcula antes de abrir la transacción: así no alarga el bloqueo de la fila
  // del entrenador ni retiene una conexión del pool, y un código inválido nunca gasta CPU en él.
  const passwordHash = await ctx.cryptoService.hashPassword(dto.password);

  const { coach, nuevoUsuario, nuevoPerfil } = await ctx.withTenant(
    { entrenadorId: coachPrevio.usuarioId },
    async (tx) => {
      // Se vuelve a leer con la fila bloqueada: una pausa, rotación o suspensión ocurrida desde el
      // filtro previo corta el registro, y los registros concurrentes del mismo coach se serializan.
      const coach = await buscarCoachPublico(tx, codigo, { bloquear: true });

      if (
        !coach ||
        coach.usuarioId !== coachPrevio.usuarioId ||
        !coachAdmiteCaptacion(coach)
      ) {
        throw enlaceNoDisponible();
      }

      const cupoOcupado = await leerCupoOcupado(tx, coach.usuarioId);
      if (cupoOcupado >= coach.capacidadMaxima) {
        throw enlaceNoDisponible();
      }

      const [existente] = await tx
        .select()
        .from(usuarios)
        .where(eq(usuarios.email, dto.email.toLowerCase().trim()));

      if (existente) {
        throw new ConflictException(
          'Este correo ya se encuentra registrado. Si eres tú, inicia sesión o recupera tu contraseña.'
        );
      }

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
          origenRegistro: OrigenRegistro.ENLACE,
        })
        .returning();

      return { coach, nuevoUsuario, nuevoPerfil };
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
