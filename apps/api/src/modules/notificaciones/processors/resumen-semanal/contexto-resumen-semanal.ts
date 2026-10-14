import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Database, WithTenantFn } from '@guachafit/database';

/**
 * Dependencias explícitas de los pasos del digest semanal (P2).
 * La fachada lo arma en su constructor; ningún paso es provider de Nest.
 */
export interface ContextoResumenSemanal {
  db: Database;
  withTenant: WithTenantFn;
  eventEmitter: EventEmitter2;
}
