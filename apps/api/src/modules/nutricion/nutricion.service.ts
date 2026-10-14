import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import type {
  CheckinNutricionalDetalleDTO,
  CheckinNutricionalDTO,
  FiltroCheckinsNutricionalesDTO,
  MetasNutricionalesDetalleDTO,
  MetasNutricionalesDTO,
  Rol,
} from '@guachafit/shared';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import {
  Database,
  WithTenantFn,
  withTenant as withTenantBase,
} from '@guachafit/database';
import { R2StorageService } from '../antropometria/r2-storage.service';

// =============================================================================
// METAS Y TOLERANCIA NUTRICIONAL (RF-002, RN-01, RN-04): lógica pura en
// `casos-nutricion/tolerancia-nutricional-reglas.ts`. Se re-exporta para conservar el
// contrato de importación de los specs (P1: ningún spec se edita).
// =============================================================================
export {
  evaluarToleranciaNutricional,
  redondearPorcentaje,
  type MetasNutricionalesCoach,
} from './casos-nutricion/tolerancia-nutricional-reglas';

/**
 * LOTE API-N1: unicidad diaria en `casos-nutricion/unicidad-checkin-reglas.ts`.
 * Re-export para el contrato de los specs (P1).
 */
export {
  INDICE_UNICO_CHECKIN_DIARIO,
  conflictoCheckinYaRegistrado,
  esViolacionUnicidadCheckinDiario,
} from './casos-nutricion/unicidad-checkin-reglas';

import type { ContextoNutricion } from './casos-nutricion/contexto-nutricion';
import {
  obtenerMetasDeAlumno as obtenerMetasDeAlumnoCaso,
  obtenerMetasNutricionales as obtenerMetasNutricionalesCaso,
} from './casos-nutricion/obtener-metas-nutricionales';
import { obtenerCheckinHoy as obtenerCheckinHoyCaso } from './casos-nutricion/obtener-checkin-hoy';
import { obtenerCheckinPorId as obtenerCheckinPorIdCaso } from './casos-nutricion/obtener-checkin-por-id';
import { listarCheckins as listarCheckinsCaso } from './casos-nutricion/listar-checkins';
import { registrarCheckinDiario as registrarCheckinDiarioCaso } from './casos-nutricion/registrar-checkin-diario';
import { definirMetasNutricionales as definirMetasNutricionalesCaso } from './casos-nutricion/definir-metas-nutricionales';

// =============================================================================
// SERVICIO DE NUTRICIÓN (RF-002)
// =============================================================================

@Injectable()
export class NutricionService {
  private readonly logger = new Logger(NutricionService.name);

  // Bóveda R2 opcional (RF-002 RN-03): sirve las URLs firmadas de lectura de las fotos de platos.
  // Sin servicio inyectado (p. ej. tests unitarios que construyen el service con solo la DB) las
  // fotos quedan sin `fotoUrl` — nunca se fabrica un enlace.
  /**
   * RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; la tenancy y la hidratación del
   * nombre leen el perfil dentro de `withTenant` con el contexto del actor.
   */
  private readonly withTenant: WithTenantFn;

