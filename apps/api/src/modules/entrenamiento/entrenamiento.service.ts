import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DRIZZLE_DB } from '../../database/database.module';
import {
  Database,
  eq,
  and,
  or,
  isNull,
  desc,
  asc,
  inArray,
  gte,
  lte,
  sql,
  ejerciciosCatalogo,
  sesionesEntrenamiento,
  ejerciciosSesion,
  seriesRegistro,
  perfilesAlumno,
  usuarios,
  rutinas,
} from '@guachafit/database';
import {
  Rol,
  EstadoSesion,
  SemaforoAdherencia,
  CrearEjercicioCatalogoDTO,
  CrearEjercicioCatalogoSchema,
  CrearSesionEntrenamientoDTO,
  CrearSesionEntrenamientoSchema,
  GuardarRutinaSemanalDTO,
  GuardarRutinaSemanalSchema,
  RutinaSemanalDetalleDTO,
  BloqueDiaRutinaDTO,
  BloqueSemanaProgresoDTO,
  SemanaEntrenamientoProgresoDTO,
  IniciarSesionDTO,
  IniciarSesionSchema,
  SincronizarSeriesBatchDTO,
  SincronizarSeriesBatchSchema,
  FinalizarSesionDTO,
  FinalizarSesionSchema,
  EjercicioCatalogoDetalleDTO,
  SesionEntrenamientoDetalleDTO,
  EjercicioSesionDetalleDTO,
  SerieRegistroDetalleDTO,
  MonitorAdherenciaSemanalDTO,
  DECIMAL_STRING_REGEX,
} from '@guachafit/shared';

// =============================================================================
// FUNCIONES PURAS DE DOMINIO: EVALUACIÓN DE ADHERENCIA Y RACHA (RF-001)
// =============================================================================

export function evaluarAdherenciaSemanal(
  sesionesPrescritas: number,
  sesionesCompletadas: number,
  diasInactivo: number
): {
  porcentajeCumplimientoSemanal: string;
  semaforoAdherencia: SemaforoAdherencia;
  nivelRiesgo: 'ALTO' | 'MEDIO' | 'BAJO';
} {
  if (sesionesPrescritas <= 0) {
    return {
      porcentajeCumplimientoSemanal: '0.00',
      semaforoAdherencia: SemaforoAdherencia.ROJO,
      nivelRiesgo: 'ALTO',
    };
  }

  const porcentaje = (sesionesCompletadas / sesionesPrescritas) * 100;
  const porcentajeStr = porcentaje.toFixed(2);

  // Regla RN-03: Inactividad > 4 días consecutivos fuerza automáticamente a ROJO
  if (diasInactivo > 4 || porcentaje < 50.0) {
    return {
      porcentajeCumplimientoSemanal: porcentajeStr,
      semaforoAdherencia: SemaforoAdherencia.ROJO,
      nivelRiesgo: 'ALTO',
    };
  }

  if (porcentaje >= 80.0) {
    return {
      porcentajeCumplimientoSemanal: porcentajeStr,
      semaforoAdherencia: SemaforoAdherencia.VERDE,
      nivelRiesgo: 'BAJO',
    };
  }

  // 50% <= porcentaje < 80%
  return {
    porcentajeCumplimientoSemanal: porcentajeStr,
    semaforoAdherencia: SemaforoAdherencia.AMARILLO,
    nivelRiesgo: 'MEDIO',
  };
}

export function calcularDuracionMinutos(
  fechaInicioUtc: string | Date | null | undefined,
  fechaFinUtc: string | Date | null | undefined
): number | null {
  if (!fechaInicioUtc || !fechaFinUtc) return null;
  const inicioMs = new Date(fechaInicioUtc).getTime();
  const finMs = new Date(fechaFinUtc).getTime();
  return Math.max(0, Math.round((finMs - inicioMs) / (1000 * 60)));
}

export function toIsoUtcString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

