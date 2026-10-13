import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Database, TenantRlsContext, WithTenantFn } from '@guachafit/database';
import { Rol } from '@guachafit/shared';

// =============================================================================
// CONTEXTO DE DEPENDENCIAS EXPLÍCITO (P2): las piezas de `casos-entrenamiento`
// son funciones planas sin wiring Nest; la fachada construye este contexto en
// su constructor. Sin registrar providers nuevos.
// =============================================================================

export interface ContextoEntrenamiento {
  db: Database;
  withTenant: WithTenantFn;
  eventEmitter?: EventEmitter2;
  logger?: Logger;
}

export function crearContexto(
  db: Database,
  withTenant: WithTenantFn,
  eventEmitter?: EventEmitter2,
  logger?: Logger
): ContextoEntrenamiento {
  return { db, withTenant, eventEmitter, logger };
}

/**
 * RNF-003/ADR-011 (etapa 3): contexto RLS del perfil del alumno para rutas multi-rol.
 * - ALUMNO -> self-select (`current_usuario_id`).
 * - ENTRENADOR -> tenant del coach.
 * - SUPERADMIN -> bypass explícito.
 * (Movida sin cambios desde `EntrenamientoService.contextoPerfilDeActor`; la fachada
 * conserva su método privado como delegación por compatibilidad.)
 */
export function contextoPerfilDeActor(
  rol: Rol,
  actorUserId: string,
  entrenadorId?: string
): TenantRlsContext {
  if (rol === Rol.ALUMNO) return { usuarioId: actorUserId };
  if (rol === Rol.SUPERADMIN) return { isSuperadmin: true };
  return { entrenadorId: entrenadorId ?? actorUserId };
}

/** LOTE API-2: textos claros de la sesión de entrenamiento (sin estados ni identificadores). */
export const MENSAJE_SESION_NO_ENCONTRADA = 'No encontramos este entrenamiento. Actualiza la pantalla.';
export const MENSAJE_HORA_INVALIDA = 'La hora de tu teléfono no es válida. Revísala.';
