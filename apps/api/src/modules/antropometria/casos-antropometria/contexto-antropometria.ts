import type { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Database, WithTenantFn } from '@guachafit/database';
import type { Rol } from '@guachafit/shared';
import type { R2StorageService } from '../r2-storage.service';

/** Actor of the request, as received by the facade methods. */
export interface CallerAntropometria {
  id: string;
  rol: Rol;
  entrenadorId?: string;
}

/**
 * Explicit dependency context (P2): the facade builds it once in its
 * constructor and every use case receives it as its first argument.
 * No new Nest providers are registered.
 */
export interface ContextoAntropometria {
  db: Database;
  withTenant: WithTenantFn;
  r2StorageService: R2StorageService;
  eventEmitter: EventEmitter2;
  logger: Logger;
}
