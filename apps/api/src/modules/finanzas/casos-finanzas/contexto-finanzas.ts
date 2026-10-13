import type { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Database, WithTenantFn } from '@guachafit/database';
import type { RegistroIdempotencia } from '../../../common/idempotencia/registro-idempotencia';
import type { R2StorageService } from '../../antropometria/r2-storage.service';
import type { BillingSchedulerService } from '../billing-scheduler.service';

/**
 * Contexto de dependencias explícito de los casos de uso de finanzas (P2): la
 * fachada lo construye en su constructor y cada caso lo recibe como parámetro.
 * Sin wiring nuevo de Nest: los casos son funciones planas.
 */
export interface ContextoFinanzas {
  db: Database;
  withTenant: WithTenantFn;
  eventEmitter?: EventEmitter2;
  r2StorageService?: R2StorageService;
  billingSchedulerService?: BillingSchedulerService;
  idempotencia: RegistroIdempotencia;
  logger: Logger;
}
