import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import { withTenant as withTenantBase } from '@guachafit/database';
import type { Database, WithTenantFn } from '@guachafit/database';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Rol } from '@guachafit/shared';
import { LIMITE_COLA_ANTROPOMETRIA_POR_DEFECTO } from '@guachafit/shared';
import type {
  CheckinAntropometricoDTO,
  ColaPendientesAntropometricosDTO,
  ConciliarAntropometriaDTO,
  ConsultaComparadorFotograficoDTO,
  ControlAntropometricoDetalleDTO,
  EvolucionCorporalDTO,
  FiltroEvolucionAntropometricaDTO,
  PresignedUploadUrlDTO,
  PresignedUploadUrlResponseDTO,
} from '@guachafit/shared';
import type { R2StorageService } from './r2-storage.service';
import type { ContextoAntropometria } from './casos-antropometria/contexto-antropometria';
import {
  TIPO_EVENTO_CHECKIN_RECIBIDO,
  LINK_COLA_ANTROPOMETRIA_COACH,
} from './casos-antropometria/antropometria-constantes';
import type { ComparativaAngularResultadoDTO } from './casos-antropometria/obtener-comparativa';
import { solicitarPresignedUploadUrl as solicitarPresignedUploadUrlCaso } from './casos-antropometria/solicitar-presigned';
import { registrarCheckin as registrarCheckinCaso } from './casos-antropometria/registrar-checkin';
import { conciliarControl as conciliarControlCaso } from './casos-antropometria/conciliar-control';
import { obtenerEvolucion as obtenerEvolucionCaso } from './casos-antropometria/obtener-evolucion';
import { obtenerComparativaFotografica as obtenerComparativaFotograficaCaso } from './casos-antropometria/obtener-comparativa';
import { listarPendientes as listarPendientesCaso } from './casos-antropometria/listar-pendientes';
import { obtenerControlPorId as obtenerControlPorIdCaso } from './casos-antropometria/obtener-control';

export { TIPO_EVENTO_CHECKIN_RECIBIDO, LINK_COLA_ANTROPOMETRIA_COACH };
export type { ComparativaAngularResultadoDTO };

/**
 * Fachada de antropometría (P1/P2): conserva el archivo, el nombre de la clase, los decoradores,
 * el constructor idéntico y cada método público. Cada método delega ahora en un caso de uso
 * de `casos-antropometria/` con el contexto de dependencias construido una vez en el
 * constructor. Sin cambio de comportamiento (P3).
 */
@Injectable()
export class AntropometriaService {
  private readonly logger = new Logger(AntropometriaService.name);

  /**
   * RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; toda lectura del perfil corre dentro
   * de `withTenant` con el contexto del actor (self del alumno o tenant del coach).
   */
  private readonly withTenant: WithTenantFn;