export function calcularRangoSemanaIso(fechaYyyyMmDd: string): {
  semanaIso: string;
  inicioSemana: string;
  finSemana: string;
  isoDay: number;
} {
  const [y, m, d] = fechaYyyyMmDd.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const jsDay = fecha.getUTCDay(); // 0 = Dom, 1 = Lun, ..., 6 = Sab
  const isoDay = jsDay === 0 ? 7 : jsDay;

  const diffToMonday = isoDay - 1;
  const lunesUtcMs = fecha.getTime() - diffToMonday * 86400000;
  const lunesDate = new Date(lunesUtcMs);
  const inicioSemana = lunesDate.toISOString().split('T')[0];

  const domingoUtcMs = lunesUtcMs + 6 * 86400000;
  const domingoDate = new Date(domingoUtcMs);
  const finSemana = domingoDate.toISOString().split('T')[0];

  const target = new Date(fecha.valueOf());
  const dayNr = (fecha.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const semanaIso = `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;

  return {
    semanaIso,
    inicioSemana,
    finSemana,
    isoDay,
  };
}

export function obtenerDiaSugeridoBloque(bloque: BloqueDiaRutinaDTO, fallbackIndex: number): number {
  if (typeof bloque.diaSugerido === 'number' && bloque.diaSugerido >= 1 && bloque.diaSugerido <= 7) {
    return bloque.diaSugerido;
  }
  const match = bloque.diaId.match(/\d+/);
  if (match) {
    const n = parseInt(match[0], 10);
    if (n >= 1 && n <= 7) return n;
  }
  return fallbackIndex + 1 <= 7 ? fallbackIndex + 1 : 1;
}

// =============================================================================
// SERVICIO DE ENTRENAMIENTO (RF-001)
// =============================================================================

@Injectable()
export class EntrenamientoService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  // ---------------------------------------------------------------------------
  // 1. CATÁLOGO DE EJERCICIOS
  // ---------------------------------------------------------------------------

  /**
   * Crear nuevo ejercicio en el catálogo.
   * Si viene entrenadorId, es propiedad del coach; si es null, es global.
   */
  async crearEjercicio(
    entrenadorId: string | null | undefined,
    input: CrearEjercicioCatalogoDTO
  ): Promise<EjercicioCatalogoDetalleDTO> {
    const validado = CrearEjercicioCatalogoSchema.parse(input);
    const targetEntrenadorId = validado.entrenadorId || entrenadorId || null;

    const [nuevoEjercicio] = await this.db
      .insert(ejerciciosCatalogo)
      .values({
        entrenadorId: targetEntrenadorId,
        nombre: validado.nombre,
        grupoMuscular: validado.grupoMuscular,
        patronMovimiento: validado.patronMovimiento ?? null,
        videoUrl: validado.videoUrl ?? null,
        activo: true,
        createdAtUtc: new Date(),
      })
      .returning();

    return {
      id: nuevoEjercicio.id,
      entrenadorId: nuevoEjercicio.entrenadorId,
      nombre: nuevoEjercicio.nombre,
      grupoMuscular: nuevoEjercicio.grupoMuscular,
      patronMovimiento: nuevoEjercicio.patronMovimiento,
      videoUrl: nuevoEjercicio.videoUrl,
      activo: nuevoEjercicio.activo,
      createdAtUtc: toIsoUtcString(nuevoEjercicio.createdAtUtc)!,
    };
  }

  /**
   * Listar ejercicios activos aplicando filtro multi-tenant:
   * (entrenadorId = coachId OR entrenadorId IS NULL).
   */
  async listarEjercicios(entrenadorId?: string): Promise<EjercicioCatalogoDetalleDTO[]> {
    const conditions = [eq(ejerciciosCatalogo.activo, true)];

    if (entrenadorId) {
      conditions.push(
        or(
          eq(ejerciciosCatalogo.entrenadorId, entrenadorId),
          isNull(ejerciciosCatalogo.entrenadorId)
        )!
      );
    }

    const rows = await this.db
      .select()
      .from(ejerciciosCatalogo)
      .where(and(...conditions))
      .orderBy(asc(ejerciciosCatalogo.nombre));

    return rows.map((r) => ({
      id: r.id,
      entrenadorId: r.entrenadorId,
      nombre: r.nombre,
      grupoMuscular: r.grupoMuscular,
      patronMovimiento: r.patronMovimiento,
      videoUrl: r.videoUrl,
      activo: r.activo,
      createdAtUtc: toIsoUtcString(r.createdAtUtc)!,
    }));
  }

  // ---------------------------------------------------------------------------
  // 2. PRESCRIPCIÓN DE SESIÓN DE ENTRENAMIENTO
  // ---------------------------------------------------------------------------

  /**
   * Prescribir una nueva sesión de entrenamiento para un alumno con sus ejercicios y series.
   * Valida aislamiento de tenancy entre entrenador y alumno.
   */
  async crearSesion(
    entrenadorId: string,
    input: CrearSesionEntrenamientoDTO
  ): Promise<SesionEntrenamientoDetalleDTO> {
    const validado = CrearSesionEntrenamientoSchema.parse(input);

    // Validar Tenancy: El alumno debe pertenecer a este entrenador
    const [perfilAlumno] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.usuarioId, validado.alumnoId),
          eq(perfilesAlumno.entrenadorId, entrenadorId)
        )
      )
      .limit(1);

    if (!perfilAlumno) {
      throw new ForbiddenException(
        'Aislamiento de Tenant: Acceso denegado o el alumno no pertenece a este entrenador.'
      );
    }

    const targetAlumnoUserId = perfilAlumno.usuarioId;

    // Crear sesión en transacción atómica
    const sesionId = await this.db.transaction(async (tx) => {
      const [sesion] = await tx
        .insert(sesionesEntrenamiento)
        .values({
          alumnoId: targetAlumnoUserId,
          rutinaId: validado.rutinaId ?? null,
          fechaProgramada: validado.fechaProgramada,
          timezoneCliente: validado.timezoneCliente ?? 'America/Caracas',
          estado: EstadoSesion.PLANIFICADA,
          porcentajeCumplimiento: '0.00',
          fechaInicioUtc: null,
          fechaFinUtc: null,
          notasAlumno: null,
          createdAtUtc: new Date(),
          updatedAtUtc: new Date(),
        })
        .returning();

      for (let i = 0; i < validado.ejercicios.length; i++) {
        const ejInput = validado.ejercicios[i];
        const orden = ejInput.orden ?? i + 1;

        const [ejSesion] = await tx
          .insert(ejerciciosSesion)
          .values({
            sesionId: sesion.id,
            ejercicioId: ejInput.ejercicioId,
            orden,
            notasCoach: ejInput.notasCoach ?? null,
            descansoPrescritoSegundos: ejInput.descansoSegundos ?? 90,
          })
          .returning();

        for (let j = 0; j < ejInput.series.length; j++) {
          const sInput = ejInput.series[j];
          const numeroSerie = sInput.numeroSerie ?? j + 1;

          await tx.insert(seriesRegistro).values({
            ejercicioSesionId: ejSesion.id,
            numeroSerie,
            repsObjetivo: sInput.repsObjetivo,
            repsLogradas: null,
            pesoKg: sInput.pesoSugeridoKg ?? null,
            rpe: sInput.rpeObjetivo ?? null,
            completada: false,
            timestampCompletadaUtc: null,
          });
        }
      }

      return sesion.id;
    });

    return this.obtenerSesionPorId(sesionId, targetAlumnoUserId, Rol.ALUMNO);
  }

  // ---------------------------------------------------------------------------
  // 3. CONSULTA DE SESIÓN (RN-04: ACCIÓN PASIVA DE SOLO LECTURA)
  // ---------------------------------------------------------------------------

  /**
   * Prescripción y activación de la planificación semanal por bloques de días.
   * Desactiva de forma atómica cualquier rutina previa del alumno.
   */
  async guardarRutinaSemanal(
    entrenadorId: string,
    alumnoId: string,
    input: GuardarRutinaSemanalDTO
  ): Promise<RutinaSemanalDetalleDTO> {
    const validado = GuardarRutinaSemanalSchema.parse(input);

    let [perfil] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.id, alumnoId));

    if (!perfil) {
      [perfil] = await this.db
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.usuarioId, alumnoId));
    }

    if (!perfil) {
      throw new NotFoundException('El alumno especificado no existe.');
    }

    if (perfil.entrenadorId !== entrenadorId) {
      throw new ForbiddenException(
        'Aislamiento de Tenant: Acceso denegado. El alumno pertenece a otro entrenador.'
      );
    }

    const usuarioAlumnoId = perfil.usuarioId;

    // Desactivar rutinas previas
    await this.db
      .update(rutinas)
      .set({
        activa: false,
        updatedAtUtc: new Date(),
      })
      .where(
        and(
          eq(rutinas.alumnoId, usuarioAlumnoId),
          eq(rutinas.activa, true)
        )
      );

    const ahora = new Date();
    const nuevaRutinaId = crypto.randomUUID();
    const nombre = validado.nombreRutina?.trim() || 'Planificación Semanal Activa';

    const [nuevaRutina] = await this.db
      .insert(rutinas)
      .values({
        id: nuevaRutinaId,
        alumnoId: usuarioAlumnoId,
        entrenadorId,
        nombre,
        bloques: validado.bloques,
        activa: true,
        createdAtUtc: ahora,
        updatedAtUtc: ahora,
      })
      .returning();

    return {
      id: nuevaRutina.id,
      alumnoId: nuevaRutina.alumnoId,
      entrenadorId: nuevaRutina.entrenadorId,
      nombre: nuevaRutina.nombre,
      activa: nuevaRutina.activa,
      bloques: nuevaRutina.bloques as BloqueDiaRutinaDTO[],
      createdAtUtc: toIsoUtcString(nuevaRutina.createdAtUtc)!,
      updatedAtUtc: toIsoUtcString(nuevaRutina.updatedAtUtc)!,
    };
  }

  /**
   * Consulta de la rutina semanal activa del alumno.
   */
  async obtenerRutinaSemanalActiva(
    entrenadorId: string,
    alumnoId: string,
    rol: Rol,
    currentUserId?: string
  ): Promise<RutinaSemanalDetalleDTO | null> {
    let [perfil] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.id, alumnoId));

    if (!perfil) {
      [perfil] = await this.db
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.usuarioId, alumnoId));
    }

    if (!perfil) {
      throw new NotFoundException('El alumno especificado no existe.');
    }

    if (rol === Rol.ENTRENADOR && perfil.entrenadorId !== entrenadorId) {
      throw new ForbiddenException(
        'Aislamiento de Tenant: Acceso denegado. El alumno pertenece a otro entrenador.'
      );
    }

    if (rol === Rol.ALUMNO && currentUserId && perfil.usuarioId !== currentUserId) {
      throw new ForbiddenException('No tienes permiso para consultar esta rutina.');
    }

    const usuarioAlumnoId = perfil.usuarioId;

    const [rutina] = await this.db
      .select()
      .from(rutinas)
      .where(
        and(
          eq(rutinas.alumnoId, usuarioAlumnoId),
          eq(rutinas.activa, true)
        )
      )
      .orderBy(desc(rutinas.createdAtUtc))
      .limit(1);

    if (!rutina) {
      return null;
    }

    return {
      id: rutina.id,
      alumnoId: rutina.alumnoId,
      entrenadorId: rutina.entrenadorId,
      nombre: rutina.nombre,
      activa: rutina.activa,
      bloques: rutina.bloques as BloqueDiaRutinaDTO[],
      createdAtUtc: toIsoUtcString(rutina.createdAtUtc)!,
      updatedAtUtc: toIsoUtcString(rutina.updatedAtUtc)!,
    };
  }

  /**
   * Consulta de progreso semanal de la rutina activa del alumno (Lunes a Domingo).
   * Determina qué bloques han sido completados en la semana ISO actual y sugiere el siguiente.
   */
  async obtenerSemanaActualProgreso(
    alumnoId: string,
    timezoneCliente?: string
  ): Promise<SemanaEntrenamientoProgresoDTO> {
    const tz = timezoneCliente || 'America/Caracas';
    let hoyStr: string;
    try {
      hoyStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    } catch {
      hoyStr = new Date().toISOString().split('T')[0];
    }

    const { semanaIso, inicioSemana, finSemana, isoDay } = calcularRangoSemanaIso(hoyStr);

    const [rutinaActiva] = await this.db
      .select()
      .from(rutinas)
      .where(
        and(
          eq(rutinas.alumnoId, alumnoId),
          eq(rutinas.activa, true)
        )
      )
      .orderBy(desc(rutinas.createdAtUtc))
      .limit(1);

    if (!rutinaActiva || !Array.isArray(rutinaActiva.bloques) || rutinaActiva.bloques.length === 0) {
      return {
        semanaIso,
        inicioSemana,
        finSemana,
        totalBloques: 0,
        bloquesCompletados: 0,
        porcentajeCumplimiento: '0.00',
        bloques: [],
        siguienteBloqueSugeridoId: null,
        esDiaDescansoHoy: true,
      };
    }

    const bloques = rutinaActiva.bloques as BloqueDiaRutinaDTO[];

    // Sesiones registradas en la ventana semanal actual
    const sesionesSemana = await this.db
      .select()
      .from(sesionesEntrenamiento)
      .where(
        and(
          eq(sesionesEntrenamiento.alumnoId, alumnoId),
          gte(sesionesEntrenamiento.fechaProgramada, inicioSemana),
          lte(sesionesEntrenamiento.fechaProgramada, finSemana)
        )
      )
      .orderBy(asc(sesionesEntrenamiento.fechaProgramada), asc(sesionesEntrenamiento.createdAtUtc));

    // Determinar si hoy es día de descanso prescrito
    const bloquePrescritoParaHoy = bloques.find(
      (b, idx) => obtenerDiaSugeridoBloque(b, idx) === isoDay
    );
    const esDiaDescansoHoy = !bloquePrescritoParaHoy;

    // Primer bloque pendiente en orden secuencial
    const primerBloquePendiente = bloques.find((b) => {
      const completado = sesionesSemana.some(
        (s) =>
          s.estado === EstadoSesion.COMPLETADA &&
          (s.bloqueId === b.diaId || (!s.bloqueId && s.rutinaId === rutinaActiva.id))
      );
      return !completado;
    });

    const siguienteBloqueSugeridoId = primerBloquePendiente ? primerBloquePendiente.diaId : null;

    const bloquesProgreso: BloqueSemanaProgresoDTO[] = bloques.map((b, idx) => {
      const diaSugerido = obtenerDiaSugeridoBloque(b, idx);
      const sesionCompletada = sesionesSemana.find(
        (s) =>
          s.estado === EstadoSesion.COMPLETADA &&
          (s.bloqueId === b.diaId || (!s.bloqueId && s.rutinaId === rutinaActiva.id))
      );
      const sesionHoyBloque = sesionesSemana.find(
        (s) => s.bloqueId === b.diaId && s.fechaProgramada === hoyStr
      );
      const sesionRef = sesionCompletada || sesionHoyBloque;

      return {
        bloqueId: b.diaId,
        titulo: b.titulo,
        enfoque: b.enfoque ?? null,
        diaSugerido,
        totalEjercicios: b.ejercicios?.length ?? 0,
        completado: !!sesionCompletada,
        fechaCompletadaUtc: sesionCompletada
          ? toIsoUtcString(sesionCompletada.fechaFinUtc || sesionCompletada.updatedAtUtc)
          : null,
        fechaProgramada: sesionRef ? sesionRef.fechaProgramada : null,
        sesionId: sesionRef ? sesionRef.id : null,
        esSugeridoHoy: b.diaId === siguienteBloqueSugeridoId,
      };
    });

    const bloquesCompletados = bloquesProgreso.filter((b) => b.completado).length;
    const porcentajeCumplimiento = ((bloquesCompletados / bloques.length) * 100).toFixed(2);

    return {
      semanaIso,
      inicioSemana,
      finSemana,
      totalBloques: bloques.length,
      bloquesCompletados,
      porcentajeCumplimiento,
      bloques: bloquesProgreso,
      siguienteBloqueSugeridoId,
      esDiaDescansoHoy,
    };
  }

  /**
   * Consulta pasiva de rutina programada de hoy para el alumno (RN-04).
   * Soporta selección de bloque específico (bloqueId) y recuperación en días de descanso.
   * Si no se especifica bloqueId, sugiere de forma inteligente el primer bloque pendiente de la semana.
   */
  async obtenerSesionHoy(
    alumnoId: string,
    timezoneCliente?: string,
    bloqueId?: string
  ): Promise<SesionEntrenamientoDetalleDTO | null> {
    const tz = timezoneCliente || 'America/Caracas';
    let hoyStr: string;
    try {
      hoyStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    } catch {
      hoyStr = new Date().toISOString().split('T')[0];
    }

    const { inicioSemana, finSemana, isoDay } = calcularRangoSemanaIso(hoyStr);

    // Cargar rutina semanal activa
    const [rutinaActiva] = await this.db
      .select()
      .from(rutinas)
      .where(
        and(
          eq(rutinas.alumnoId, alumnoId),
          eq(rutinas.activa, true)
        )
      )
      .orderBy(desc(rutinas.createdAtUtc))
      .limit(1);

    const bloques: BloqueDiaRutinaDTO[] =
      rutinaActiva && Array.isArray(rutinaActiva.bloques)
        ? (rutinaActiva.bloques as BloqueDiaRutinaDTO[])
        : [];

    // Buscar sesiones de hoy para este alumno
    const sesionesHoy = await this.db
      .select()
      .from(sesionesEntrenamiento)
      .where(
        and(
          eq(sesionesEntrenamiento.alumnoId, alumnoId),
          eq(sesionesEntrenamiento.fechaProgramada, hoyStr)
        )
      )
      .orderBy(desc(sesionesEntrenamiento.createdAtUtc));

    // CASO A: El usuario especificó un bloqueId explícito (1-tap switch o recuperación)
    if (bloqueId && rutinaActiva) {
      // 1. ¿Existe ya una sesión para hoy con ese bloqueId?
      const sesionBloqueHoy = sesionesHoy.find((s) => s.bloqueId === bloqueId);
      if (sesionBloqueHoy) {
        return this.hidratarSesion(sesionBloqueHoy);
      }

      // 2. Si hay una sesión planificada no iniciada de hoy con otro bloque, reemplazarla limpiamente
      const sesionPlanificada = sesionesHoy.find((s) => s.estado === EstadoSesion.PLANIFICADA);
      if (sesionPlanificada) {
        const ejSesiones = await this.db
          .select({ id: ejerciciosSesion.id })
          .from(ejerciciosSesion)
          .where(eq(ejerciciosSesion.sesionId, sesionPlanificada.id));
        for (const ej of ejSesiones) {
          await this.db.delete(seriesRegistro).where(eq(seriesRegistro.ejercicioSesionId, ej.id));
        }
        await this.db.delete(ejerciciosSesion).where(eq(ejerciciosSesion.sesionId, sesionPlanificada.id));
        await this.db.delete(sesionesEntrenamiento).where(eq(sesionesEntrenamiento.id, sesionPlanificada.id));
      }

      // 3. Obtener el bloque solicitado
      const bloqueTarget = bloques.find((b) => b.diaId === bloqueId);
      if (!bloqueTarget) {
        return null;
      }

      const bloquePrescritoParaHoy = bloques.find(
        (b, idx) => obtenerDiaSugeridoBloque(b, idx) === isoDay
      );
      // Si hoy no estaba prescrito este bloque o es día de descanso, marcar como recuperación
      const esDiaDescansoOriginal = !bloquePrescritoParaHoy;

      return this.instanciarSesionDesdeBloque(
        alumnoId,
        rutinaActiva.id,
        rutinaActiva.entrenadorId,
        bloqueTarget,
        hoyStr,
        tz,
        esDiaDescansoOriginal
      );
    }

    // CASO B: Consulta pasiva estándar (sin bloqueId)
    // 1. Si ya existe una sesión para hoy, retornarla directamente
    if (sesionesHoy.length > 0) {
      return this.hidratarSesion(sesionesHoy[0]);
    }

    // 2. Si no hay rutina activa, no hay auto-generación posible
    if (!rutinaActiva || bloques.length === 0) {
      return null;
    }

    // 3. Consultar progreso semanal para encontrar el primer bloque pendiente
    const sesionesSemana = await this.db
      .select()
      .from(sesionesEntrenamiento)
      .where(
        and(
          eq(sesionesEntrenamiento.alumnoId, alumnoId),
          gte(sesionesEntrenamiento.fechaProgramada, inicioSemana),
          lte(sesionesEntrenamiento.fechaProgramada, finSemana)
        )
      )
      .orderBy(asc(sesionesEntrenamiento.fechaProgramada), asc(sesionesEntrenamiento.createdAtUtc));

    const bloquePrescritoParaHoy = bloques.find(
      (b, idx) => obtenerDiaSugeridoBloque(b, idx) === isoDay
    );
    const esDiaDescansoHoy = !bloquePrescritoParaHoy;

    // Si hoy es día de descanso prescrito y el alumno no pidió un bloque puntual:
    // Retornar null para que la UI muestre el estado de descanso y los accesos de recuperación
    if (esDiaDescansoHoy) {
      return null;
    }

    // Primer bloque pendiente de la semana
    const primerBloquePendiente = bloques.find((b) => {
      const comp = sesionesSemana.some(
        (s) =>
          s.estado === EstadoSesion.COMPLETADA &&
          (s.bloqueId === b.diaId || (!s.bloqueId && s.rutinaId === rutinaActiva.id))
      );
      return !comp;
    });

    // Si todos los bloques de la semana ya están completados:
    if (!primerBloquePendiente) {
      return null;
    }

    // Auto-generar para hoy el bloque sugerido (primer bloque pendiente)
    return this.instanciarSesionDesdeBloque(
      alumnoId,
      rutinaActiva.id,
      rutinaActiva.entrenadorId,
      primerBloquePendiente,
      hoyStr,
      tz,
      false
    );
  }

  /**
   * Helper atómico para crear e hidratar una sesión a partir de un bloque de rutina.
   */
  private async instanciarSesionDesdeBloque(
    alumnoId: string,
    rutinaId: string,
    entrenadorId: string,
    bloque: BloqueDiaRutinaDTO,
    fechaProgramada: string,
    timezoneCliente: string,
    esDiaDescansoOriginal: boolean
  ): Promise<SesionEntrenamientoDetalleDTO | null> {
    if (!bloque.ejercicios || bloque.ejercicios.length === 0) {
      return null;
    }

    const nuevaSesionId = crypto.randomUUID();
    const ahora = new Date();

    const [nuevaSesion] = await this.db
      .insert(sesionesEntrenamiento)
      .values({
        id: nuevaSesionId,
        alumnoId,
        rutinaId,
        bloqueId: bloque.diaId,
        esDiaDescansoOriginal,
        fechaProgramada,
        timezoneCliente,
        estado: EstadoSesion.PLANIFICADA,
        porcentajeCumplimiento: '0.00',
        volumenTotalKg: '0.00',
        createdAtUtc: ahora,
        updatedAtUtc: ahora,
      })
      .returning();

    for (let i = 0; i < bloque.ejercicios.length; i++) {
      const ej = bloque.ejercicios[i];
      let ejercicioCatalogoId = ej.ejercicioId;

      if (!ejercicioCatalogoId) {
        const [ejCatExistente] = await this.db
          .select()
          .from(ejerciciosCatalogo)
          .where(eq(ejerciciosCatalogo.nombre, ej.nombre))
          .limit(1);

        if (ejCatExistente) {
          ejercicioCatalogoId = ejCatExistente.id;
        } else {
          const nuevoEjId = crypto.randomUUID();
          const [creado] = await this.db
            .insert(ejerciciosCatalogo)
            .values({
              id: nuevoEjId,
              entrenadorId,
              nombre: ej.nombre,
              grupoMuscular: 'GENERAL',
              activo: true,
              createdAtUtc: ahora,
            })
            .returning();
          ejercicioCatalogoId = creado.id;
        }
      }

      const ejSesionId = crypto.randomUUID();
      await this.db.insert(ejerciciosSesion).values({
        id: ejSesionId,
        sesionId: nuevaSesionId,
        ejercicioId: ejercicioCatalogoId,
        orden: i + 1,
        notasCoach: `Bloque: ${bloque.titulo} • Reps: ${ej.reps} • Peso: ${ej.peso || 'Sugerido'}`,
        descansoPrescritoSegundos: ej.descansoSegundos || 90,
      });

      const numSeries = Math.max(1, ej.series || 3);
      const repsMatch = (ej.reps || '10').match(/\d+/);
      const targetReps = repsMatch ? parseInt(repsMatch[0], 10) : 10;
      const pesoMatch = (ej.peso || '0').match(/\d+(\.\d+)?/);
      const targetPeso = pesoMatch ? parseFloat(pesoMatch[0]).toFixed(2) : '0.00';
      const targetRpe = ej.rpe ? parseFloat(ej.rpe).toFixed(1) : null;

      for (let s = 1; s <= numSeries; s++) {
        await this.db.insert(seriesRegistro).values({
          id: crypto.randomUUID(),
          ejercicioSesionId: ejSesionId,
          numeroSerie: s,
          repsObjetivo: targetReps,
          repsLogradas: null,
          pesoKg: targetPeso,
          rpe: targetRpe,
          completada: false,
        });
      }
    }

    return this.hidratarSesion(nuevaSesion);
  }

  /**
   * Obtener historial cronológico de sesiones completadas o registradas de un alumno.
   */
  async obtenerHistorialSesionesAlumno(
    entrenadorId: string,
    alumnoId: string,
    rol: Rol,
    limit = 30
  ): Promise<SesionEntrenamientoDetalleDTO[]> {
    // 1. Validar si alumnoId es perfilesAlumno.id o perfilesAlumno.usuarioId
    let [perfil] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.id, alumnoId));

    if (!perfil) {
      [perfil] = await this.db
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.usuarioId, alumnoId));
    }

    if (!perfil) {
      throw new NotFoundException('El alumno especificado no existe.');
    }

    if (rol === Rol.ENTRENADOR && perfil.entrenadorId !== entrenadorId) {
      throw new ForbiddenException(
        'Aislamiento de Tenant: Acceso denegado a sesiones de un alumno de otro entrenador.'
      );
    }

    const usuarioAlumnoId = perfil.usuarioId;

    const sesiones = await this.db
      .select()
      .from(sesionesEntrenamiento)
      .where(eq(sesionesEntrenamiento.alumnoId, usuarioAlumnoId))
      .orderBy(
        desc(sesionesEntrenamiento.fechaProgramada),
        desc(sesionesEntrenamiento.createdAtUtc)
      )
      .limit(limit);

    const resultado: SesionEntrenamientoDetalleDTO[] = [];
    for (const s of sesiones) {
      resultado.push(await this.hidratarSesion(s));
    }

    return resultado;
  }

  /**
   * Obtener detalle completo de una sesión por ID con verificación de permisos.
   */
  async obtenerSesionPorId(
    sesionId: string,
    usuarioId: string,
    rol: Rol,
    entrenadorId?: string
  ): Promise<SesionEntrenamientoDetalleDTO> {
    const [sesion] = await this.db
      .select()
      .from(sesionesEntrenamiento)
      .where(eq(sesionesEntrenamiento.id, sesionId))
      .limit(1);

    if (!sesion) {
      throw new NotFoundException(`Sesión de entrenamiento con ID '${sesionId}' no encontrada.`);
    }

    // Validación de acceso por rol
    if (rol === Rol.ALUMNO && sesion.alumnoId !== usuarioId) {
      throw new ForbiddenException('No tienes permiso para acceder a esta sesión de entrenamiento.');
    }

    if (rol === Rol.ENTRENADOR) {
      const coachId = entrenadorId || usuarioId;
      const [perfil] = await this.db
        .select()
        .from(perfilesAlumno)
        .where(
          and(
            eq(perfilesAlumno.usuarioId, sesion.alumnoId),
            eq(perfilesAlumno.entrenadorId, coachId)
          )
        )
        .limit(1);

      if (!perfil) {
        throw new ForbiddenException(
          'Aislamiento de Tenant: La sesión pertenece a un alumno de otro entrenador.'
        );
      }
    }

    return this.hidratarSesion(sesion);
  }

  /**
   * Obtener la última sesión registrada (completada o en progreso) de un alumno específico.
   * Con validación de aislamiento de Tenancy (el alumno debe pertenecer al entrenador).
   * Acepta alumnoId como `perfiles_alumno.id` o como `usuarios.id` (perfiles_alumno.usuario_id).
   */
  async obtenerUltimaSesionAlumno(
    entrenadorId: string,
    alumnoId: string,
    rol: Rol
  ): Promise<SesionEntrenamientoDetalleDTO | null> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(alumnoId)) {
      return null;
    }

    let targetUsuarioId = alumnoId;

    if (rol !== Rol.SUPERADMIN) {
      const [perfil] = await this.db
        .select()
        .from(perfilesAlumno)
        .where(
          and(
            or(
              eq(perfilesAlumno.id, alumnoId),
              eq(perfilesAlumno.usuarioId, alumnoId)
            ),
            isNull(perfilesAlumno.deletedAtUtc)
          )
        )
        .limit(1);

      if (!perfil) {
        throw new NotFoundException(`Alumno con ID '${alumnoId}' no encontrado.`);
      }

      if (perfil.entrenadorId !== entrenadorId) {
        throw new ForbiddenException(
          'Aislamiento de Tenant: El alumno pertenece a otro entrenador.'
        );
      }

      targetUsuarioId = perfil.usuarioId;
    } else {
      const [perfil] = await this.db
        .select()
        .from(perfilesAlumno)
        .where(
          or(
            eq(perfilesAlumno.id, alumnoId),
            eq(perfilesAlumno.usuarioId, alumnoId)
          )
        )
        .limit(1);

      if (perfil) {
        targetUsuarioId = perfil.usuarioId;
      }
    }

    const [sesion] = await this.db
      .select()
      .from(sesionesEntrenamiento)
      .where(eq(sesionesEntrenamiento.alumnoId, targetUsuarioId))
      .orderBy(
        desc(sesionesEntrenamiento.fechaProgramada),
        desc(sesionesEntrenamiento.createdAtUtc)
      )
      .limit(1);

    if (!sesion) {
      return null;
    }

    return this.hidratarSesion(sesion);
  }

  // ---------------------------------------------------------------------------
  // 4. INICIO DE SESIÓN (ACCIÓN EXPLÍCITA, RN-04, RN-05, ADR-002)
  // ---------------------------------------------------------------------------

  /**
   * Iniciar sesión conscientemente: transiciona de 'planificada' a 'en_progreso'.
   * Captura fechaInicioUtc con 'Z' y timezoneCliente.
   */
  async iniciarSesion(
    sesionId: string,
    alumnoId: string,
    input: IniciarSesionDTO
  ): Promise<SesionEntrenamientoDetalleDTO> {
    const validado = IniciarSesionSchema.parse(input);

    const [sesion] = await this.db
      .select()
      .from(sesionesEntrenamiento)
      .where(eq(sesionesEntrenamiento.id, sesionId))
      .limit(1);

    if (!sesion) {
      throw new NotFoundException(`Sesión con ID '${sesionId}' no encontrada.`);
    }

    if (sesion.alumnoId !== alumnoId) {
      throw new ForbiddenException('No tienes autorización para iniciar esta sesión.');
    }

    if (sesion.estado !== EstadoSesion.PLANIFICADA) {
      throw new BadRequestException(
        `Transición inválida: No se puede iniciar una sesión en estado '${sesion.estado}'. Solo se permite desde 'planificada'.`
      );
    }

    const fechaInicioUtc = validado.fechaInicioUtc ?? new Date().toISOString();
    if (!fechaInicioUtc.endsWith('Z')) {
      throw new BadRequestException(
        `El timestamp de inicio '${fechaInicioUtc}' debe estar en UTC estricto (terminar en 'Z').`
      );
    }

    await this.db
      .update(sesionesEntrenamiento)
      .set({
        estado: EstadoSesion.EN_PROGRESO,
        fechaInicioUtc: new Date(fechaInicioUtc),
        timezoneCliente: validado.timezoneCliente,
        updatedAtUtc: new Date(),
      })
      .where(eq(sesionesEntrenamiento.id, sesionId));

    return this.obtenerSesionPorId(sesionId, alumnoId, Rol.ALUMNO);
  }

  // ---------------------------------------------------------------------------
  // 5. REGISTRO DE SERIES Y SINCRONIZACIÓN BATCH (RN-01, OFFLINE-FIRST)
  // ---------------------------------------------------------------------------

  /**
   * Sincronizar lote de series completadas en una sesión en progreso.
   * Valida estado 'en_progreso', pesoKg con hasta 2 decimales y reps >= 0.
   */
  async sincronizarSeries(
    sesionId: string,
    alumnoId: string,
    input: SincronizarSeriesBatchDTO
  ): Promise<SesionEntrenamientoDetalleDTO> {
    const validado = SincronizarSeriesBatchSchema.parse(input);

    const [sesion] = await this.db
      .select()
      .from(sesionesEntrenamiento)
      .where(eq(sesionesEntrenamiento.id, sesionId))
      .limit(1);

    if (!sesion) {
      throw new NotFoundException(`Sesión con ID '${sesionId}' no encontrada.`);
    }

    if (sesion.alumnoId !== alumnoId) {
      throw new ForbiddenException('No tienes permiso para actualizar esta sesión.');
    }

    if (sesion.estado !== EstadoSesion.EN_PROGRESO) {
      throw new BadRequestException(
        `Operación denegada: Solo se pueden registrar series en sesiones con estado 'en_progreso'. Estado actual: '${sesion.estado}'.`
      );
    }

    // Obtener los ejercicios de la sesión para validar pertenencia de las series
    const ejSesiones = await this.db
      .select()
      .from(ejerciciosSesion)
      .where(eq(ejerciciosSesion.sesionId, sesionId));

    const ejSesionIds = ejSesiones.map((e) => e.id);
    if (ejSesionIds.length === 0) {
      throw new BadRequestException('La sesión no contiene ejercicios asociados.');
    }

    const seriesExistentes: any[] = [];
    for (const ejId of ejSesionIds) {
      const rows = await this.db
        .select()
        .from(seriesRegistro)
        .where(eq(seriesRegistro.ejercicioSesionId, ejId));
      seriesExistentes.push(...rows);
    }

    const seriesMap = new Map(seriesExistentes.map((s) => [s.id, s]));

    for (const sInput of validado.series) {
      const serie = seriesMap.get(sInput.serieId);
      if (!serie) {
        throw new BadRequestException(
          `Serie con ID '${sInput.serieId}' no pertenece a esta sesión de entrenamiento.`
        );
      }

      let pesoKgFinal = '0.00';
      if (sInput.pesoKg !== null && sInput.pesoKg !== undefined && sInput.pesoKg !== '') {
        if (!DECIMAL_STRING_REGEX.test(sInput.pesoKg)) {
          throw new BadRequestException(
            `Formato de peso inválido: '${sInput.pesoKg}'. Debe ser un string decimal con hasta 2 decimales.`
          );
        }
        pesoKgFinal = sInput.pesoKg;
      }

      let rpeFinal: string | null = null;
      if (sInput.rpe !== null && sInput.rpe !== undefined && sInput.rpe !== '') {
        rpeFinal = sInput.rpe;
      }

      if (sInput.repsLogradas < 0) {
        throw new BadRequestException('Las repeticiones logradas no pueden ser negativas.');
      }

      const timestampUtc = sInput.timestampCompletadaUtc
        ? new Date(sInput.timestampCompletadaUtc)
        : new Date();

      await this.db
        .update(seriesRegistro)
        .set({
          repsLogradas: sInput.repsLogradas,
          pesoKg: pesoKgFinal,
          rpe: rpeFinal,
          descansoSegundos: sInput.descansoSegundos !== undefined ? sInput.descansoSegundos : (serie.descansoSegundos ?? null),
          completada: sInput.completada,
          timestampCompletadaUtc: timestampUtc,
        })
        .where(eq(seriesRegistro.id, sInput.serieId));
    }

    return this.obtenerSesionPorId(sesionId, alumnoId, Rol.ALUMNO);
  }

  // ---------------------------------------------------------------------------
  // 6. FINALIZACIÓN DE SESIÓN Y REGLA DE RACHA (RN-02)
  // ---------------------------------------------------------------------------

  /**
   * Finalizar sesión de entrenamiento.
   * Calcula porcentajeCumplimiento = (series completadas / series totales * 100).
   * Evalúa regla de racha (>= 70%), estampa fechaFinUtc en ISO UTC 'Z' y estado 'completada'.
   */
  async finalizarSesion(
    sesionId: string,
    alumnoId: string,
    input: FinalizarSesionDTO,
    rachaActual = 0
  ): Promise<{
    sesion: SesionEntrenamientoDetalleDTO;
    cumpleReglaRacha: boolean;
    nuevaRacha: number;
    duracionMinutos: number | null;
    volumenTotalKg?: string;
  }> {
    const validado = FinalizarSesionSchema.parse(input);

    const [sesion] = await this.db
      .select()
      .from(sesionesEntrenamiento)
      .where(eq(sesionesEntrenamiento.id, sesionId))
      .limit(1);

    if (!sesion) {
      throw new NotFoundException(`Sesión con ID '${sesionId}' no encontrada.`);
    }

    if (sesion.alumnoId !== alumnoId) {
      throw new ForbiddenException('No tienes permiso para finalizar esta sesión.');
    }

    if (sesion.estado !== EstadoSesion.EN_PROGRESO) {
      throw new BadRequestException(
        `Operación denegada: No se puede finalizar una sesión que no esté 'en_progreso'. Estado actual: '${sesion.estado}'.`
      );
    }

    // Contar series totales y completadas
    const ejSesiones = await this.db
      .select()
      .from(ejerciciosSesion)
      .where(eq(ejerciciosSesion.sesionId, sesionId));

    const ejSesionIds = ejSesiones.map((e) => e.id);
    let totalSeries = 0;
    let seriesCompletadas = 0;
    let volumenTotalKgStr = '0.00';

    if (ejSesionIds.length > 0) {
      const allSeries: any[] = [];
      for (const ejId of ejSesionIds) {
        const rows = await this.db
          .select()
          .from(seriesRegistro)
          .where(eq(seriesRegistro.ejercicioSesionId, ejId));
        allSeries.push(...rows);
      }

      totalSeries = allSeries.length;
      let volumenAcumuladoKg = 0;
      for (const s of allSeries) {
        if (s.completada) {
          seriesCompletadas++;
          const reps = s.repsLogradas ?? s.repsObjetivo ?? 0;
          const peso = parseFloat(s.pesoKg || '0') || 0;
          volumenAcumuladoKg += reps * peso;
        }
      }

      volumenTotalKgStr = volumenAcumuladoKg.toFixed(2);
    }

    const porcentajeNumero = totalSeries > 0 ? (seriesCompletadas / totalSeries) * 100 : 0;
    const porcentajeCumplimientoStr = porcentajeNumero.toFixed(2);
    const volumenTotalKgFinal = volumenTotalKgStr;
    const cumpleReglaRacha = porcentajeNumero >= 70.0;
    const nuevaRacha = cumpleReglaRacha ? rachaActual + 1 : rachaActual;

    const fechaFinUtc = validado.fechaFinUtc ?? new Date().toISOString();
    if (!fechaFinUtc.endsWith('Z')) {
      throw new BadRequestException(
        `El timestamp de finalización '${fechaFinUtc}' debe terminar en 'Z' (UTC).`
      );
    }

    const duracionMinutos = calcularDuracionMinutos(sesion.fechaInicioUtc, fechaFinUtc);

    await this.db
      .update(sesionesEntrenamiento)
      .set({
        estado: EstadoSesion.COMPLETADA,
        fechaFinUtc: new Date(fechaFinUtc),
        porcentajeCumplimiento: porcentajeCumplimientoStr,
        volumenTotalKg: volumenTotalKgFinal,
        notasAlumno: validado.notasAlumno !== undefined ? validado.notasAlumno : sesion.notasAlumno,
        updatedAtUtc: new Date(),
      })
      .where(eq(sesionesEntrenamiento.id, sesionId));

    const sesionDetalle = await this.obtenerSesionPorId(sesionId, alumnoId, Rol.ALUMNO);
    sesionDetalle.cumpleReglaRacha = cumpleReglaRacha;
    sesionDetalle.duracionMinutos = duracionMinutos;
    sesionDetalle.volumenTotalKg = volumenTotalKgFinal;

    return {
      sesion: sesionDetalle,
      cumpleReglaRacha,
      nuevaRacha,
      duracionMinutos,
      volumenTotalKg: volumenTotalKgFinal,
    };
  }

  // ---------------------------------------------------------------------------
  // 7. MONITOR SEMANAL DE ADHERENCIA DEL COACH (RN-03)
  // ---------------------------------------------------------------------------

  /**
   * Monitor semanal de adherencia del coach:
   * Evalúa sesiones ejecutadas vs planificadas en los últimos 7 días.
   * Aplica semáforos verde, amarillo y rojo (con regla de inactividad > 4 días).
   * Ordena por nivel de riesgo (ROJO al tope).
   */
  async calcularSemanaAdherencia(entrenadorId: string): Promise<MonitorAdherenciaSemanalDTO[]> {
    // 1. Obtener alumnos activos del entrenador
    const alumnos = await this.db
      .select()
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.entrenadorId, entrenadorId),
          isNull(perfilesAlumno.deletedAtUtc)
        )
      );

    if (alumnos.length === 0) {
      return [];
    }

    const hoy = new Date();
    const hace7Dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hace7DiasStr = hace7Dias.toISOString().split('T')[0];
    const hoyStr = hoy.toISOString().split('T')[0];

    const resultados: MonitorAdherenciaSemanalDTO[] = [];

    for (const alumno of alumnos) {
      // Sesiones en la ventana semanal
      const sesionesSemana = await this.db
        .select()
        .from(sesionesEntrenamiento)
        .where(
          and(
            eq(sesionesEntrenamiento.alumnoId, alumno.usuarioId),
            gte(sesionesEntrenamiento.fechaProgramada, hace7DiasStr),
            lte(sesionesEntrenamiento.fechaProgramada, hoyStr)
          )
        );

      const sesionesPrescritas = sesionesSemana.length;
      const sesionesCompletadas = sesionesSemana.filter(
        (s) => s.estado === EstadoSesion.COMPLETADA
      ).length;

      // Última sesión completada histórica para calcular inactividad
      const [ultimaSesionCompletada] = await this.db
        .select()
        .from(sesionesEntrenamiento)
        .where(
          and(
            eq(sesionesEntrenamiento.alumnoId, alumno.usuarioId),
            eq(sesionesEntrenamiento.estado, EstadoSesion.COMPLETADA)
          )
        )
        .orderBy(desc(sesionesEntrenamiento.fechaFinUtc))
        .limit(1);

      let diasInactivo = 0;
      let ultimaSesionUtc: string | null = null;

      if (ultimaSesionCompletada && ultimaSesionCompletada.fechaFinUtc) {
        ultimaSesionUtc = toIsoUtcString(ultimaSesionCompletada.fechaFinUtc);
        const finMs = new Date(ultimaSesionCompletada.fechaFinUtc).getTime();
        const diffDias = Math.floor((hoy.getTime() - finMs) / (1000 * 60 * 60 * 24));
        diasInactivo = Math.max(0, diffDias);
      } else {
        diasInactivo = 7; // Inactividad máxima por defecto si nunca ha entrenado
      }

      const adherencia = evaluarAdherenciaSemanal(
        sesionesPrescritas,
        sesionesCompletadas,
        diasInactivo
      );

      // Racha estimada
      const rachaDiasConsecutivos =
        adherencia.semaforoAdherencia === SemaforoAdherencia.VERDE
          ? sesionesCompletadas
          : 0;

      resultados.push({
        alumnoId: alumno.usuarioId,
        nombreCompleto: `${alumno.nombres} ${alumno.apellidos}`.trim(),
        sesionesPrescritas,
        sesionesCompletadas,
        porcentajeCumplimientoSemanal: adherencia.porcentajeCumplimientoSemanal,
        semaforoAdherencia: adherencia.semaforoAdherencia,
        rachaDiasConsecutivos,
        diasInactivo,
        ultimaSesionUtc,
      });
    }

    // Ordenar por nivel de riesgo: ROJO (3) -> AMARILLO (2) -> VERDE (1)
    const pesoRiesgo: Record<SemaforoAdherencia, number> = {
      [SemaforoAdherencia.ROJO]: 3,
      [SemaforoAdherencia.AMARILLO]: 2,
      [SemaforoAdherencia.VERDE]: 1,
    };

    return resultados.sort(
      (a, b) => pesoRiesgo[b.semaforoAdherencia] - pesoRiesgo[a.semaforoAdherencia]
    );
  }

  // ---------------------------------------------------------------------------
  // HELPER: HIDRATACIÓN DE SESIÓN CON EJERCICIOS Y SERIES
  // ---------------------------------------------------------------------------

  private async hidratarSesion(sesion: any): Promise<SesionEntrenamientoDetalleDTO> {
    const ejSesiones = await this.db
      .select()
      .from(ejerciciosSesion)
      .where(eq(ejerciciosSesion.sesionId, sesion.id))
      .orderBy(asc(ejerciciosSesion.orden));

    const ejSesionIds = ejSesiones.map((e) => e.id);
    const ejercicioIds = ejSesiones.map((e) => e.ejercicioId);

    // Cargar catálogo de ejercicios
    const ejerciciosCatalogoMap = new Map<string, any>();
    for (const ejId of ejercicioIds) {
      const [cat] = await this.db
        .select()
        .from(ejerciciosCatalogo)
        .where(eq(ejerciciosCatalogo.id, ejId))
        .limit(1);
      if (cat) {
        ejerciciosCatalogoMap.set(cat.id, cat);
      }
    }

    // Cargar series de los ejercicios
    const seriesMap = new Map<string, SerieRegistroDetalleDTO[]>();
    for (const ejSesionId of ejSesionIds) {
      const seriesRows = await this.db
        .select()
        .from(seriesRegistro)
        .where(eq(seriesRegistro.ejercicioSesionId, ejSesionId))
        .orderBy(asc(seriesRegistro.numeroSerie));

      for (const s of seriesRows) {
        if (!seriesMap.has(s.ejercicioSesionId)) {
          seriesMap.set(s.ejercicioSesionId, []);
        }
        seriesMap.get(s.ejercicioSesionId)!.push({
          id: s.id,
          ejercicioSesionId: s.ejercicioSesionId,
          numeroSerie: s.numeroSerie,
          repsObjetivo: s.repsObjetivo,
          repsLogradas: s.repsLogradas,
          pesoKg: s.pesoKg,
          rpe: s.rpe,
          descansoSegundos: s.descansoSegundos ?? null,
          completada: s.completada,
          timestampCompletadaUtc: toIsoUtcString(s.timestampCompletadaUtc),
        });
      }
    }

    // Nombre del alumno si está disponible
    let alumnoNombre: string | undefined;
    const [perfilAlumno] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, sesion.alumnoId))
      .limit(1);

    if (perfilAlumno) {
      alumnoNombre = `${perfilAlumno.nombres} ${perfilAlumno.apellidos}`.trim();
    }

    const duracionMinutos = calcularDuracionMinutos(sesion.fechaInicioUtc, sesion.fechaFinUtc);
    const cumplimientoNum = parseFloat(sesion.porcentajeCumplimiento || '0');
    const cumpleReglaRacha = sesion.estado === EstadoSesion.COMPLETADA && cumplimientoNum >= 70.0;

    const ejerciciosHydrated: EjercicioSesionDetalleDTO[] = ejSesiones.map((e) => {
      const cat = ejerciciosCatalogoMap.get(e.ejercicioId);
      return {
        id: e.id,
        sesionId: e.sesionId,
        ejercicioId: e.ejercicioId,
        orden: e.orden,
        notasCoach: e.notasCoach,
        descansoPrescritoSegundos: e.descansoPrescritoSegundos ?? 90,
        ejercicio: cat
          ? {
              id: cat.id,
              entrenadorId: cat.entrenadorId,
              nombre: cat.nombre,
              grupoMuscular: cat.grupoMuscular,
              patronMovimiento: cat.patronMovimiento,
              videoUrl: cat.videoUrl,
              activo: cat.activo,
              createdAtUtc: toIsoUtcString(cat.createdAtUtc)!,
            }
          : undefined,
        series: seriesMap.get(e.id) || [],
      };
    });

    return {
      id: sesion.id,
      alumnoId: sesion.alumnoId,
      rutinaId: sesion.rutinaId,
      bloqueId: sesion.bloqueId ?? null,
      esDiaDescansoOriginal: sesion.esDiaDescansoOriginal ?? false,
      fechaProgramada: sesion.fechaProgramada,
      fechaInicioUtc: toIsoUtcString(sesion.fechaInicioUtc),
      fechaFinUtc: toIsoUtcString(sesion.fechaFinUtc),
      timezoneCliente: sesion.timezoneCliente,
      estado: sesion.estado,
      porcentajeCumplimiento: sesion.porcentajeCumplimiento || '0.00',
      volumenTotalKg: (sesion as any).volumenTotalKg || '0.00',
      notasAlumno: sesion.notasAlumno,
      ejercicios: ejerciciosHydrated,
      alumnoNombre,
      duracionMinutos,
      cumpleReglaRacha,
      createdAtUtc: toIsoUtcString(sesion.createdAtUtc)!,
      updatedAtUtc: toIsoUtcString(sesion.updatedAtUtc)!,
    };
  }
}
