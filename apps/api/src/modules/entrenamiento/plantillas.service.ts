import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import { Database, WithTenantFn } from '@guachafit/database';
import {
  CrearPlantillaRutinaDTO,
  ActualizarPlantillaRutinaDTO,
  AsignarPlantillaDTO,
  AsignarPlantillaSchema,
  PlantillaRutinaDTO,
  PlantillaRutinaResumenDTO,
  AsignacionPlantillaResponseDTO,
} from '@guachafit/shared';
import { parsearContrato } from '../../common/errores/parsear-contrato';
import { RegistroIdempotencia } from '../../common/idempotencia/registro-idempotencia';
import type { ContextoPlantillas } from './casos-plantillas/contexto-plantillas';
import { listarPlantillas as listarPlantillasCaso } from './casos-plantillas/listar-plantillas';
import { obtenerPlantilla as obtenerPlantillaCaso } from './casos-plantillas/obtener-plantilla';
import { crearPlantilla as crearPlantillaCaso } from './casos-plantillas/crear-plantilla';
import { actualizarPlantilla as actualizarPlantillaCaso } from './casos-plantillas/actualizar-plantilla';
import { desactivarPlantilla as desactivarPlantillaCaso } from './casos-plantillas/desactivar-plantilla';
import {
  claveIdempotenciaAsignacion,
  ejecutarAsignacion as ejecutarAsignacionCaso,
} from './casos-plantillas/asignar-plantilla';

// =============================================================================
// SERVICIO: BANCO DE PLANTILLAS DE RUTINA (RF-017)
// =============================================================================
//
// Decisiones de diseño (documentadas para el reporte de la unidad):
//
// 1. MODELO: `plantillas_rutina` replica el patrón de `rutinas` — los bloques de
//    días/ejercicios viven en un JSONB tipado con `BloqueDiaRutinaDTO`, de modo que
//    asignar una plantilla es una copia profunda fiel al modelo del alumno.
//
// 2. REEMPLAZAR: respeta el modelo existente de "rutina activa por alumno"
//    (`guardarRutinaSemanal`): desactiva la rutina activa vigente e inserta una
//    NUEVA rutina activa con el clon de la plantilla. La rutina anterior y las
//    sesiones/semanas ya prescritas conservan su `rutina_id` y no se alteran.
//
// 3. FUSIONAR: si el alumno tiene rutina activa, anexa los bloques clonados a los
//    existentes (sin borrar ninguno). Si no tiene rutina activa, se comporta como
//    REEMPLAZAR (crea la primera rutina activa).
//
// 4. DEEP CLONE: cada asignación usa `structuredClone` + regenera los `diaId`
//    (UUID nuevo por bloque) para que el resultado sea independiente de la
//    plantilla y de otras asignaciones. Editar la plantilla después no toca lo
//    asignado; ajustar la rutina del alumno no toca la plantilla.
//
// 5. TENANCY: toda consulta de plantilla filtra por `entrenador_id`; si el recurso
//    no pertenece al coach se responde 404 (no se filtra la existencia). La
//    asignación a un alumno de otro tenant es un fallo POR ALUMNO (no aborta el
//    lote) con el mismo criterio de aislamiento del resto del módulo.
// =============================================================================

@Injectable()
export class PlantillasService {
  private readonly logger = new Logger(PlantillasService.name);

  /**
   * `POST /plantillas/:id/asignar` con `X-Idempotency-Key`. Misma clave + mismo cuerpo
   * (mismo coach y plantilla) → misma respuesta sin volver a aplicar la asignación.
   */
  private readonly idempotencia = new RegistroIdempotencia();

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    // RNF-003/ADR-009: las consultas/escrituras sobre `rutinas` y
    // `plantillas_rutina` (tablas con RLS) corren dentro de este envoltorio
    // transaccional con el GUC del tenant.
    @Inject(WITH_TENANT) private readonly withTenant: WithTenantFn
  ) {
    this.ctx = { db: this.db, withTenant: this.withTenant, logger: this.logger };
  }

  /** Contexto de dependencias explícito de los casos de uso (P2). */
  private readonly ctx: ContextoPlantillas;

  // ---------------------------------------------------------------------------
  // 1. CRUD DE PLANTILLAS (TENANT-SCOPED)
  // ---------------------------------------------------------------------------

  /**
   * Lista las plantillas del entrenador autenticado.
   * `activa` opcional: true → solo activas, false → solo desactivadas, omitido → todas.
   */
  async listarPlantillas(
    entrenadorId: string,
    activa?: boolean
  ): Promise<PlantillaRutinaResumenDTO[]> {
    return listarPlantillasCaso(this.ctx, entrenadorId, activa);
  }

  /**
   * Obtiene una plantilla del entrenador autenticado (404 si es de otro tenant).
   */
  async obtenerPlantilla(entrenadorId: string, plantillaId: string): Promise<PlantillaRutinaDTO> {
    return obtenerPlantillaCaso(this.ctx, entrenadorId, plantillaId);
  }

  /**
   * Crea una plantilla en estado Activa asociada al tenant del coach (Escenario 1).
   * Valida que TODOS los ejercicios existan en el catálogo global o del coach.
   */
  async crearPlantilla(
    entrenadorId: string,
    input: CrearPlantillaRutinaDTO
  ): Promise<PlantillaRutinaDTO> {
    return crearPlantillaCaso(this.ctx, entrenadorId, input);
  }

  /**
   * Edita una plantilla del entrenador autenticado (nombre, nivel, bloques y activa).
   * Al reemplazar bloques se revalidan los ejercicios contra el catálogo.
   */
  async actualizarPlantilla(
    entrenadorId: string,
    plantillaId: string,
    input: ActualizarPlantillaRutinaDTO
  ): Promise<PlantillaRutinaDTO> {
    return actualizarPlantillaCaso(this.ctx, entrenadorId, plantillaId, input);
  }

  /**
   * Desactiva (soft delete coherente con `rutinas.activa`) una plantilla.
   * Idempotente: desactivar una plantilla ya inactiva no falla.
   */
  async desactivarPlantilla(
    entrenadorId: string,
    plantillaId: string
  ): Promise<PlantillaRutinaResumenDTO> {
    return desactivarPlantillaCaso(this.ctx, entrenadorId, plantillaId);
  }

  // ---------------------------------------------------------------------------
  // 2. ASIGNACIÓN (REEMPLAZAR / FUSIONAR, INDIVIDUAL O MASIVA)
  // ---------------------------------------------------------------------------

  /**
   * Asigna la plantilla a uno o más alumnos con reporte por alumno (RF-017 RN-02/RN-03).
   *
   * - Valida la plantilla (propiedad + activa) y los ajustes UNA vez, antes del lote.
   * - Cada alumno se procesa de forma aislada: un alumno inexistente o de otro tenant
   *   se reporta como fallo sin abortar la asignación de los demás.
   * - con `idempotencyKey`, un reintento con la misma clave y el mismo cuerpo
   *   devuelve la respuesta original sin reaplicar (también si llega mientras la primera corre).
   */
  async asignarPlantilla(
    entrenadorId: string,
    plantillaId: string,
    input: AsignarPlantillaDTO,
    idempotencyKey?: string
  ): Promise<AsignacionPlantillaResponseDTO> {
    const validado = parsearContrato(AsignarPlantillaSchema, input);
    const clave = claveIdempotenciaAsignacion(entrenadorId, plantillaId, validado, idempotencyKey);
    return this.idempotencia.ejecutar(clave, () =>
      ejecutarAsignacionCaso(this.ctx, entrenadorId, plantillaId, validado)
    );
  }
}
