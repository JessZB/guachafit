import { ForbiddenException } from '@nestjs/common';
import { TenantRlsContext } from '@guachafit/database';
import { Rol } from '@guachafit/shared';
import { MENSAJE_SIN_ACCESO_ALUMNO } from '../../../common/mensajes-acceso';
import type { ContextoCasosAlumnos } from './contexto-casos';

/**
 * RF-010 scenario 2: audits the cross-access attempt and returns the 403.
 * Moved verbatim from `AlumnosService.accesoDenegado` (P3).
 */
export function lanzarAccesoDenegado(
  ctx: Pick<ContextoCasosAlumnos, 'auditoria'>,
  actor: { usuarioId: string; rol: Rol },
  peticion: { ruta: string; metodo: string },
  motivo: 'ALUMNO_DE_OTRO_ENTRENADOR' | 'PERFIL_DE_OTRO_ALUMNO'
): ForbiddenException {
  if (ctx.auditoria) {
    void ctx.auditoria
      .registrar({ usuarioId: actor.usuarioId, rol: actor.rol, ...peticion, motivo })
      .catch(() => {});
  }
  return new ForbiddenException(MENSAJE_SIN_ACCESO_ALUMNO);
}

/**
 * RNF-003/ADR-011 (stage 3): RLS context for routes serving more than one role.
 * Moved verbatim from `AlumnosService.contextoRlsDeActor` (P3).
 */
export function contextoRlsDeActor(
  actorUserId: string,
  actorRole: Rol,
  actorEntrenadorId?: string
): TenantRlsContext {
  if (actorRole === Rol.ALUMNO) return { usuarioId: actorUserId };
  if (actorRole === Rol.SUPERADMIN) return { isSuperadmin: true };
  return { entrenadorId: actorEntrenadorId ?? actorUserId };
}
