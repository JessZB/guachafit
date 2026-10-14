import { UnauthorizedException } from '@nestjs/common';
import { eq, perfilesAlumno, usuarios } from '@guachafit/database';
import {
  AuthUserDTO,
  EstadoUsuario,
  Modalidad,
  PeriodicidadAntropometria,
  Rol,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
} from '@guachafit/shared';
import {
  MENSAJE_CUENTA_ARCHIVADA,
  MENSAJE_SESION_VENCIDA,
} from '../../../common/mensajes-acceso';
import {
  verificarEntrenadorOperable,
  verificarLicenciaEntrenadorActiva,
} from './acceso-comun';
import type { ContextoAuth } from './contexto-auth';

/**
 * RF-003 RN-03/RN-04 (WU RF-003a/b): sesión fresca del usuario autenticado para `GET /auth/me`.
 *
 * A diferencia de leer el claim del JWT (15 min de vida), aquí se resuelve la modalidad y el
 * calendario antropométrico del perfil en el momento: un coach que cambia la modalidad o la
 * periodicidad del alumno se refleja de inmediato y el formulario de la web pasa a solo lectura
 * (o avisa de su ventana) sin esperar la rotación del token.
 * Movido sin cambios (P3).
 */
export async function obtenerSesion(
  ctx: Pick<ContextoAuth, 'db' | 'withTenant'>,
  usuarioId: string
): Promise<AuthUserDTO> {
  const [usuario] = await ctx.db
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1);

  if (!usuario || !usuario.activo || usuario.estado === EstadoUsuario.BLOQUEADO) {
    throw new UnauthorizedException(MENSAJE_SESION_VENCIDA);
  }

  let entrenadorId: string | undefined;
  let modalidad: Modalidad | null = null;
  let periodicidadAntropometria: PeriodicidadAntropometria | null = null;
  let antropometriaInicio: string | null = null;
  // LOTE API-N2: zona del perfil del alumno (ventana y plazo del reporte nutricional).
  let zonaHoraria: string | null = null;

  if (usuario.rol === Rol.ENTRENADOR) {
    entrenadorId = usuario.id;
    // RF-010 §6: `/auth/me` es el ciclo de verificación de la web. Una licencia suspendida (o
    // una cuenta deshabilitada, ya rechazada arriba) cierra la sesión sin esperar al TTL del
    // access token.
    await verificarLicenciaEntrenadorActiva(ctx, usuario.id);
  } else if (usuario.rol === Rol.ALUMNO) {
    // RNF-003/ADR-011 (etapa 3): lectura self del perfil con RLS (`current_usuario_id`).
    const [perfil] = await ctx.withTenant({ usuarioId: usuario.id }, (tx) =>
      tx
        .select({
          entrenadorId: perfilesAlumno.entrenadorId,
          modalidad: perfilesAlumno.modalidad,
          periodicidadAntropometria: perfilesAlumno.periodicidadAntropometria,
          antropometriaInicio: perfilesAlumno.antropometriaInicio,
          zonaHoraria: perfilesAlumno.zonaHoraria,
          deletedAtUtc: perfilesAlumno.deletedAtUtc,
        })
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.usuarioId, usuario.id))
        .limit(1)
    );

    if (perfil?.deletedAtUtc) {
      throw new UnauthorizedException(MENSAJE_CUENTA_ARCHIVADA);
    }

    zonaHoraria = perfil ? perfil.zonaHoraria ?? ZONA_HORARIA_ALUMNO_POR_DEFECTO : null;
    entrenadorId = perfil?.entrenadorId;
    modalidad = perfil?.modalidad ?? null;
    // RF-003 RN-01 (WU RF-003b): el calendario viaja con la sesión para que la web del alumno
    // pueda avisar de su ventana de check-in sin necesitar el UUID de `perfiles_alumno`.
    periodicidadAntropometria = perfil?.periodicidadAntropometria ?? null;
    antropometriaInicio = perfil?.antropometriaInicio ?? null;

    // RF-010 §6 (CASCADA-COACH): `/auth/me` del alumno también refleja la cascada; si su
    // entrenador queda inoperable, la web cierra la sesión sin esperar al TTL del access token.
    if (entrenadorId) {
      await verificarEntrenadorOperable(ctx, entrenadorId);
    }
  }

  return {
    id: usuario.id,
    email: usuario.email,
    rol: usuario.rol as Rol,
    entrenadorId,
    modalidad,
    periodicidadAntropometria,
    antropometriaInicio,
    zonaHoraria,
  };
}
