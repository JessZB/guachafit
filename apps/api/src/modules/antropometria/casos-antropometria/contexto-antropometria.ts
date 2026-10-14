import type { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Database, WithTenantFn } from '@guachafit/database';
import type { Rol } from '@guachafit/shared';
import type { R2StorageService } from '../r2-storage.service';

/** Actor de la petición, tal como lo reciben los métodos de la fachada. */
export interface CallerAntropometria {
  id: string;
  rol: Rol;
  entrenadorId?: string;
}

/**
 * Contexto explícito de dependencias (P2): la fachada lo construye una vez en su
 * constructor y cada caso de uso lo recibe como primer argumento.
 * No se registra ningún provider nuevo de Nest.
 */
export interface ContextoAntropometria {
  db: Database;
  withTenant: WithTenantFn;
  r2StorageService: R2StorageService;
  eventEmitter: EventEmitter2;
  logger: Logger;
}
