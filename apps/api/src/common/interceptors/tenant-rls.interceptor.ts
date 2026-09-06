import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { sql } from '@guachafit/database';
import { DRIZZLE_DB } from '../../database/database.module';
import { Database } from '@guachafit/database';

@Injectable()
export class TenantRlsInterceptor implements NestInterceptor {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Si el usuario tiene un entrenadorId o es superadmin, se inyecta en la sesión de base de datos
    if (user) {
      const isSuperadmin = user.rol === 'superadmin';
      const entrenadorId = user.entrenadorId || (user.rol === 'entrenador' ? user.sub : null);
      const usuarioId = user.sub;

      request.tenantContext = {
        isSuperadmin,
        entrenadorId,
        usuarioId,
      };

      try {
        if (entrenadorId) {
          await this.db.execute(sql`SET LOCAL app.current_entrenador_id = ${entrenadorId}`);
        }
        if (usuarioId) {
          await this.db.execute(sql`SET LOCAL app.current_usuario_id = ${usuarioId}`);
        }
        if (isSuperadmin) {
          await this.db.execute(sql`SET LOCAL app.is_superadmin = 'true'`);
        }
      } catch {
        // En entornos sin conexión activa inmediata (como mocks en tests), continúa
      }
    }

    return next.handle();
  }
}
