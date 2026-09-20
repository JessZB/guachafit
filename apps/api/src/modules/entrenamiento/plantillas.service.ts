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
  isNull,
  or,
  plantillasRutina,
  rutinas,
  perfilesAlumno,
  ejerciciosCatalogo,
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
    const validado = CrearPlantillaRutinaSchema.parse(input);
    const bloques = await this.validarEjerciciosDeBloques(entrenadorId, validado.bloques);
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
    const validado = ActualizarPlantillaRutinaSchema.parse(input);
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
      cambios.bloques = await this.validarEjerciciosDeBloques(entrenadorId, validado.bloques);
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
   */
  async asignarPlantilla(
    entrenadorId: string,
    plantillaId: string,
    input: AsignarPlantillaDTO
  ): Promise<AsignacionPlantillaResponseDTO> {
    const validado = AsignarPlantillaSchema.parse(input);
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
      const perfil = await this.resolverPerfilAlumno(alumnoId);
      if (!perfil) {
        return {
          alumnoId,
          exito: false,
          error: `Alumno con ID '${alumnoId}' no encontrado.`,
        };
      }
      if (perfil.entrenadorId !== entrenadorId) {
        return {
          alumnoId,
          usuarioId: perfil.usuarioId,
          exito: false,
          error: 'Aislamiento de Tenant: el alumno pertenece a otro entrenador.',
        };
      }

      // Cada alumno recibe su propia copia profunda (diaIds nuevos e independientes).
      const bloquesClonados = this.clonarYRegenerarDiaIds(bloquesAjustados);
      const ahora = new Date();

      if (modo === ModoAsignacionPlantilla.FUSIONAR) {
        const activa = await this.obtenerRutinaActiva(entrenadorId, perfil.usuarioId);
        if (activa) {
          const bloquesFusionados = [
            ...(activa.bloques as BloqueDiaRutinaDTO[]),
            ...bloquesClonados,
          ];
          // RNF-003/ADR-009: escritura tenant-scoped sobre `rutinas` con GUC del coach.
          await this.withTenant({ entrenadorId }, async (tx) => {
            await tx
              .update(rutinas)
              .set({ bloques: bloquesFusionados, updatedAtUtc: ahora })
              .where(eq(rutinas.id, activa.id));
          });

          return {
            alumnoId,
            usuarioId: perfil.usuarioId,
            exito: true,
            rutinaId: activa.id,
            rutinaNombre: activa.nombre,
            bloquesTotal: bloquesFusionados.length,
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
      const mensaje = error instanceof Error ? error.message : 'Error inesperado en la asignación.';
      this.logger.warn(`Asignación de plantilla falló para alumno ${alumnoId}: ${mensaje}`);
      return { alumnoId, exito: false, error: mensaje };
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
      throw new NotFoundException(`Plantilla de rutina con ID '${plantillaId}' no encontrada.`);
    }
    return plantilla;
  }

  private async resolverPerfilAlumno(alumnoId: string): Promise<PerfilAlumnoRow | undefined> {
    // Acepta `perfiles_alumno.id` o `usuarios.id`, igual que el resto del módulo.
    let [perfil] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.id, alumnoId))
      .limit(1);

    if (!perfil) {
      [perfil] = await this.db
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.usuarioId, alumnoId))
        .limit(1);
    }
    return perfil;
  }

  /**
   * Rutina activa del alumno. RNF-003/ADR-009: `rutinas` tiene RLS, por lo que la
   * lectura corre dentro de withTenant con el GUC del coach dueño del alumno.
   */
  private async obtenerRutinaActiva(
    entrenadorId: string,
    alumnoUsuarioId: string
  ): Promise<RutinaRow | undefined> {
    const [rutina] = await this.withTenant({ entrenadorId }, async (tx) =>
      tx
        .select()
        .from(rutinas)
        .where(and(eq(rutinas.alumnoId, alumnoUsuarioId), eq(rutinas.activa, true)))
        .orderBy(desc(rutinas.createdAtUtc))
        .limit(1)
    );
    return rutina;
  }

  /**
   * Valida cada ejercicio de los bloques contra el catálogo:
   * debe existir (por ID o, en su defecto, por nombre exacto) y ser global
   * (`entrenador_id IS NULL`) o del propio coach, y estar activo.
   * Devuelve bloques normalizados con `ejercicioId` resuelto.
   */
  private async validarEjerciciosDeBloques(
    entrenadorId: string,
    bloques: BloqueDiaRutinaDTO[]
  ): Promise<BloqueDiaRutinaDTO[]> {
    const resultado: BloqueDiaRutinaDTO[] = [];

    for (const bloque of bloques) {
      const ejercicios: BloqueDiaRutinaDTO['ejercicios'] = [];

      for (const ejercicio of bloque.ejercicios) {
        const resuelto = await this.resolverEjercicioDelCatalogo(
          entrenadorId,
          ejercicio.ejercicioId,
          ejercicio.nombre
        );

        if (!resuelto) {
          throw new BadRequestException(
            `El ejercicio '${ejercicio.nombre}' no existe en el catálogo global ni en el catálogo del entrenador.`
          );
        }

        ejercicios.push({ ...ejercicio, ejercicioId: resuelto.id });
      }

      resultado.push({ ...bloque, ejercicios });
    }

    return resultado;
  }

  private async resolverEjercicioDelCatalogo(
    entrenadorId: string,
    ejercicioId: string | undefined,
    nombre: string
  ): Promise<EjercicioCatalogoRow | undefined> {
    if (ejercicioId) {
      const [porId] = await this.db
        .select()
        .from(ejerciciosCatalogo)
        .where(and(eq(ejerciciosCatalogo.id, ejercicioId), eq(ejerciciosCatalogo.activo, true)))
        .limit(1);
      return this.esDelTenant(porId, entrenadorId) ? porId : undefined;
    }

    const candidatos = await this.db
      .select()
      .from(ejerciciosCatalogo)
      .where(
        and(
          eq(ejerciciosCatalogo.nombre, nombre),
          eq(ejerciciosCatalogo.activo, true),
          or(
            eq(ejerciciosCatalogo.entrenadorId, entrenadorId),
            isNull(ejerciciosCatalogo.entrenadorId)
          )!
        )
      );
    return candidatos[0];
  }

  private esDelTenant(ejercicio: EjercicioCatalogoRow | undefined, entrenadorId: string): boolean {
    if (!ejercicio) return false;
    return ejercicio.entrenadorId === null || ejercicio.entrenadorId === entrenadorId;
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
        throw new BadRequestException(
          `El día '${ajuste.diaId}' del ajuste no existe en la plantilla.`
        );
      }

      const ejercicio = bloque.ejercicios.find((e) =>
        ajuste.ejercicioId ? e.ejercicioId === ajuste.ejercicioId : e.nombre === ajuste.nombre
      );
      if (!ejercicio) {
        throw new BadRequestException(
          `El ejercicio del ajuste no existe en el día '${ajuste.diaId}' de la plantilla.`
        );
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

interface EjercicioCatalogoRow {
  id: string;
  entrenadorId: string | null;
  nombre: string;
  activo: boolean;
}
