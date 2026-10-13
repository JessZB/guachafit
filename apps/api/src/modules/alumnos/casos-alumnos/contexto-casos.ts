import type { Database, WithTenantFn } from '@guachafit/database';
import type { CryptoService } from '../../../common/services/crypto.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Logger } from '@nestjs/common';
import type { AuditoriaAccesosDenegadosService } from '../../../common/auditoria/auditoria-accesos-denegados.service';
import type { PlanActivoInfo } from './hidratar-plan-activo';
import type { TenantTransaction } from '@guachafit/database';

/**
 * Explicit dependency context (P2). Built once in the facade constructor;
 * use cases are plain functions, never Nest providers.
 */
export interface ContextoCasosAlumnos {
  db: Database;
  cryptoService: CryptoService;
  eventEmitter?: EventEmitter2;
  withTenant: WithTenantFn;
  auditoria?: AuditoriaAccesosDenegadosService;
  logger: Logger;
  /**
   * Late-bound plan hydration. The facade passes an arrow that resolves
   * `this.hidratarPlanActivo` at call time so specs stubbing the private
   * method keep working (P1 contract). Falls back to the extracted function
   * when absent.
   */
  hidratarPlanActivo?: (
    tx: TenantTransaction,
    entrenadorId: string,
    alumnoUsuarioIds: string[]
  ) => Promise<Map<string, PlanActivoInfo>>;
}
