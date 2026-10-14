import type { Database, WithTenantFn } from '@guachafit/database';
import type { CryptoService } from '../../../common/services/crypto.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Logger } from '@nestjs/common';
import type { AuditoriaAccesosDenegadosService } from '../../../common/auditoria/auditoria-accesos-denegados.service';
import type { PlanActivoInfo } from './hidratar-plan-activo';
import type { TenantTransaction } from '@guachafit/database';

/**
 * Contexto explícito de dependencias (P2). Se construye una vez en el constructor de la
 * fachada; los casos de uso son funciones planas, nunca providers de Nest.
 */
export interface ContextoAlumnos {
  db: Database;
  cryptoService: CryptoService;
  eventEmitter?: EventEmitter2;
  withTenant: WithTenantFn;
  auditoria?: AuditoriaAccesosDenegadosService;
  logger: Logger;
  /**
   * Hidratación de plan con enlace tardío. La fachada pasa una flecha que resuelve
   * `this.hidratarPlanActivo` en cada llamada para que los specs que sustituyen el
   * privado sigan funcionando (contrato P1; ver `api3-integridad-datos.spec.ts:431`).
   * Si falta, se usa la función extraída.
   */
  hidratarPlanActivo?: (
    tx: TenantTransaction,
    entrenadorId: string,
    alumnoUsuarioIds: string[]
  ) => Promise<Map<string, PlanActivoInfo>>;
}
