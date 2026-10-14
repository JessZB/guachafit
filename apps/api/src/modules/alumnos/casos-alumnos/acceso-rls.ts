import { ForbiddenException } from '@nestjs/common';
import { TenantRlsContext } from '@guachafit/database';
import { Rol } from '@guachafit/shared';
import { MENSAJE_SIN_ACCESO_ALUMNO } from '../../../common/mensajes-acceso';
import type { ContextoAlumnos } from './contexto-alumnos';

/**
 * RF-010 Escenario 2: registra el intento de acceso cruzado y devuelve el 403.
 * Solo metadatos mínimos (actor, rol, patrón de ruta, método y motivo): nunca el id ni datos del
 * alumno. Best-effort: un fallo de la auditoría jamás cambia la respuesta 403.
 * Movido sin cambios desde `AlumnosService.accesoDenegado` (P3).
 */
export function lanzarAccesoDenegado(
  ctx: Pick<ContextoAlumnos, 'auditoria'>,
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
 * RNF-003/ADR-011 (etapa 3): contexto RLS para rutas que atienden a más de un rol.
 * - ALUMNO -> self-select (`current_usuario_id`).
 * - ENTRENADOR -> tenant del coach (su `usuarioId` es el `entrenadorId` del tenant).
 * - SUPERADMIN -> bypass explícito `is_superadmin`.
 * Movido sin cambios desde `AlumnosService.contextoRlsDeActor` (P3).
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