  /** Explicit dependency context shared by all use cases (P2, no new providers). */
  private readonly ctx: ContextoAntropometria;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    public readonly r2StorageService: R2StorageService,
    private readonly eventEmitter: EventEmitter2,
    @Optional() @Inject(WITH_TENANT) withTenant?: WithTenantFn
  ) {
    this.withTenant = withTenant ?? ((context, fn) => withTenantBase(context, fn, this.db));
    this.ctx = {
      db: this.db,
      withTenant: this.withTenant,
      r2StorageService: this.r2StorageService,
      eventEmitter: this.eventEmitter,
      logger: this.logger,
    };
  }

  /**
   * Genera URL presignada PUT directa a Cloudflare R2 con TTL de 15 minutos (RNF-001, ADR-007).
   * Aplica validación RBAC híbrida: los alumnos presenciales no pueden subir fotos corporales de antropometría.
   */
  async solicitarPresignedUploadUrl(
    caller: { id: string; rol: Rol; entrenadorId?: string },
    dto: PresignedUploadUrlDTO,
    customUuid?: string
  ): Promise<PresignedUploadUrlResponseDTO> {
    return solicitarPresignedUploadUrlCaso(this.ctx, caller, dto, customUuid);
  }

  /**
   * Registra una evaluación antropométrica aplicando RBAC híbrido (ADR-001, RF-003):
   * - Presencial (por Coach): origen presencial_verificado, estado aprobado, fechaAprobacionUtc inmediata.
   * - Remoto (por Alumno): origen remoto_autoreporte, estado pendiente_aprobacion, fechaAprobacionUtc nula.
   * - Presencial (por Alumno): 403 Forbidden (solo lectura).
   * - Remoto (por Alumno) FUERA de la ventana de RN-04/§6: 400 con el detalle de la ventana real.
   *
   * WU RF-003a: la ventana se evalúa SOLO para el autoreporte del alumno y SOLO cuando el coach ya
   * configuró periodicidad + ancla (sin calendario no hay ventana y se conserva el comportamiento
   * previo). La zona horaria es la del usuario (`usuarios.timezone`).
   */
  async registrarCheckin(
    caller: { id: string; rol: Rol; entrenadorId?: string },
    dto: CheckinAntropometricoDTO,
    customId?: string
  ): Promise<ControlAntropometricoDetalleDTO> {
    return registrarCheckinCaso(this.ctx, caller, dto, customId);
  }

  /**
   * Conciliación de check-in remoto por el entrenador (aprobación o rechazo con motivo obligatorio).
   */
  async conciliarControl(
    coachId: string,
    controlId: string,
    dto: ConciliarAntropometriaDTO
  ): Promise<ControlAntropometricoDetalleDTO> {
    return conciliarControlCaso(this.ctx, coachId, controlId, dto);
  }

  /**
   * Consulta el historial de evolución corporal multieje (RF-004).
   * Invariante ADR-001: Filtra estrictamente las evaluaciones en estado Aprobado.
   * Genera URLs firmadas GET con TTL de 15 min para cada foto.
   *
   * WU24b: `controlesTotal` es el COUNT real SIEMPRE presente y `totalEvaluaciones` conserva
   * ese mismo total (antes era `evaluaciones.length`; sin paginar el valor es idéntico).
   * `controlesLimit`/`controlesOffset` son OPT-IN: sin ellos la serie viene COMPLETA (contrato
   * de los charts del alumno) y con ellos el slice se resuelve con LIMIT/OFFSET en SQL.
   * Orden: `fechaEvaluacion` ascendente (cronológico actual) con desempate estable por
   * `createdAtUtc` e `id` para que `controlesOffset` no repita ni salte filas.
   */
  async obtenerEvolucion(
    alumnoId: string,
    filtro?: FiltroEvolucionAntropometricaDTO,
    caller?: { id: string; rol: Rol; entrenadorId?: string }
  ): Promise<EvolucionCorporalDTO> {
    return obtenerEvolucionCaso(this.ctx, alumnoId, filtro, caller);
  }

  /**
   * Comparador fotográfico angular (Semana A vs Semana B) (RF-004).
   * Valida estado Aprobado en ambas fechas y genera presigned GET URLs con TTL 900s.
   * Maneja perspectivas faltantes sin lanzar error 500.
   */
  async obtenerComparativaFotografica(
    alumnoId: string,
    dto: ConsultaComparadorFotograficoDTO,
    caller?: { id: string; rol: Rol; entrenadorId?: string }
  ): Promise<ComparativaAngularResultadoDTO> {
    return obtenerComparativaFotograficaCaso(this.ctx, alumnoId, dto, caller);
  }

  /**
   * Lista controles pendientes de validación para la bandeja del entrenador.
   *
   * WU24b: envelope `{ items, total, limit, offset }` con COUNT real en SQL. El orden actual
   * (`fechaEvaluacion` descendente) se conserva con desempate estable por `createdAtUtc`/`id`
   * para que `offset` avance sin repetir ni saltar filas.
   */
  async listarPendientes(
    coachId: string,
    limit = LIMITE_COLA_ANTROPOMETRIA_POR_DEFECTO,
    offset = 0
  ): Promise<ColaPendientesAntropometricosDTO> {
    return listarPendientesCaso(this.ctx, coachId, limit, offset);
  }

  /**
   * Obtiene un control antropométrico por su ID.
   */
  async obtenerControlPorId(
    controlId: string,
    caller?: { id: string; rol: Rol; entrenadorId?: string }
  ): Promise<ControlAntropometricoDetalleDTO> {
    return obtenerControlPorIdCaso(this.ctx, controlId, caller);
  }
}
