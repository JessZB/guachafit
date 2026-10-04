import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import {
  Database,
  WithTenantFn,
  eq,
  and,
  desc,
  plantillasRutina,
  rutinas,
  perfilesAlumno,
} from '@guachafit/database';
import {
  NivelObjetivoPlantilla,
  ModoAsignacionPlantilla,
  CrearPlantillaRutinaDTO,
  CrearPlantillaRutinaSchema,
  ActualizarPlantillaRutinaDTO,
  ActualizarPlantillaRutinaSchema,
  AsignarPlantillaDTO,
  AsignarPlantillaSchema,
  AjusteEjercicioPlantillaDTO,
  BloqueDiaRutinaDTO,
  PlantillaRutinaDTO,
  PlantillaRutinaResumenDTO,
  AsignacionPlantillaResponseDTO,
  ResultadoAsignacionAlumnoDTO,
} from '@guachafit/shared';
import { createHash } from 'node:crypto';
import { parsearContrato } from '../../common/errores/parsear-contrato';
import { RegistroIdempotencia } from '../../common/idempotencia/registro-idempotencia';
import { obtenerDiaSugeridoBloque } from '../../common/adherencia.util';
import { validarEjerciciosDeBloques } from './catalogo-ejercicios';
import {
  MENSAJE_ALUMNO_FUERA_DE_LISTA,
  MENSAJE_ALUMNO_NO_ENCONTRADO,
} from '../../common/mensajes-acceso';

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

/** LOTE API-2: un ajuste apunta a un día o ejercicio que no está en la plantilla. */
const MENSAJE_AJUSTE_AJENO_A_PLANTILLA =
  'Uno de los ajustes no corresponde a esta plantilla. Ábrela de nuevo.';
/** LOTE API-2: fallo inesperado al asignar a un alumno del lote (el detalle va al log). */
const MENSAJE_ASIGNACION_FALLIDA = 'No pudimos asignar la rutina a este alumno. Inténtalo de nuevo.';
/** FUSIONAR dejaría la rutina del alumno por encima del máximo semanal. */
const MENSAJE_FUSION_SUPERA_7_DIAS =
  'La rutina de este alumno quedaría con más de 7 días. Usa «Reemplazar» o quita días antes de añadir.';
