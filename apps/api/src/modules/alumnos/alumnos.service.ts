import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import {
  Database,
  TenantTransaction,
  WithTenantFn,
  withTenant as withTenantBase,
} from '@guachafit/database';
import { CryptoService } from '../../common/services/crypto.service';
import { AuditoriaAccesosDenegadosService } from '../../common/auditoria/auditoria-accesos-denegados.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AltaManualAlumnoDTO,
  AltaManualAlumnoResultadoDTO,
  CoachPublicoDTO,
  RegistroPublicoAlumnoDTO,
  CambioEstadoAlumnoDTO,
  ActualizarPerfilAlumnoDTO,
  ActualizarZonaHorariaAlumnoDTO,
  PerfilAlumnoDetalleDTO,
  FiltroDirectorioAlumnosDTO,
  RestaurarAlumnoDTO,
  DirectorioAlumnosDTO,
  Rol,
} from '@guachafit/shared';
import { calcularEdadDesdeFecha } from './casos-alumnos/edad-reglas';
import type { ContextoCasosAlumnos } from './casos-alumnos/contexto-casos';
import { sanitizarPerfilParaRol as sanitizarPerfilCaso } from './casos-alumnos/sanitizar-perfil';
import { resolverCoachPublico as resolverCoachPublicoCaso } from './casos-alumnos/resolver-coach-publico';
import { listarAlumnos as listarAlumnosCaso } from './casos-alumnos/listar-alumnos';
import { obtenerPorId as obtenerPorIdCaso } from './casos-alumnos/obtener-por-id';
import {
  hidratarPlanActivo as hidratarPlanActivoCaso,
  type PlanActivoInfo,
} from './casos-alumnos/hidratar-plan-activo';
import { crearAlumnoManual as crearAlumnoManualCaso } from './casos-alumnos/crear-alumno-manual';
import { registroPublico as registroPublicoCaso } from './casos-alumnos/registro-publico';
import { cambiarEstado as cambiarEstadoCaso } from './casos-alumnos/cambiar-estado';
import { actualizarAlumno as actualizarAlumnoCaso } from './casos-alumnos/actualizar-alumno';
import { softDelete as softDeleteCaso } from './casos-alumnos/soft-delete';
import { restaurarAlumno as restaurarAlumnoCaso } from './casos-alumnos/restaurar-alumno';
import { actualizarZonaHorariaPropia as actualizarZonaHorariaPropiaCaso } from './casos-alumnos/actualizar-zona-horaria';

@Injectable()
export class AlumnosService {
  private readonly logger = new Logger(AlumnosService.name);

  /**
   * RNF-003/ADR-011 (etapa 2): el directorio hidrata mora/semáforo/plan desde
   * `cuotas_membresia`/`planes_membresia` (RLS habilitado); todo el flujo corre dentro de
   * `withTenant` con el GUC del coach. Se inyecta para que los tests puedan espiarlo.
   */
  private readonly withTenant: WithTenantFn;

