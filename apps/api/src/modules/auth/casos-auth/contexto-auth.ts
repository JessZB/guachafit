import type { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Database, WithTenantFn } from '@guachafit/database';
import type { CryptoService } from '../../../common/services/crypto.service';

/**
 * Contexto explícito de dependencias (P2). Se construye una vez en el constructor de la
 * fachada; los casos de uso son funciones planas, nunca providers de Nest.
 */
export interface ContextoAuth {
  db: Database;
  cryptoService: CryptoService;
  withTenant: WithTenantFn;
  eventEmitter?: EventEmitter2;
  logger: Logger;
  jwtSecret: string;
  refreshSecret: string;
}