/** Máximo de días de una rutina semanal (`GuardarRutinaSemanalSchema.bloques.max(7)`). */
const MAX_DIAS_RUTINA = 7;

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
  ) {}

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
    const conditions = [eq(plantillasRutina.entrenadorId, entrenadorId)];
    if (typeof activa === 'boolean') {
      conditions.push(eq(plantillasRutina.activa, activa));
    }

    const rows = await this.withTenant({ entrenadorId }, async (tx) =>
      tx
        .select()
        .from(plantillasRutina)
        .where(and(...conditions))
        .orderBy(desc(plantillasRutina.createdAtUtc))
    );

    return rows.map((row) => this.toResumen(row));
  }

  /**
   * Obtiene una plantilla del entrenador autenticado (404 si es de otro tenant).
   */
  async obtenerPlantilla(entrenadorId: string, plantillaId: string): Promise<PlantillaRutinaDTO> {
    const plantilla = await this.cargarPlantillaDelCoach(entrenadorId, plantillaId);
    return this.toDTO(plantilla);
  }

  /**
   * Crea una plantilla en estado Activa asociada al tenant del coach (Escenario 1).
   * Valida que TODOS los ejercicios existan en el catálogo global o del coach.
   */
  async crearPlantilla(
    entrenadorId: string,
    input: CrearPlantillaRutinaDTO
  ): Promise<PlantillaRutinaDTO> {
    const validado = parsearContrato(CrearPlantillaRutinaSchema, input);
    const bloques = await validarEjerciciosDeBloques(this.db, entrenadorId, validado.bloques);
    const ahora = new Date();

    // RNF-003/ADR-011: `plantillas_rutina` tiene RLS; la inserción corre con el
    // GUC del coach y la política WITH CHECK rechaza un `entrenador_id` ajeno.
    const [nueva] = await this.withTenant({ entrenadorId }, async (tx) =>
      tx
        .insert(plantillasRutina)
        .values({
          id: crypto.randomUUID(),
          entrenadorId,
          nombre: validado.nombre.trim(),
          nivelObjetivo: validado.nivelObjetivo,
          bloques,
          activa: validado.activa ?? true,
          createdAtUtc: ahora,
          updatedAtUtc: ahora,
        })
        .returning()
    );

    return this.toDTO(nueva);
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
    const validado = parsearContrato(ActualizarPlantillaRutinaSchema, input);
    const existente = await this.cargarPlantillaDelCoach(entrenadorId, plantillaId);

    const cambios: {
      updatedAtUtc: Date;
      nombre?: string;
      nivelObjetivo?: NivelObjetivoPlantilla;
      bloques?: BloqueDiaRutinaDTO[];
      activa?: boolean;
    } = { updatedAtUtc: new Date() };
    if (validado.nombre !== undefined) cambios.nombre = validado.nombre.trim();
    if (validado.nivelObjetivo !== undefined) cambios.nivelObjetivo = validado.nivelObjetivo;
    if (validado.bloques !== undefined) {
      cambios.bloques = await validarEjerciciosDeBloques(this.db, entrenadorId, validado.bloques);
    }
    if (validado.activa !== undefined) cambios.activa = validado.activa;

    // RNF-003/ADR-011: escritura tenant-scoped sobre `plantillas_rutina` con RLS.
    await this.withTenant({ entrenadorId }, async (tx) => {
      await tx.update(plantillasRutina).set(cambios).where(eq(plantillasRutina.id, existente.id));
    });

    return this.toDTO({ ...existente, ...cambios });
  }

  /**
   * Desactiva (soft delete coherente con `rutinas.activa`) una plantilla.
   * Idempotente: desactivar una plantilla ya inactiva no falla.
   */
  async desactivarPlantilla(
    entrenadorId: string,
    plantillaId: string
  ): Promise<PlantillaRutinaResumenDTO> {
    const existente = await this.cargarPlantillaDelCoach(entrenadorId, plantillaId);
    const desactivada = { ...existente, activa: false, updatedAtUtc: new Date() };

    // RNF-003/ADR-011: soft delete tenant-scoped sobre `plantillas_rutina` con RLS.
    await this.withTenant({ entrenadorId }, async (tx) => {
      await tx
        .update(plantillasRutina)
        .set({ activa: false, updatedAtUtc: desactivada.updatedAtUtc })
        .where(eq(plantillasRutina.id, existente.id));
    });

    return this.toResumen(desactivada);
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
    const clave = this.claveIdempotenciaAsignacion(entrenadorId, plantillaId, validado, idempotencyKey);
    return this.idempotencia.ejecutar(clave, () =>
      this.ejecutarAsignacion(entrenadorId, plantillaId, validado)
    );
  }

  /**
   * Coach + plantilla + clave + huella del cuerpo validado: la misma clave con otro cuerpo no
   * reutiliza la respuesta anterior.
   */
  private claveIdempotenciaAsignacion(
    entrenadorId: string,
    plantillaId: string,
    validado: AsignarPlantillaDTO,
    idempotencyKey?: string
  ): string | null {
    const key = (idempotencyKey ?? '').trim();
    if (!key) return null;
    const huella = createHash('sha256').update(JSON.stringify(validado)).digest('hex');
    return `asignar-plantilla:${entrenadorId}:${plantillaId}:${key}:${huella}`;
  }

  private async ejecutarAsignacion(
    entrenadorId: string,
    plantillaId: string,
    validado: AsignarPlantillaDTO
  ): Promise<AsignacionPlantillaResponseDTO> {
    const plantilla = await this.cargarPlantillaDelCoach(entrenadorId, plantillaId);

    if (!plantilla.activa) {
      throw new BadRequestException(
        'La plantilla está desactivada. Reactívala antes de asignarla a un alumno.'
      );
    }

    // Validación global de ajustes: un ajuste que no corresponde a la plantilla es un
    // error del cliente, no un fallo por alumno. La copia profunda conserva los `diaId`
    // originales para poder localizar el ejercicio ajustado.
    const bloquesAjustados = structuredClone(plantilla.bloques) as BloqueDiaRutinaDTO[];
    this.aplicarAjustes(bloquesAjustados, validado.ajustes);

    const resultados: ResultadoAsignacionAlumnoDTO[] = [];
    for (const alumnoId of validado.alumnoIds) {
      resultados.push(
        await this.asignarAAlumno(entrenadorId, plantilla, bloquesAjustados, validado.modo, alumnoId)
      );
    }

    const exitosos = resultados.filter((r) => r.exito).length;

    return {
      plantillaId: plantilla.id,
      modo: validado.modo,
      totalSolicitados: resultados.length,
      exitosos,
      fallidos: resultados.length - exitosos,
      resultados,
    };
  }

  // ---------------------------------------------------------------------------
  // HELPERS PRIVADOS
  // ---------------------------------------------------------------------------

  private async asignarAAlumno(
    entrenadorId: string,
    plantilla: PlantillaRow,
    bloquesAjustados: BloqueDiaRutinaDTO[],
    modo: ModoAsignacionPlantilla,
    alumnoId: string
  ): Promise<ResultadoAsignacionAlumnoDTO> {
    try {
      const perfil = await this.resolverPerfilAlumno(alumnoId, entrenadorId);
      if (!perfil) {
        return {
          alumnoId,
          exito: false,
          error: MENSAJE_ALUMNO_NO_ENCONTRADO,
        };
      }
      if (perfil.entrenadorId !== entrenadorId) {
        return {
          alumnoId,
          usuarioId: perfil.usuarioId,
          exito: false,
          error: MENSAJE_ALUMNO_FUERA_DE_LISTA,
        };
      }

      // Cada alumno recibe su propia copia profunda (diaIds nuevos e independientes).
      const bloquesClonados = this.clonarYRegenerarDiaIds(bloquesAjustados);
      const ahora = new Date();

      if (modo === ModoAsignacionPlantilla.FUSIONAR) {
        // Lectura de la rutina activa + actualización en UNA transacción con el
        // GUC del coach (RNF-003/ADR-009) y la fila bloqueada (`FOR UPDATE`): dos fusiones
        // simultáneas no se pisan los días.
        const fusion = await this.withTenant({ entrenadorId }, async (tx) => {
          const [activa] = await tx
            .select()
            .from(rutinas)
            .where(and(eq(rutinas.alumnoId, perfil.usuarioId), eq(rutinas.activa, true)))
            .orderBy(desc(rutinas.createdAtUtc))
            .limit(1)
            .for('update');
          if (!activa) return null;

          const existentes = (activa.bloques as BloqueDiaRutinaDTO[]) ?? [];
          if (existentes.length + bloquesClonados.length > MAX_DIAS_RUTINA) {
            return { activa, excedeMaximo: true as const, bloquesTotal: existentes.length };
          }

          const bloquesFusionados = [
            ...existentes,
            ...this.asignarDiasLibres(existentes, bloquesClonados),
          ];
          await tx
            .update(rutinas)
            .set({ bloques: bloquesFusionados, updatedAtUtc: ahora })
            .where(eq(rutinas.id, activa.id));
          return { activa, excedeMaximo: false as const, bloquesTotal: bloquesFusionados.length };
        });

        if (fusion?.excedeMaximo) {
          return {
            alumnoId,
            usuarioId: perfil.usuarioId,
            exito: false,
            error: MENSAJE_FUSION_SUPERA_7_DIAS,
          };
        }
        if (fusion) {
          return {
            alumnoId,
            usuarioId: perfil.usuarioId,
            exito: true,
            rutinaId: fusion.activa.id,
            rutinaNombre: fusion.activa.nombre,
            bloquesTotal: fusion.bloquesTotal,
          };
        }
        // Sin rutina activa: la fusión degenera en reemplazo (primera rutina del alumno).
      }

      // REEMPLAZAR (o FUSIONAR sin rutina activa): desactivar vigente + crear nueva
      // rutina activa en una transacción atómica con el GUC del tenant (RLS);
      // el historial previo queda intacto.
      const nueva = await this.withTenant({ entrenadorId }, async (tx) => {
        await tx
          .update(rutinas)
          .set({ activa: false, updatedAtUtc: ahora })
          .where(and(eq(rutinas.alumnoId, perfil.usuarioId), eq(rutinas.activa, true)));

        const [creada] = await tx
          .insert(rutinas)
          .values({
            id: crypto.randomUUID(),
            alumnoId: perfil.usuarioId,
            entrenadorId,
            nombre: plantilla.nombre,
            bloques: bloquesClonados,
            activa: true,
            createdAtUtc: ahora,
            updatedAtUtc: ahora,
          })
          .returning();

        return creada;
      });

      return {
        alumnoId,
        usuarioId: perfil.usuarioId,
        exito: true,
        rutinaId: nueva.id,
        rutinaNombre: nueva.nombre,
        bloquesTotal: bloquesClonados.length,
      };
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Asignación de plantilla falló para alumno ${alumnoId}: ${detalle}`);
      // LOTE API-2: el detalle técnico (BD, red) queda en el log; al coach, un texto claro.
      return { alumnoId, exito: false, error: MENSAJE_ASIGNACION_FALLIDA };
    }
  }

  private async cargarPlantillaDelCoach(
    entrenadorId: string,
    plantillaId: string
  ): Promise<PlantillaRow> {
    // RNF-003/ADR-011: lectura de `plantillas_rutina` con RLS. Si la plantilla es
    // de otro tenant, la política la oculta (misma respuesta 404 que el filtro
    // explícito: no se filtra la existencia del recurso).
    const [plantilla] = await this.withTenant({ entrenadorId }, async (tx) =>
      tx
        .select()
        .from(plantillasRutina)
        .where(eq(plantillasRutina.id, plantillaId))
        .limit(1)
    );

    if (!plantilla || plantilla.entrenadorId !== entrenadorId) {
      throw new NotFoundException('No encontramos esa plantilla. Puede que se haya eliminado.');
    }
    return plantilla;
  }

  private async resolverPerfilAlumno(
    alumnoId: string,
    entrenadorId: string
  ): Promise<PerfilAlumnoRow | undefined> {
    // Acepta `perfiles_alumno.id` o `usuarios.id`, igual que el resto del módulo.
    // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; lectura con el GUC del coach
    // (un perfil de otro tenant no es visible: se reporta como alumno no encontrado).
    return this.withTenant({ entrenadorId }, async (tx) => {
      let [perfil] = await tx
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.id, alumnoId))
        .limit(1);

      if (!perfil) {
        [perfil] = await tx
          .select()
          .from(perfilesAlumno)
          .where(eq(perfilesAlumno.usuarioId, alumnoId))
          .limit(1);
      }
      return perfil;
    });
  }

  /**
   * Los días añadidos por FUSIONAR no repiten el día sugerido de los existentes ni
   * entre sí. Cada día nuevo conserva su día si está libre; si no, toma el siguiente libre de la
   * semana (con 7 días como máximo siempre hay uno). Los días existentes no se tocan.
   */
  private asignarDiasLibres(
    existentes: BloqueDiaRutinaDTO[],
    nuevos: BloqueDiaRutinaDTO[]
  ): BloqueDiaRutinaDTO[] {
    const ocupados = new Set(existentes.map((bloque, idx) => obtenerDiaSugeridoBloque(bloque, idx)));
    return nuevos.map((bloque) => {
      let dia =
        bloque.diaSugerido && bloque.diaSugerido >= 1 && bloque.diaSugerido <= 7
          ? bloque.diaSugerido
          : 1;
      for (let paso = 0; paso < 7 && ocupados.has(dia); paso++) {
        dia = (dia % 7) + 1;
      }
      ocupados.add(dia);
      return { ...bloque, diaSugerido: dia };
    });
  }

  /**
   * Copia profunda e independiente de los bloques. Regenera `diaId` (UUID) para que
   * dos asignaciones de la misma plantilla no compartan identificadores de bloque.
   * Los ajustes se aplican ANTES sobre una copia con los `diaId` originales, por lo
   * que aquí los bloques ya llegan ajustados.
   */
  private clonarYRegenerarDiaIds(bloques: BloqueDiaRutinaDTO[]): BloqueDiaRutinaDTO[] {
    const clonados = structuredClone(bloques) as BloqueDiaRutinaDTO[];
    for (const bloque of clonados) {
      bloque.diaId = crypto.randomUUID();
    }
    return clonados;
  }

  /**
   * Aplica overrides de carga/series/reps/RPE sobre los bloques (copia con `diaId`
   * originales de la plantilla, previa a la clonación por alumno).
   */
  private aplicarAjustes(
    bloques: BloqueDiaRutinaDTO[],
    ajustes: AjusteEjercicioPlantillaDTO[] | undefined
  ): void {
    if (!ajustes || ajustes.length === 0) return;

    for (const ajuste of ajustes) {
      const bloque = bloques.find((b) => b.diaId === ajuste.diaId);
      if (!bloque) {
        throw new BadRequestException(MENSAJE_AJUSTE_AJENO_A_PLANTILLA);
      }

      const ejercicio = bloque.ejercicios.find((e) =>
        ajuste.ejercicioId ? e.ejercicioId === ajuste.ejercicioId : e.nombre === ajuste.nombre
      );
      if (!ejercicio) {
        throw new BadRequestException(MENSAJE_AJUSTE_AJENO_A_PLANTILLA);
      }

      if (ajuste.pesoPrescritoKg !== undefined) ejercicio.peso = ajuste.pesoPrescritoKg;
      if (ajuste.series !== undefined) ejercicio.series = ajuste.series;
      if (ajuste.reps !== undefined) ejercicio.reps = ajuste.reps;
      if (ajuste.rpe !== undefined) ejercicio.rpe = ajuste.rpe;
    }
  }

  private toDTO(row: PlantillaRow): PlantillaRutinaDTO {
    return {
      id: row.id,
      entrenadorId: row.entrenadorId,
      nombre: row.nombre,
      nivelObjetivo: row.nivelObjetivo as NivelObjetivoPlantilla,
      bloques: row.bloques as BloqueDiaRutinaDTO[],
      activa: row.activa,
      createdAtUtc: this.toIsoString(row.createdAtUtc),
      updatedAtUtc: this.toIsoString(row.updatedAtUtc),
    };
  }

  private toResumen(row: PlantillaRow): PlantillaRutinaResumenDTO {
    const bloques = (row.bloques as BloqueDiaRutinaDTO[]) ?? [];
    return {
      id: row.id,
      entrenadorId: row.entrenadorId,
      nombre: row.nombre,
      nivelObjetivo: row.nivelObjetivo as NivelObjetivoPlantilla,
      totalDias: bloques.length,
      totalEjercicios: bloques.reduce((total, bloque) => total + (bloque.ejercicios?.length ?? 0), 0),
      activa: row.activa,
      createdAtUtc: this.toIsoString(row.createdAtUtc),
      updatedAtUtc: this.toIsoString(row.updatedAtUtc),
    };
  }

  private toIsoString(fecha: Date | string): string {
    return typeof fecha === 'string' ? new Date(fecha).toISOString() : fecha.toISOString();
  }
}

// =============================================================================
// TIPOS INTERNOS DE FILA (Drizzle infiere las columnas; estos alias mantienen
// la firma de los helpers legible sin acoplar a los tests).
// =============================================================================
interface PlantillaRow {
  id: string;
  entrenadorId: string;
  nombre: string;
  nivelObjetivo: string;
  bloques: unknown;
  activa: boolean;
  createdAtUtc: Date;
  updatedAtUtc: Date;
}

interface PerfilAlumnoRow {
  id: string;
  usuarioId: string;
  entrenadorId: string;
}

interface RutinaRow {
  id: string;
  alumnoId: string;
  entrenadorId: string;
  nombre: string;
  bloques: unknown;
  activa: boolean;
}