  /**
   * P2: contexto explícito de dependencias para los casos de uso en funciones planas,
   * construido una vez aquí. Nunca se registra como provider de Nest.
   */
  private readonly casos: ContextoCasosAlumnos;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly cryptoService: CryptoService,
    // RF-014 / WU-E: el alta por deep link publica un evento de dominio para el coach (RN-07.4).
    // Opcional para no romper los consumidores que instancian el servicio sin bus de eventos.
    @Optional() private readonly eventEmitter?: EventEmitter2,
    @Optional() @Inject(WITH_TENANT) withTenant?: WithTenantFn,
    // RF-010 Escenario 2: los 403 de tenancy del servicio también se auditan.
    @Optional()
    @Inject(AuditoriaAccesosDenegadosService)
    private readonly auditoria?: AuditoriaAccesosDenegadosService
  ) {
    this.withTenant = withTenant ?? ((context, fn) => withTenantBase(context, fn, this.db));
    this.casos = {
      db: this.db,
      cryptoService: this.cryptoService,
      eventEmitter: this.eventEmitter,
      withTenant: this.withTenant,
      auditoria: this.auditoria,
      logger: this.logger,
      // Enlace tardío: `api3-integridad-datos.spec.ts:431` sustituye este privado con `vi.fn`,
      // así que se resuelve en cada llamada para que ese spec siga funcionando (P1).
      hidratarPlanActivo: (tx, entrenadorId, ids) => this.hidratarPlanActivo(tx, entrenadorId, ids),
    };
  }

  /**
   * Cálculo dinámico de edad según fecha de nacimiento (RF-011, RN-02)
   */
  calcularEdad(fechaNacimiento: string): number {
    return calcularEdadDesdeFecha(fechaNacimiento);
  }

  /**
   * Sanitiza el DTO según el rol del actor que consulta (RF-011, Escenario 3 / RNF-003)
   * Los alumnos jamás ven la ficha de salud privada; los coaches la reciben desencriptada.
   */
  sanitizarPerfilParaRol(perfil: any, actorRole: Rol): PerfilAlumnoDetalleDTO {
    return sanitizarPerfilCaso(this.casos, perfil, actorRole);
  }

  /**
   * Alta Manual de Alumno por el Entrenador (RF-011, Vía A)
   *
   * WU-E (RN-05): tras confirmar la transacción se publica el evento de bienvenida (evento →
   * despachador → cola `notificaciones-email` → worker); este servicio nunca envía el correo. El
   * token de un solo uso también se devuelve para que el entrenador comparta el enlace como
   * respaldo. `correoEnviado` (y el mensaje) solo afirman el envío si el correo quedó en camino.
   */
  async crearAlumnoManual(
    entrenadorId: string,
    dto: AltaManualAlumnoDTO
  ): Promise<AltaManualAlumnoResultadoDTO> {
    return crearAlumnoManualCaso(this.casos, entrenadorId, dto);
  }

  /**
   * Resolución Pública del `coach_code` para el Deep Link de captación (RF-011, RN-06/RN-07.1).
   *
   * Solo devuelve identidad comercial del coach cuando el código existe Y el coach está operable
   * (cuenta habilitada y licencia vigente). Un código inexistente, uno deshabilitado y uno con
   * licencia suspendida responden igual (404): nunca se filtra qué códigos existen ni cuál de los
   * dos interruptores falló. No expone datos sensibles (teléfono, capacidad, cartera, etc.).
   */
  async resolverCoachPublico(code: string): Promise<CoachPublicoDTO> {
    return resolverCoachPublicoCaso(this.casos, code);
  }

  /**
   * Registro Público Autónomo vía Deep Link coachCode (RF-011, Vía B)
   *
   * RN-07: valida el código y la operabilidad del coach (cuenta habilitada y licencia vigente),
   * crea la cuenta vinculada al tenant y notifica al coach del nuevo registro.
   */
  async registroPublico(dto: RegistroPublicoAlumnoDTO) {
    return registroPublicoCaso(this.casos, dto);
  }

  /**
   * Cambio de estado de activación del alumno (RF-012)
   */
  async cambiarEstado(entrenadorId: string, alumnoId: string, dto: CambioEstadoAlumnoDTO) {
    return cambiarEstadoCaso(this.casos, entrenadorId, alumnoId, dto);
  }

  /**
   * Edición completa de la ficha e información de alumnos por el entrenador (RF-011, RF-012)
   */
  async actualizarAlumno(
    entrenadorId: string,
    alumnoId: string,
    dto: ActualizarPerfilAlumnoDTO
  ): Promise<PerfilAlumnoDetalleDTO> {
    return actualizarAlumnoCaso(this.casos, entrenadorId, alumnoId, dto);
  }

  /**
   * Borrado Lógico (Soft Delete) de Alumno (RF-012, RN-01, RN-02)
   * Prohibición absoluta de sentencias DELETE físicas
   */
  async softDelete(entrenadorId: string, alumnoId: string) {
    return softDeleteCaso(this.casos, entrenadorId, alumnoId);
  }

  /**
   * Restauración de Alumno Dado de Baja Lógica (RF-012, RN-04)
   */
  async restaurarAlumno(entrenadorId: string, alumnoId: string, _dto?: RestaurarAlumnoDTO) {
    return restaurarAlumnoCaso(this.casos, entrenadorId, alumnoId, _dto);
  }

  /**
   * Listar Directorio de Alumnos del Entrenador (RF-011, RF-012)
   *
   * WU19: respuesta paginada `{ items, total, limit, offset, resumen }`.
   * - `items`: página actual (default 100, techo 100) con la búsqueda y filtros aplicados EN SQL,
   *   con orden estable por `createdAtUtc` + `id` para que el offset no repita ni salte filas.
   * - `total`: COUNT real de filas que cumplen la consulta (sin traer el resto a memoria).
   * - `resumen`: contadores de la cartera COMPLETA (COUNT en el servidor) para los KPIs del
   *   directorio; no dependen de la página, la búsqueda ni los filtros.
   *
   * WU24: la búsqueda server-side acepta `q` (canónico) o `busqueda` (alias legado) y combina
   * ILIKE con escape de `%`, `_` y `\` sobre nombre/apellido/correo/documento.
   *
   * WU25a: `soloArchivados` (pestaña dedicada de archivados) y `semaforoPago` (pestaña "En Mora")
   * se resuelven también en SQL, ANTES del `limit`/`offset`, para que la paginación numerada sea
   * coherente entre páginas. El `resumen` nunca se altera por los filtros.
   *
   * `incluirArchivados: true` devuelve la cartera completa (vigentes + archivados); el default
   * `false` mantiene la semántica histórica de solo alumnos vigentes.
   */
  async listarAlumnos(
    entrenadorId: string,
    filtro?: FiltroDirectorioAlumnosDTO
  ): Promise<DirectorioAlumnosDTO> {
    return listarAlumnosCaso(this.casos, entrenadorId, filtro);
  }

  /**
   * RF-005: hidrata el "plan activo" y el precio acordado de un lote de alumnos.
   *
   * Semántica (el plan sale de datos reales, nunca de un valor inventado):
   * 0. Suscripción del alumno (`perfiles_alumno.plan_suscrito_id`, M5-L1): es el plan asignado y
   *    gana sobre todo lo demás; el precio acordado sale del override de ESE plan (o `null`).
   * 1. Sin suscripción, override vigente del alumno (el más reciente si tuviera varios): define
   *    plan activo, nombre del plan y `precioAcordadoUsd` (puede ser 0.00 en becados).
   * 2. Sin override: el plan de la ÚLTIMA cuota emitida por el coach (la deuda vigente describe
   *    el plan contratado). `precioAcordadoOverride` queda `null` (hereda precio del catálogo).
   * 3. Sin nada de lo anterior: sin plan (los campos quedan `null` y la UI dice "Sin plan asignado").
   *
   * El aislamiento de tenant se garantiza filtrando por los planes y cuotas del propio entrenador;
   * se resuelve con consultas en lote (sin N+1) sobre las tablas `overrides_cliente_plan`,
   * `planes_membresia` y `cuotas_membresia`.
   */
  private async hidratarPlanActivo(
    tx: TenantTransaction,
    entrenadorId: string,
    alumnoUsuarioIds: string[]
  ): Promise<Map<string, PlanActivoInfo>> {
    return hidratarPlanActivoCaso(tx, entrenadorId, alumnoUsuarioIds);
  }

  /**
   * LOTE API-N2 (RF-002): el alumno cambia SU zona horaria. El perfil se identifica por el usuario
   * autenticado (nunca por un id del cuerpo) y la escritura corre con el contexto self, cubierta
   * por la política `rls_perfiles_alumno_self_update`. Solo se escribe esta columna.
   */
  async actualizarZonaHorariaPropia(
    usuarioId: string,
    dto: ActualizarZonaHorariaAlumnoDTO
  ): Promise<{ zonaHoraria: string }> {
    return actualizarZonaHorariaPropiaCaso(this.casos, usuarioId, dto);
  }

  /**
   * Obtener perfil por ID con aislamiento de Tenancy
   */
  async obtenerPorId(alumnoId: string, actorUserId: string, actorRole: Rol, actorEntrenadorId?: string) {
    return obtenerPorIdCaso(this.casos, alumnoId, actorUserId, actorRole, actorEntrenadorId);
  }
}
