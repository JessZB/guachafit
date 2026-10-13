import type { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  Database,
  WithTenantFn,
} from '@guachafit/database';
import type { FinanzasService } from '../finanzas.service';

/**
 * Contexto de dependencias explícito de los casos de uso de cartera (P2).
 *
 * La fachada `CarteraService` lo construye en su constructor a partir de sus
 * propios inyectados; los casos de uso son funciones planas sin wiring de Nest.
 */
export interface ContextoCartera {
  db: Database;
  withTenant: WithTenantFn;
  finanzasService: FinanzasService;
  eventEmitter?: EventEmitter2;
  logger: Logger;
}

/** Contexto de tasa por fila: override del alumno > tasa activa del coach. */
export interface ContextoTasa {
  tasaBase: string | null;
}
