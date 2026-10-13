import type { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Database, WithTenantFn } from '@guachafit/database';
import type { CryptoService } from '../../../common/services/crypto.service';

/**
 * Explicit dependency context (P2). Built once in the facade constructor;
 * use cases are plain functions, never Nest providers.
 */
export interface ContextoCasosAuth {
  db: Database;
  cryptoService: CryptoService;
  withTenant: WithTenantFn;
  eventEmitter?: EventEmitter2;
  logger: Logger;
  jwtSecret: string;
  refreshSecret: string;
}
