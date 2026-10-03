import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import {
  Database,
  WithTenantFn,
  withTenant as withTenantBase,
  eq,
  perfilesAlumno,
} from '@guachafit/database';
import { EstadoAlumno, Rol } from '@guachafit/shared';
import { ESTADOS_BLOQUEADOS_ALUMNO_KEY } from '../decorators/bloqueo-alumno.decorator';
import { MENSAJE_CUENTA_ARCHIVADA } from '../mensajes-acceso';
import {
  AuditoriaAccesosDenegadosService,
  contextoPeticionHttp,
} from '../auditoria/auditoria-accesos-denegados.service';

/**
 * Estado reportado en el cuerpo 403: el estado de activación real o `archivado` cuando la baja
 * lógica ya está sellada (`deleted_at_utc`), que tiene prioridad sobre cualquier estado.
 */
export type EstadoBloqueoAlumno = EstadoAlumno | 'archivado';

/** Motivo máquina del bloqueo para que la UI distinga la pantalla sin parsear el mensaje. */
export type MotivoBloqueoAlumno = 'ESTADO_ACTIVACION' | 'CUENTA_ARCHIVADA';

/**
 * RF-012 §4.A: mensaje humano por estado. Nunca expone datos del perfil ni del entrenador.
 */
const MENSAJE_POR_ESTADO: Record<EstadoBloqueoAlumno, string> = {
  [EstadoAlumno.SUSPENDIDO_PAGO]:
    'Tu acceso a la planificación se encuentra pausado por mensualidad pendiente. Reporta tu pago para reactivarlo.',
  [EstadoAlumno.INACTIVO_PAUSADO]:
    'Tu plan está pausado. Puedes consultar tu historial, pero no iniciar nuevas sesiones ni enviar reportes hasta que tu entrenador lo reactive.',
  [EstadoAlumno.ACTIVO]:
    'Tu cuenta no se encuentra habilitada para esta acción en este momento.',
  archivado: MENSAJE_CUENTA_ARCHIVADA,
};

/**
 * Guard de acceso operativo del alumno según su ciclo de vida (RF-012 "modular el acceso según
 * situación").
 *
 * Reglas (RF-012 §4.A):
 * - `Activo`: acceso total; el guard no interviene.
 * - `Inactivo / Pausado` y `Suspendido por Pago`: bloquean planificación (rutinas/sesiones/
 *   checklist); el estado declarado con `@BloquearAlumnoEn(...)` decide qué endpoints operativos
 *   caen. Pausado además bloquea el envío de reportes (nutrición/antropometría).
 * - Baja lógica (`deleted_at_utc`): sin acceso operativo, siempre.
 *
 * El bloqueo viaja como `403` con `code: 'ALUMNO_BLOQUEADO'`, `estado` y `motivo` para que la app
 * del alumno muestre su pantalla informativa (la cuenta y Payos conservan su acceso: los
 * endpoints financieros no llevan este guard).
 *
 * Sólo evalúa al rol Alumno; el coach y el SuperAdmin siguen operando con sus propias reglas.
 */
@Injectable()
export class AlumnoHabilitadoGuard implements CanActivate {
  /**
   * RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; el perfil se lee con el contexto self
   * (`current_usuario_id`) del alumno autenticado. Se inyecta para que los tests puedan espiarlo.
   */
  private readonly withTenant: WithTenantFn;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    // Token explícito: el DI no depende de la metadata de tipos (que esbuild no emite en tests).
    @Inject(Reflector) private readonly reflector: Reflector,
    // RF-003 Escenario 3: auditoría best-effort (opcional para las construcciones directas de los
    // tests; en producción `CommonModule` global la provee).
    @Optional()
    @Inject(AuditoriaAccesosDenegadosService)
    private readonly auditoria?: AuditoriaAccesosDenegadosService,
    @Optional() @Inject(WITH_TENANT) withTenant?: WithTenantFn
  ) {
    this.withTenant = withTenant ?? ((context, fn) => withTenantBase(context, fn, this.db));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    // El guard protege exclusivamente el acceso del alumno a sus endpoints operativos.
    if (!user || user.rol !== Rol.ALUMNO) {
      return true;
    }

    const estadosBloqueados =
      this.reflector.getAllAndOverride<EstadoAlumno[]>(ESTADOS_BLOQUEADOS_ALUMNO_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    // RNF-003/ADR-011 (etapa 3): lectura self del perfil con RLS (`current_usuario_id`).
    const [perfil] = await this.withTenant({ usuarioId: user.sub }, (tx) =>
      tx
        .select({
          estadoActivacion: perfilesAlumno.estadoActivacion,
          deletedAtUtc: perfilesAlumno.deletedAtUtc,
        })
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.usuarioId, user.sub))
        .limit(1)
    );

    // Un alumno sin perfil no tiene ciclo de vida que evaluar; los servicios aplican su tenancy.
    if (!perfil) {
      return true;
    }

    if (perfil.deletedAtUtc) {
      this.auditar(request, user, 'CUENTA_ARCHIVADA');
      throw this.construirBloqueo('archivado', 'CUENTA_ARCHIVADA');
    }

    if (estadosBloqueados.includes(perfil.estadoActivacion)) {
      this.auditar(request, user, 'ESTADO_ACTIVACION');
      throw this.construirBloqueo(perfil.estadoActivacion, 'ESTADO_ACTIVACION');
    }

    return true;
  }

  /**
   * RF-003 Escenario 3: log de auditoría best-effort. Fire-and-forget: el servicio captura sus
   * propios fallos; el `catch` final es la última red para que nada tumbe la respuesta 403.
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

  private construirBloqueo(
    estado: EstadoBloqueoAlumno,
    motivo: MotivoBloqueoAlumno
  ): ForbiddenException {
    const mensaje = MENSAJE_POR_ESTADO[estado];
    return new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: 'ALUMNO_BLOQUEADO',
      estado,
      motivo,
      title: 'Acceso bloqueado',
      detail: mensaje,
      message: mensaje,
    });
  }
}
