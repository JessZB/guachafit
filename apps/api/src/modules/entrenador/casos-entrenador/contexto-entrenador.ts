import type { Logger } from '@nestjs/common';
import type { Database, WithTenantFn } from '@guachafit/database';

/**
 * Contexto de dependencias explícito de los casos de uso de entrenador (P2).
 *
 * La fachada `EntrenadorService` lo construye en su constructor a partir de sus
 * propios inyectados; los casos de uso son funciones planas sin wiring de Nest.
 */
export interface ContextoEntrenador {
  db: Database;
  withTenant: WithTenantFn;
  /** D17: bitácora de los cambios de captación (nunca debe imprimir un coach_code). */
  logger: Logger;
}