  /** Contexto de dependencias explícito de los casos de uso (P2). */
  private readonly ctx: ContextoNutricion;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Optional() @Inject(R2StorageService) private readonly r2StorageService?: R2StorageService,
    @Optional() @Inject(WITH_TENANT) withTenant?: WithTenantFn
  ) {
    this.withTenant = withTenant ?? ((context, fn) => withTenantBase(context, fn, this.db));
    this.ctx = {
      db: this.db,
      withTenant: this.withTenant,
      r2StorageService: this.r2StorageService,
      logger: this.logger,
    };
  }

  /**
   * Registrar check-in nutricional diario 1-Tap.
   * Valida semáforo, notas (hasta 280 caracteres), agua, calorías, proteínas
   * y hasta 4 fotografías de platos principales.
   * Aplica unicidad diaria por (alumno_id, fecha) y la ventana horaria RN-02
   * (18:00–23:59 hora local del alumno; fuera de ventana el día ya cerró).
   * La tolerancia ±10% se evalúa contra las metas REALES del coach persistidas
   * (RN-01): si el alumno no tiene metas, el resultado queda "sin evaluar".
   *
   * @param ahora instante de evaluación inyectable (tests); por defecto el reloj real.
   */
  async registrarCheckinDiario(
    alumnoId: string,
    input: CheckinNutricionalDTO,
    ahora: Date = new Date()
  ): Promise<{
    checkin: CheckinNutricionalDetalleDTO;
    dentroMargenTolerancia?: boolean;
    desviacionCaloriasPct?: number;
    desviacionProteinasPct?: number;
  }> {
    return registrarCheckinDiarioCaso(this.ctx, alumnoId, input, ahora);
  }

  // ---------------------------------------------------------------------------
  // METAS DEL COACH (RF-002 RN-01)
  // ---------------------------------------------------------------------------

  /**
   * Consultar las metas nutricionales de un alumno (o `null` si el coach no las configuró).
   * Usada por el alumno (las suyas) y por el coach (las de su alumno, tras validar tenancy).
   */
  async obtenerMetasNutricionales(alumnoId: string): Promise<MetasNutricionalesDetalleDTO | null> {
    return obtenerMetasNutricionalesCaso(this.ctx, alumnoId);
  }

  /**
   * Consultar las metas de un alumno de la cartera del coach (RN-01).
   * Valida tenancy ANTES de responder, incluso si el alumno no tiene metas.
   */
  async obtenerMetasDeAlumno(
    coachId: string,
    alumnoId: string
  ): Promise<MetasNutricionalesDetalleDTO | null> {
    return obtenerMetasDeAlumnoCaso(this.ctx, coachId, alumnoId);
  }

  /**
   * Definir (crear o reemplazar) las metas nutricionales de un alumno del coach (RN-01).
   *
   * Semántica PUT: la fila se reemplaza completa; un campo omitido queda en NULL ("no
   * configurado"), nunca en 0 fabricado. Valida tenancy contra `perfiles_alumno`.
   *
   * PUT-replace de recursos (RNF-001): si el reemplazo deja de referenciar un PDF subido, el
   * objeto se elimina de la bóveda DESPUÉS del write y fuera de su transacción, best-effort:
   * un fallo del almacenamiento (o de la relectura de verificación) se registra pero no cambia
   * la respuesta (sigue 200).
   * `recursos` omitido o `[]` ⇒ se borran TODOS los PDFs previos.
   */
  async definirMetasNutricionales(
    coachId: string,
    alumnoId: string,
    dto: MetasNutricionalesDTO
  ): Promise<MetasNutricionalesDetalleDTO> {
    return definirMetasNutricionalesCaso(this.ctx, coachId, alumnoId, dto);
  }

  /**
   * Consultar el reporte nutricional del día en curso (o fecha indicada) para el alumno.
   * Sin `fecha`, el día se resuelve en la zona del PERFIL del alumno (LOTE API-N2), no en UTC.
   */
  async obtenerCheckinHoy(
    alumnoId: string,
    fecha?: string
  ): Promise<CheckinNutricionalDetalleDTO | null> {
    return obtenerCheckinHoyCaso(this.ctx, alumnoId, fecha);
  }

  /**
   * Obtener detalle de check-in nutricional por su ID.
   */
  async obtenerCheckinPorId(checkinId: string): Promise<CheckinNutricionalDetalleDTO> {
    return obtenerCheckinPorIdCaso(this.ctx, checkinId);
  }

  /**
   * Listar historial de check-ins nutricionales para alumno o entrenador.
   * Valida aislamiento de tenancy si consulta el entrenador.
   */
  async listarCheckins(
    entrenadorId: string,
    alumnoId: string,
    filtro?: FiltroCheckinsNutricionalesDTO,
    callerRol?: Rol,
    callerId?: string
  ): Promise<CheckinNutricionalDetalleDTO[]> {
    return listarCheckinsCaso(this.ctx, entrenadorId, alumnoId, filtro, callerRol, callerId);
  }
}
