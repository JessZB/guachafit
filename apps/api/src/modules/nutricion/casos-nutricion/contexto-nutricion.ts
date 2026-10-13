import type { Logger } from '@nestjs/common';
import type {
  Database,
  WithTenantFn,
} from '@guachafit/database';
import type { R2StorageService } from '../../antropometria/r2-storage.service';

/**
 * Contexto de dependencias explícito de los casos de uso de nutrición (P2).
 * La fachada `NutricionService` lo construye en su constructor; ningún caso de uso se
 * registra como provider de Nest.
 */
export interface ContextoNutricion {
  db: Database;
  withTenant: WithTenantFn;
  r2StorageService?: R2StorageService;
  logger: Logger;
}
