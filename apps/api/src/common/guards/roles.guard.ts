import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Logger,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Rol } from '@guachafit/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
// B2: texto que ve el usuario cuando su rol no puede entrar a una ruta.
import { MENSAJE_SIN_PERMISO } from '../mensajes-acceso';
import {
  AuditoriaAccesosDenegadosService,
  contextoPeticionHttp,
} from '../auditoria/auditoria-accesos-denegados.service';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(
    // Token explícito (como los demás guards del proyecto): la inyección no depende de
    // `design:paramtypes`, que los transformadores de test (esbuild) no emiten.
    @Inject(Reflector) private reflector: Reflector,
    // Token explícito + `@Optional()`: el DI no depende de la metadata de tipos (esbuild no la
    // emite en tests) y los tests construyen el guard solo con el reflector; en producción
    // `CommonModule` (global) siempre provee la auditoría.
    @Optional()
    @Inject(AuditoriaAccesosDenegadosService)
    private readonly auditoria?: AuditoriaAccesosDenegadosService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Rol[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { user } = request;
    if (!user || !user.rol) {
      this.auditar(request, user, 'SIN_AUTENTICACION');
      this.logger.warn('Acceso denegado: usuario no autenticado o sin rol asignado.');
      throw new ForbiddenException(MENSAJE_SIN_PERMISO);
    }

    // RF-010 RN-01 (matriz de control de acceso): NO existe jerarquía con bypass. Cada endpoint
    // declara explícitamente los roles autorizados; el superadmin solo entra donde la matriz lo
    // permite (gestión de entrenadores y licencias), nunca al negocio del coach o del alumno.
    const hasRole = requiredRoles.includes(user.rol);
    if (!hasRole) {
      this.auditar(request, user, 'ROL_NO_AUTORIZADO');
      // B2: el detalle técnico (roles requeridos vs. actual) queda solo en los logs.
      this.logger.warn(
        `Acceso denegado: se requiere uno de los roles [${requiredRoles.join(', ')}], rol actual ${user.rol}.`
      );
      throw new ForbiddenException(MENSAJE_SIN_PERMISO);
    }

    return true;
  }

  /**
   * RF-003 Escenario 3: log de auditoría best-effort. Fire-and-forget: el servicio captura sus
   * propios fallos; el `catch` final es la última red para que nada tumbe la respuesta 403 (y el
   * guard sigue siendo síncrono).
   */
  private auditar(request: any, user: any, motivo: string): void {
    if (!this.auditoria) return;
    const { ruta, metodo } = contextoPeticionHttp(request);
    void this.auditoria
      .registrar({
        usuarioId: user?.sub ?? null,
        rol: user?.rol ?? null,
        ruta,
        metodo,
        motivo,
      })
      .catch(() => {});
  }
}
