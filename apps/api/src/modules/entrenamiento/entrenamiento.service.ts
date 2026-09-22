import {
  Injectable,
  Inject,
  Optional,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SesionAlumnoFinalizadaEvent } from '../notificaciones/events/eventos-notificacion';
import {
  Database,
  WithTenantFn,
  eq,
  and,
  or,
  isNull,
  isNotNull,
  desc,
  asc,
  inArray,
  gte,
  lte,
  max,
  count,
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
  EstadoAlumno,
  MotivoOmision,
  TipoCierreSesion,
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
  EntrenarBloqueHoyDTO,
  IniciarSesionDTO,
  IniciarSesionSchema,
  SincronizarSeriesBatchDTO,
  SincronizarSeriesBatchSchema,
  FinalizarSesionDTO,
  FinalizarSesionSchema,
  FinalizarSesionResponseDTO,
  EjercicioCatalogoDetalleDTO,
  SesionEntrenamientoDetalleDTO,
  EjercicioSesionDetalleDTO,
  SerieRegistroDetalleDTO,
  HistorialSesionesAlumnoDTO,
  MonitorAdherenciaSemanalDTO,
  MonitorAdherenciaDTO,
  ResumenMonitorAdherenciaDTO,
  FiltroMonitorAdherenciaDTO,
  LIMITE_HISTORIAL_SESIONES_POR_DEFECTO,
  LIMITE_MONITOR_ADHERENCIA_POR_DEFECTO,
  DECIMAL_STRING_REGEX,
} from '@guachafit/shared';
import {
  evaluarAdherenciaSemanal,
  calcularRangoSemanaIso,
  obtenerDiaSugeridoBloque,
  obtenerFechaLocalYyyyMmDd,
  fechaAnteriorYyyyMmDd,
  calcularVentanaSemana,
  contarBloquesPrescritosHasta,
  diferenciaDiasCalendario,
  filtrarMonitorAdherencia,
  ordenarMonitorPorNombre,
  ordenarMonitorPorRiesgo,
} from '../../common/adherencia.util';

// Re-export de helpers puros compartidos: mantiene la API pública histórica del
// servicio (tests y consumidores) y la única fuente de verdad en `adherencia.util.ts`.
export {
  evaluarAdherenciaSemanal,
  calcularRangoSemanaIso,
  obtenerDiaSugeridoBloque,
  obtenerFechaLocalYyyyMmDd,
  fechaAnteriorYyyyMmDd,
  calcularVentanaSemana,
  contarBloquesPrescritosHasta,
  diferenciaDiasCalendario,
} from '../../common/adherencia.util';

// =============================================================================
// FUNCIONES PURAS DE DOMINIO: EVALUACIÓN DE ADHERENCIA Y RACHA (RF-001)
// =============================================================================

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

// =============================================================================
// HELPERS PUROS: FECHA LOCAL, RACHA Y CUMPLIMIENTO POR VOLUMEN (RF-001 RN-02)
// =============================================================================

/** Serie mínima requerida para evaluar la regla de racha por volumen. */
export interface SerieParaRacha {
  pesoPrescritoKg?: string | null;
  pesoKg?: string | null;
  repsObjetivo: number;
  repsLogradas?: number | null;
  completada: boolean;
}

export interface EvaluacionRacha {
  cumple: boolean;
  /** Σ (peso real × reps logradas) de series completadas con peso prescrito. */
  volumenRealizadoKg: number;
  /** Σ (peso prescrito × reps objetivo) de todas las series con peso prescrito. */
  volumenPrescritoKg: number;
  /** Ratio ponderado de volumen (null si no existe parte ponderada). */
  ratioVolumenPct: number | null;
  /** Ratio de series completadas/prescritas sin peso prescrito (null si no existe esa parte). */
  ratioSeriesPct: number | null;
}

/**
 * RN-02 (RF-001): regla del 70% combinando dos partes:
 *  - Parte ponderada (series con peso prescrito > 0): Σ(peso real × reps logradas) / Σ(peso prescrito × reps objetivo).
 *  - Parte cualitativa (series sin peso prescrito o con peso prescrito 0.00): series completadas / series prescritas.
 * `cumple` es true solo si TODAS las partes existentes alcanzan >= 70%.
 * Si no existe la parte ponderada, aplica únicamente el ratio de series (comportamiento legacy).
 */
export function evaluarCumplimientoRachaPorVolumen(series: SerieParaRacha[]): EvaluacionRacha {
  let volumenRealizadoKg = 0;
  let volumenPrescritoKg = 0;

  let seriesCualitativas = 0;
  let seriesCualitativasCompletadas = 0;

  for (const s of series) {
    const pesoPrescrito = parseFloat(s.pesoPrescritoKg || '0') || 0;
    if (pesoPrescrito > 0) {
      const repsObjetivo = s.repsObjetivo ?? 0;
      volumenPrescritoKg += pesoPrescrito * repsObjetivo;
      if (s.completada) {
        const repsLogradas = s.repsLogradas ?? repsObjetivo;
        const pesoReal = parseFloat(s.pesoKg || '0') || 0;
        volumenRealizadoKg += pesoReal * repsLogradas;
      }
    } else {
      seriesCualitativas++;
      if (s.completada) seriesCualitativasCompletadas++;
    }
  }

  const ratioVolumenPct =
    volumenPrescritoKg > 0 ? (volumenRealizadoKg / volumenPrescritoKg) * 100 : null;
  const ratioSeriesPct =
    seriesCualitativas > 0 ? (seriesCualitativasCompletadas / seriesCualitativas) * 100 : null;

  const partes: boolean[] = [];
  if (ratioVolumenPct !== null) partes.push(ratioVolumenPct >= 70.0);
  if (ratioSeriesPct !== null) partes.push(ratioSeriesPct >= 70.0);

  return {
    cumple: partes.length > 0 && partes.every(Boolean),
    volumenRealizadoKg,
    volumenPrescritoKg,
    ratioVolumenPct,
    ratioSeriesPct,
  };
}

export interface RachaEstado {
  rachaDias: number;
  rachaUltimaFecha: string | null;
}

export interface RachaActualizada extends RachaEstado {
  incrementada: boolean;
}

/**
 * Actualiza la racha al finalizar una sesión:
 *  - cumple=false → NO modifica la racha almacenada.
 *  - cumple=true y racha_ultima_fecha == fechaLocal → sin cambio (mismo día no duplica).
 *  - cumple=true y racha_ultima_fecha == ayer → +1.
 *  - cumple=true y gap (o sin registro previo) → reinicia a 1.
 */
export function actualizarRacha(
  estado: RachaEstado,
  fechaLocal: string,
  cumple: boolean
): RachaActualizada {
  if (!cumple) {
    return { ...estado, incrementada: false };
  }

  if (estado.rachaUltimaFecha === fechaLocal) {
    return { ...estado, incrementada: false };
  }

  const ayer = fechaAnteriorYyyyMmDd(fechaLocal, 1);
  const nuevaRacha =
    estado.rachaUltimaFecha === ayer ? Math.max(1, (estado.rachaDias ?? 0) + 1) : 1;

  return { rachaDias: nuevaRacha, rachaUltimaFecha: fechaLocal, incrementada: true };
}

/**
 * Racha efectiva para DTO/monitor: si `rachaUltimaFecha` es anterior a ayer, la cadena
 * se considera rota y se muestra 0. Si es hoy o ayer, se muestra `rachaDias`.
 */
export function calcularRachaEfectiva(
  rachaDias: number,
  rachaUltimaFecha: string | null | undefined,
  fechaLocal: string
): number {
  if (!rachaUltimaFecha) return 0;
  const ayer = fechaAnteriorYyyyMmDd(fechaLocal, 1);
  if (rachaUltimaFecha < ayer) return 0;
  return Math.max(0, rachaDias ?? 0);
}

// =============================================================================
// SERVICIO DE ENTRENAMIENTO (RF-001)
// =============================================================================

@Injectable()
export class EntrenamientoService {
  private readonly logger = new Logger(EntrenamientoService.name);

  // RNF-002 §4: store de idempotencia en memoria para reintentos inmediatos por lag de red.
  // Misma operación + mismo usuario + misma X-Idempotency-Key => se devuelve el resultado
  // original sin reaplicar la mutación (mismo patrón que FinanzasService.reportarPago).
  private readonly idempotencyCache = new Map<string, unknown>();

  private claveIdempotencia(
    operacion: 'entrenar-hoy' | 'iniciar' | 'series' | 'finalizar',
    alumnoId: string,
    idempotencyKey?: string
  ): string | null {
    const key = (idempotencyKey ?? '').trim();
    if (!key) return null;
    return `${operacion}:${alumnoId}:${key}`;
  }

  private leerRespuestaIdempotente<T>(clave: string | null): T | null {
    if (!clave || !this.idempotencyCache.has(clave)) return null;
    // Copia defensiva: el reintento nunca comparte referencias mutables con la respuesta original.
    return JSON.parse(JSON.stringify(this.idempotencyCache.get(clave))) as T;
  }

  private guardarRespuestaIdempotente(clave: string | null, respuesta: unknown): void {
    if (clave) this.idempotencyCache.set(clave, respuesta);
  }

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    // RNF-003/ADR-009: toda consulta a `rutinas` (tabla con RLS habilitado) corre
    // dentro de este envoltorio transaccional con el GUC del tenant aplicado.
    @Inject(WITH_TENANT) private readonly withTenant: WithTenantFn,
    // RF-014 RN-01: el servicio de negocio SOLO publica eventos de dominio en el bus.
    @Optional() private readonly eventEmitter?: EventEmitter2
  ) {}

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
            // `pesoKg` es SIEMPRE el peso real; arranca vacío hasta que el alumno sincronice.
            pesoKg: null,
            pesoPrescritoKg: sInput.pesoPrescritoKg ?? sInput.pesoSugeridoKg ?? null,
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

    const ahora = new Date();
    const nuevaRutinaId = crypto.randomUUID();
    const nombre = validado.nombreRutina?.trim() || 'Planificación Semanal Activa';

    // RNF-003/ADR-009: `rutinas` tiene RLS habilitado; desactivación + alta corren en
    // una única transacción con el GUC del tenant (además, ahora son atómicas).
    const nuevaRutina = await this.withTenant({ entrenadorId }, async (tx) => {
      // Desactivar rutinas previas
      await tx
        .update(rutinas)
        .set({
          activa: false,
          updatedAtUtc: ahora,
        })
        .where(
          and(
            eq(rutinas.alumnoId, usuarioAlumnoId),
            eq(rutinas.activa, true)
          )
        );

      const [creada] = await tx
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

      return creada;
    });

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

    // RNF-003/ADR-009: consulta tenant-scoped dentro de withTenant.
    // - ENTRENADOR: matchea por `entrenador_id`.
    // - ALUMNO: matchea por `alumno_id = current_usuario_id` (política self_select).
    // - SUPERADMIN: bypass explícito vía `app.is_superadmin`.
    const [rutina] = await this.withTenant(
      {
        entrenadorId,
        usuarioId: currentUserId,
        isSuperadmin: rol === Rol.SUPERADMIN,
      },
      async (tx) =>
        tx
          .select()
          .from(rutinas)
          .where(
            and(
              eq(rutinas.alumnoId, usuarioAlumnoId),
              eq(rutinas.activa, true)
            )
          )
          .orderBy(desc(rutinas.createdAtUtc))
          .limit(1)
    );

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
   * Incluye la racha efectiva del alumno (RN-02) y el estado/motivo de las sesiones OMITIDA.
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

    // RN-02: racha efectiva del alumno (no depende de tener rutina activa).
    const [perfilAlumno] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, alumnoId))
      .limit(1);
    const rachaDias = calcularRachaEfectiva(
      perfilAlumno?.rachaDias ?? 0,
      perfilAlumno?.rachaUltimaFecha ?? null,
      hoyStr
    );

    // RNF-003/ADR-009: la rutina activa se lee con el GUC del alumno autenticado
    // (política self_select `alumno_id = current_usuario_id`).
    const [rutinaActiva] = await this.withTenant({ usuarioId: alumnoId }, async (tx) =>
      tx
        .select()
        .from(rutinas)
        .where(
          and(
            eq(rutinas.alumnoId, alumnoId),
            eq(rutinas.activa, true)
          )
        )
        .orderBy(desc(rutinas.createdAtUtc))
        .limit(1)
    );

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
        rachaDias,
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
      const sesionesBloque = sesionesSemana.filter(
        (s) => s.bloqueId === b.diaId || (!s.bloqueId && s.rutinaId === rutinaActiva.id)
      );
      const sesionCompletada = sesionesBloque.find((s) => s.estado === EstadoSesion.COMPLETADA);
      // La sesión de hoy más reciente del bloque (puede ser OMITIDA o EN_PROGRESO tras repetir)
      const sesionHoyBloque = [...sesionesBloque]
        .reverse()
        .find((s) => s.fechaProgramada === hoyStr);
      const sesionRef =
        sesionCompletada || sesionHoyBloque || sesionesBloque[sesionesBloque.length - 1];

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
        estadoSesion: sesionRef ? (sesionRef.estado as EstadoSesion) : null,
        motivoOmision: (sesionRef?.motivoOmision as MotivoOmision | null | undefined) ?? null,
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
      rachaDias,
    };
  }

  /**
   * Consulta PASIVA y READ-ONLY de la sesión de hoy del alumno (RF-001 Escenario 1 / RN-04).
   *
   * - NUNCA crea, reemplaza ni elimina sesiones: navegar o consultar bloques jamás muta datos.
   *   La instanciación o el cambio de bloque ocurren solo vía `entrenarBloqueHoy` (acción explícita).
   * - Con `bloqueId`: retorna la sesión de hoy de ese bloque (la más reciente) o null.
   * - Sin `bloqueId`: retorna la sesión de hoy más reciente del alumno o null.
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

    // Buscar sesiones de hoy para este alumno (sin mutaciones de ningún tipo)
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

    const sesionHoy = bloqueId
      ? sesionesHoy.find((s) => s.bloqueId === bloqueId)
      : sesionesHoy[0];

    return sesionHoy ? this.hidratarSesion(sesionHoy) : null;
  }

  /**
   * Acción EXPLÍCITA del alumno para entrenar un bloque hoy (RF-001 RN-04 y el caso borde
   * "Entrenamientos fuera de día planificado"): instancia o cambia la sesión del día SIN
   * destruir sesiones existentes.
   *
   * Decisiones de diseño:
   * - Nunca elimina sesiones: los IDs ya sincronizados/encolados por la cola offline permanecen
   *   estables (la antigua consulta GET borraba la sesión planificada de otro bloque).
   * - Idempotente por bloque: si hoy ya existe una sesión PLANIFICADA/EN_PROGRESO de ese bloque,
   *   la retorna (y la inicia si `iniciarInmediato`).
   * - Repetición: si la única sesión del bloque hoy está COMPLETADA u OMITIDA, crea una NUEVA
   *   sesión conservando el historial anterior.
   * - Guard de tenancy: opera únicamente sobre la rutina activa del usuario autenticado (`sub`).
   */
  async entrenarBloqueHoy(
    alumnoId: string,
    bloqueId: string,
    input: EntrenarBloqueHoyDTO = {},
    idempotencyKey?: string
  ): Promise<SesionEntrenamientoDetalleDTO> {
    // RNF-002 §4: un reintento con la misma key devuelve la sesión original sin re-instaurar.
    const claveIdem = this.claveIdempotencia('entrenar-hoy', alumnoId, idempotencyKey);
    const cacheada = this.leerRespuestaIdempotente<SesionEntrenamientoDetalleDTO>(claveIdem);
    if (cacheada) return cacheada;

    const resultado = await this.ejecutarEntrenarBloqueHoy(alumnoId, bloqueId, input);
    this.guardarRespuestaIdempotente(claveIdem, resultado);
    return resultado;
  }

  private async ejecutarEntrenarBloqueHoy(
    alumnoId: string,
    bloqueId: string,
    input: EntrenarBloqueHoyDTO = {}
  ): Promise<SesionEntrenamientoDetalleDTO> {
    if (!bloqueId || !bloqueId.trim()) {
      throw new BadRequestException('El bloqueId es obligatorio para entrenar un bloque.');
    }

    const tz = input.timezoneCliente || 'America/Caracas';
    let hoyStr: string;
    try {
      hoyStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    } catch {
      hoyStr = new Date().toISOString().split('T')[0];
    }

    const { isoDay } = calcularRangoSemanaIso(hoyStr);

    // Tenancy: la rutina se busca SIEMPRE por el usuario autenticado.
    // RNF-003/ADR-009: la lectura corre con el GUC del alumno (política self_select).
    const [rutinaActiva] = await this.withTenant({ usuarioId: alumnoId }, async (tx) =>
      tx
        .select()
        .from(rutinas)
        .where(
          and(
            eq(rutinas.alumnoId, alumnoId),
            eq(rutinas.activa, true)
          )
        )
        .orderBy(desc(rutinas.createdAtUtc))
        .limit(1)
    );

    if (!rutinaActiva || !Array.isArray(rutinaActiva.bloques) || rutinaActiva.bloques.length === 0) {
      throw new NotFoundException('No tienes una rutina activa asignada.');
    }

    const bloques = rutinaActiva.bloques as BloqueDiaRutinaDTO[];
    const bloqueTarget = bloques.find((b) => b.diaId === bloqueId);
    if (!bloqueTarget) {
      throw new NotFoundException(`El bloque '${bloqueId}' no pertenece a tu rutina activa.`);
    }
    if (!bloqueTarget.ejercicios || bloqueTarget.ejercicios.length === 0) {
      throw new BadRequestException('El bloque seleccionado no tiene ejercicios prescritos.');
    }

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

    // Un entrenamiento en progreso de OTRO bloque bloquea el cambio (evita dos sesiones activas).
    const enProgresoOtro = sesionesHoy.find(
      (s) => s.estado === EstadoSesion.EN_PROGRESO && s.bloqueId !== bloqueId
    );
    if (enProgresoOtro) {
      throw new ConflictException(
        'Tienes un entrenamiento en progreso. Finalízalo antes de entrenar otro bloque hoy.'
      );
    }

    // Reutiliza una sesión viva (planificada o en progreso) del mismo bloque; nunca la recrea.
    const sesionViva = sesionesHoy.find(
      (s) =>
        s.bloqueId === bloqueId &&
        (s.estado === EstadoSesion.PLANIFICADA || s.estado === EstadoSesion.EN_PROGRESO)
    );

    if (sesionViva) {
      if (input.iniciarInmediato && sesionViva.estado === EstadoSesion.PLANIFICADA) {
        return this.iniciarSesion(sesionViva.id, alumnoId, { timezoneCliente: tz });
      }
      return this.hidratarSesion(sesionViva);
    }

    // Sin sesión viva: crear una nueva (repetición de COMPLETADA/OMITIDA o primer acceso del bloque).
    const bloquePrescritoParaHoy = bloques.find(
      (b, idx) => obtenerDiaSugeridoBloque(b, idx) === isoDay
    );
    const creada = await this.instanciarSesionDesdeBloque(
      alumnoId,
      rutinaActiva.id,
      rutinaActiva.entrenadorId,
      bloqueTarget,
      hoyStr,
      tz,
      !bloquePrescritoParaHoy
    );
    if (!creada) {
      throw new BadRequestException('No se pudo instanciar la sesión del bloque seleccionado.');
    }

    if (input.iniciarInmediato) {
      return this.iniciarSesion(creada.id, alumnoId, { timezoneCliente: tz });
    }
    return creada;
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
      // Prescripción cualitativa (ej. "Moderado", "Sugerido"): NO materializar 0.00.
      // Se persiste null en peso_prescrito_kg y el texto se conserva en notasCoach.
      const pesoMatch = (ej.peso || '').match(/\d+(\.\d+)?/);
      const targetPesoPrescrito = pesoMatch ? parseFloat(pesoMatch[0]).toFixed(2) : null;
      const targetRpe = ej.rpe ? parseFloat(ej.rpe).toFixed(1) : null;

      for (let s = 1; s <= numSeries; s++) {
        await this.db.insert(seriesRegistro).values({
          id: crypto.randomUUID(),
          ejercicioSesionId: ejSesionId,
          numeroSerie: s,
          repsObjetivo: targetReps,
          repsLogradas: null,
          // `pesoKg` es el peso real (se registra al sincronizar); lo prescrito va aparte.
          pesoKg: null,
          pesoPrescritoKg: targetPesoPrescrito,
          rpe: targetRpe,
          completada: false,
        });
      }
    }

    return this.hidratarSesion(nuevaSesion);
  }

  /**
   * Obtener historial cronológico de sesiones completadas o registradas de un alumno.
   *
   * WU24: envelope `{ items, total, limit, offset }` con COUNT real en SQL y orden cronológico
   * descendente (fechaProgramada, createdAtUtc, id) para que `offset` avance sin repetir filas.
   *
   * IMPORTANTE (fuga de historial entre alumnos corregida): para ALUMNO el primer argumento
   * (`entrenadorId`) transporta el claim `entrenadorId` del JWT, que es el UUID del COACH,
   * no el del alumno. Por eso la titularidad se valida contra `currentUserId` (el `sub`).
   */
  async obtenerHistorialSesionesAlumno(
    entrenadorId: string,
    alumnoId: string,
    rol: Rol,
    limit = LIMITE_HISTORIAL_SESIONES_POR_DEFECTO,
    offset = 0,
    currentUserId?: string
  ): Promise<HistorialSesionesAlumnoDTO> {
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

    // Aislamiento por titularidad: un alumno SOLO puede leer su propio historial.
    if (rol === Rol.ALUMNO) {
      if (!currentUserId || perfil.usuarioId !== currentUserId) {
        throw new ForbiddenException('No tienes permiso para consultar el historial de otro alumno.');
      }
    }

    const usuarioAlumnoId = perfil.usuarioId;
    const whereHistorial = eq(sesionesEntrenamiento.alumnoId, usuarioAlumnoId);

    // WU24: COUNT real en SQL para el `total` del envelope (sin traer el historial completo a
    // memoria solo para contarlo).
    const [filaTotal] = await this.db
      .select({ total: count() })
      .from(sesionesEntrenamiento)
      .where(whereHistorial);

    const sesiones = await this.db
      .select()
      .from(sesionesEntrenamiento)
      .where(whereHistorial)
      .orderBy(
        desc(sesionesEntrenamiento.fechaProgramada),
        desc(sesionesEntrenamiento.createdAtUtc),
        // WU24: desempate estable para que `offset` no repita ni salte filas cuando dos sesiones
        // comparten fechaProgramada y createdAtUtc.
        desc(sesionesEntrenamiento.id)
      )
      .limit(limit)
      .offset(offset);

    const items: SesionEntrenamientoDetalleDTO[] = [];
    for (const s of sesiones) {
      items.push(await this.hidratarSesion(s));
    }

    return {
      items,
      total: Number(filaTotal?.total ?? 0),
      limit,
      offset,
    };
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
   * Obtener la última sesión registrada (COMPLETADA o EN_PROGRESO) de un alumno específico.
   *
   * Solo cuentan las sesiones realmente entrenadas: las PLANIFICADA (aún no iniciadas) y las
   * OMITIDA (descanso/incompleto) se excluyen para que el coach no vea un plan futuro o un día
   * omitido como "último entrenamiento".
   *
   * Con validación de aislamiento de Tenancy (el alumno debe pertenecer al entrenador).
   * Acepta alumnoId como `perfiles_alumno.id` o como `usuarios.id` (perfiles_alumno.usuario_id).
   */
  async obtenerUltimaSesionAlumno(
    entrenadorId: string,
    alumnoId: string,
    rol: Rol,
    currentUserId?: string
  ): Promise<SesionEntrenamientoDetalleDTO | null> {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(alumnoId)) {
      return null;
    }

    let targetUsuarioId = alumnoId;

    if (rol !== Rol.SUPERADMIN) {
      // Acepta `perfiles_alumno.id` o `usuarios.id`: consultas secuenciales (id primero), el mismo
      // patrón que `obtenerHistorialSesionesAlumno`; un `or(...)` entre columnas distintas no es
      // representable por el mock de Drizzle de los tests BDD.
      let [perfil] = await this.db
        .select()
        .from(perfilesAlumno)
        .where(and(eq(perfilesAlumno.id, alumnoId), isNull(perfilesAlumno.deletedAtUtc)))
        .limit(1);

      if (!perfil) {
        [perfil] = await this.db
          .select()
          .from(perfilesAlumno)
          .where(and(eq(perfilesAlumno.usuarioId, alumnoId), isNull(perfilesAlumno.deletedAtUtc)))
          .limit(1);
      }

      if (!perfil) {
        throw new NotFoundException(`Alumno con ID '${alumnoId}' no encontrado.`);
      }

      // Defensa en profundidad: si un ALUMNO llegara a este método, solo puede verse a sí mismo.
      if (rol === Rol.ALUMNO && (!currentUserId || perfil.usuarioId !== currentUserId)) {
        throw new ForbiddenException('No tienes permiso para consultar la sesión de otro alumno.');
      }

      if (perfil.entrenadorId !== entrenadorId) {
        throw new ForbiddenException(
          'Aislamiento de Tenant: El alumno pertenece a otro entrenador.'
        );
      }

      targetUsuarioId = perfil.usuarioId;
    } else {
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

      if (perfil) {
        targetUsuarioId = perfil.usuarioId;
      }
    }

    const [sesion] = await this.db
      .select()
      .from(sesionesEntrenamiento)
      .where(
        and(
          eq(sesionesEntrenamiento.alumnoId, targetUsuarioId),
          // Solo sesiones realmente entrenadas: excluye PLANIFICADA y OMITIDA (coherente con el docstring).
          inArray(sesionesEntrenamiento.estado, [
            EstadoSesion.COMPLETADA,
            EstadoSesion.EN_PROGRESO,
          ])
        )
      )
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
    input: IniciarSesionDTO,
    idempotencyKey?: string
  ): Promise<SesionEntrenamientoDetalleDTO> {
    // RNF-002 §4: reintento idempotente del inicio (la transición repetida devolvería 400).
    const claveIdem = this.claveIdempotencia('iniciar', alumnoId, idempotencyKey);
    const cacheada = this.leerRespuestaIdempotente<SesionEntrenamientoDetalleDTO>(claveIdem);
    if (cacheada) return cacheada;

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

    const resultado = await this.obtenerSesionPorId(sesionId, alumnoId, Rol.ALUMNO);
    this.guardarRespuestaIdempotente(claveIdem, resultado);
    return resultado;
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
    input: SincronizarSeriesBatchDTO,
    idempotencyKey?: string
  ): Promise<SesionEntrenamientoDetalleDTO> {
    // RNF-002 §4: el batch offline reenviado con la misma key no re-aplica ni duplica series.
    const claveIdem = this.claveIdempotencia('series', alumnoId, idempotencyKey);
    const cacheada = this.leerRespuestaIdempotente<SesionEntrenamientoDetalleDTO>(claveIdem);
    if (cacheada) return cacheada;

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

      // WU17: el inicio real solo se escribe cuando el cliente lo envía; si no llega
      // (cliente previo o re-sync sin la marca), se conserva lo ya persistido y nunca
      // se inventa. El cliente jamás retro-marca series ya completadas.
      const timestampInicioUtc = sInput.timestampInicioUtc
        ? new Date(sInput.timestampInicioUtc)
        : serie.timestampInicioUtc ?? null;

      await this.db
        .update(seriesRegistro)
        .set({
          repsLogradas: sInput.repsLogradas,
          pesoKg: pesoKgFinal,
          rpe: rpeFinal,
          descansoSegundos: sInput.descansoSegundos !== undefined ? sInput.descansoSegundos : (serie.descansoSegundos ?? null),
          completada: sInput.completada,
          timestampInicioUtc,
          timestampCompletadaUtc: timestampUtc,
        })
        .where(eq(seriesRegistro.id, sInput.serieId));
    }

    const resultado = await this.obtenerSesionPorId(sesionId, alumnoId, Rol.ALUMNO);
    this.guardarRespuestaIdempotente(claveIdem, resultado);
    return resultado;
  }

  // ---------------------------------------------------------------------------
  // 6. FINALIZACIÓN DE SESIÓN Y REGLA DE RACHA (RN-02)
  // ---------------------------------------------------------------------------

  /**
   * Finalizar sesión de entrenamiento.
   *
   * - porcentajeCumplimiento sigue siendo (series completadas / series totales * 100).
   * - RN-02: la racha se evalúa por VOLUMEN (ver `evaluarCumplimientoRachaPorVolumen`) y se
   *   persiste en `perfiles_alumno.racha_dias` / `racha_ultima_fecha`.
   * - RF-001 Escenario 5: si no hay NINGUNA serie completada se exige `tipoCierre`
   *   (DESCANSADA/INCOMPLETA → estado OMITIDA + motivo; COMPLETADA se rechaza).
   */
  async finalizarSesion(
    sesionId: string,
    alumnoId: string,
    input: FinalizarSesionDTO,
    idempotencyKey?: string
  ): Promise<FinalizarSesionResponseDTO> {
    // RNF-002 §4: finalizar/omitir reenviado con la misma key devuelve la respuesta original
    // (sin recalcular racha ni re-notificar al coach).
    const claveIdem = this.claveIdempotencia('finalizar', alumnoId, idempotencyKey);
    const cacheada = this.leerRespuestaIdempotente<FinalizarSesionResponseDTO>(claveIdem);
    if (cacheada) return cacheada;

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
    const allSeries: any[] = [];

    if (ejSesionIds.length > 0) {
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

    // RF-001 Escenario 5: cierre de sesión vacía exige decisión explícita del alumno.
    // El 400 viaja con un código máquina estable (`code: 'SESION_VACIA'`, campo canónico
    // del esquema de error RFC 7807 §1 del doc de contratos) para que la UI abra el
    // modal de cierre vacío solo ante ESTE caso y trate cualquier otro 400 como error normal.
    if (seriesCompletadas === 0) {
      if (!validado.tipoCierre) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'SESION_VACIA',
          message:
            'La sesión no registra series completadas. Indica si el día fue descansado o incompleto.',
        });
      }
      if (validado.tipoCierre === TipoCierreSesion.COMPLETADA) {
        throw new BadRequestException(
          'No se puede cerrar como COMPLETADA una sesión sin series completadas. Indica si el día fue descansado o incompleto.'
        );
      }
    }

    const esOmision =
      validado.tipoCierre === TipoCierreSesion.DESCANSADA ||
      validado.tipoCierre === TipoCierreSesion.INCOMPLETA;
    const motivoOmision: MotivoOmision | null = esOmision
      ? validado.tipoCierre === TipoCierreSesion.DESCANSADA
        ? MotivoOmision.DESCANSO
        : MotivoOmision.INCOMPLETO
      : null;

    const fechaFinUtc = validado.fechaFinUtc ?? new Date().toISOString();
    if (!fechaFinUtc.endsWith('Z')) {
      throw new BadRequestException(
        `El timestamp de finalización '${fechaFinUtc}' debe terminar en 'Z' (UTC).`
      );
    }

    const duracionMinutos = calcularDuracionMinutos(sesion.fechaInicioUtc, fechaFinUtc);

    // RN-02: la omisión explícita nunca incrementa racha.
    const evaluacion = evaluarCumplimientoRachaPorVolumen(allSeries);
    const cumpleReglaRacha = !esOmision && evaluacion.cumple;

    // Racha persistida del alumno (antes se pasaba 0 fijo desde el controller).
    const [perfilRacha] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, alumnoId))
      .limit(1);

    const rachaEstado: RachaEstado = {
      rachaDias: perfilRacha?.rachaDias ?? 0,
      rachaUltimaFecha: perfilRacha?.rachaUltimaFecha ?? null,
    };

    // RN-05: la fecha de la racha es la fecha LOCAL del alumno (timezone capturada al iniciar).
    const fechaLocal = obtenerFechaLocalYyyyMmDd(fechaFinUtc, sesion.timezoneCliente);
    const rachaActualizada = actualizarRacha(rachaEstado, fechaLocal, cumpleReglaRacha);
    const nuevaRacha = calcularRachaEfectiva(
      rachaActualizada.rachaDias,
      rachaActualizada.rachaUltimaFecha,
      fechaLocal
    );

    // cumple=false (o mismo día) NO modifica la racha almacenada.
    if (perfilRacha && rachaActualizada.incrementada) {
      await this.db
        .update(perfilesAlumno)
        .set({
          rachaDias: rachaActualizada.rachaDias,
          rachaUltimaFecha: rachaActualizada.rachaUltimaFecha,
          updatedAtUtc: new Date(),
        })
        .where(eq(perfilesAlumno.id, perfilRacha.id));
    }

    const notasFinales =
      validado.notasAlumno !== undefined ? validado.notasAlumno : sesion.notasAlumno;

    await this.db
      .update(sesionesEntrenamiento)
      .set({
        estado: esOmision ? EstadoSesion.OMITIDA : EstadoSesion.COMPLETADA,
        motivoOmision,
        fechaFinUtc: new Date(fechaFinUtc),
        porcentajeCumplimiento: porcentajeCumplimientoStr,
        volumenTotalKg: volumenTotalKgStr,
        notasAlumno: notasFinales,
        updatedAtUtc: new Date(),
      })
      .where(eq(sesionesEntrenamiento.id, sesionId));

    const sesionDetalle = await this.obtenerSesionPorId(sesionId, alumnoId, Rol.ALUMNO);
    sesionDetalle.cumpleReglaRacha = cumpleReglaRacha;
    sesionDetalle.duracionMinutos = duracionMinutos;
    sesionDetalle.volumenTotalKg = volumenTotalKgStr;

    // RF-014 / ADR-010: el coach recibe el feedback de la sesión finalizada (no en omisiones).
    if (!esOmision) {
      await this.notificarEntrenadorSesionFinalizada({
        sesion,
        perfilAlumno: perfilRacha,
        sesionId,
        porcentajeCumplimiento: porcentajeCumplimientoStr,
        volumenTotalKg: volumenTotalKgStr,
        series: allSeries,
        notasAlumno: notasFinales,
      });
    }

    const respuesta: FinalizarSesionResponseDTO = {
      sesion: sesionDetalle,
      cumpleReglaRacha,
      cumpleRacha: cumpleReglaRacha,
      nuevaRacha,
      duracionMinutos,
      volumenTotalKg: volumenTotalKgStr,
    };
    this.guardarRespuestaIdempotente(claveIdem, respuesta);
    return respuesta;
  }

  /**
   * RF-014 / ADR-010: emite el evento de dominio `SesionAlumnoFinalizadaEvent` hacia el coach.
   *
   * Decisiones de diseño:
   * - Se publica en el bus (`emitAsync`) y el `NotificationDispatcherService` (suscriptor)
   *   persiste In-App + encola Push/Email según preferencias del coach; ningún proveedor externo
   *   ni el despachador se invocan desde el servicio de negocio (RN-01).
   * - El despacho se espera dentro de try/catch: la persistencia In-App es obligatoria y barata,
   *   mientras que un fallo de infraestructura de colas JAMÁS debe romper la finalización (RNF-004).
   * - Idempotencia: la máquina de estados de la sesión (`en_progreso` -> `completada`) garantiza una
   *   única transición, por lo que no puede emitirse el evento dos veces para la misma sesión.
   */
  private async notificarEntrenadorSesionFinalizada(params: {
    sesion: { alumnoId: string; fechaProgramada: string; bloqueId: string | null };
    perfilAlumno:
      | { id: string; entrenadorId: string; nombres: string; apellidos: string }
      | undefined;
    sesionId: string;
    porcentajeCumplimiento: string;
    volumenTotalKg: string;
    series: any[];
    notasAlumno?: string | null;
  }): Promise<void> {
    if (!this.eventEmitter || !params.perfilAlumno?.entrenadorId) return;

    const { sesion, perfilAlumno, sesionId } = params;
    const nombreAlumno = `${perfilAlumno.nombres} ${perfilAlumno.apellidos}`.trim();

    const rpes = params.series
      .map((s) => parseFloat(s.rpe ?? ''))
      .filter((n) => Number.isFinite(n));
    const rpePromedio =
      rpes.length > 0
        ? (rpes.reduce((acc, n) => acc + n, 0) / rpes.length).toFixed(1)
        : null;
    const dejoNota = !!(params.notasAlumno && params.notasAlumno.trim().length > 0);

    let cuerpo = `${nombreAlumno} finalizó su sesión del ${sesion.fechaProgramada} con ${params.porcentajeCumplimiento}% de cumplimiento.`;
    if (rpePromedio) cuerpo += ` RPE promedio: ${rpePromedio}.`;
    if (dejoNota) cuerpo += ' Dejó una nota en la sesión.';

    try {
      await this.eventEmitter.emitAsync(
        SesionAlumnoFinalizadaEvent.NOMBRE,
        new SesionAlumnoFinalizadaEvent({
          tipoEvento: 'SESION_ALUMNO_FINALIZADA',
          destinatarioUserId: perfilAlumno.entrenadorId,
          entrenadorId: perfilAlumno.entrenadorId,
          categoria: 'ENTRENAMIENTO',
          titulo: 'Sesión finalizada por tu alumno',
          cuerpo,
          linkAccion: `/coach/alumnos/${perfilAlumno.id}`,
          datosAdicionales: {
            sesionId,
            alumnoId: sesion.alumnoId,
            perfilAlumnoId: perfilAlumno.id,
            fechaProgramada: sesion.fechaProgramada,
            bloqueId: sesion.bloqueId,
            porcentajeCumplimiento: params.porcentajeCumplimiento,
            volumenTotalKg: params.volumenTotalKg,
            rpePromedio,
            dejoNota,
          },
          esCriticoSeguridad: false,
          // RNF-004 §3: ref de origen del jobId determinista.
          referenciaId: sesionId,
        })
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo notificar al entrenador ${perfilAlumno.entrenadorId} la finalización de la sesión ${sesionId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 7. MONITOR SEMANAL DE ADHERENCIA DEL COACH (RN-03)
  // ---------------------------------------------------------------------------

  /**
   * Monitor semanal de adherencia del coach (RF-001 RN-03 / Escenario 4):
   *
   * - Ventana: semana en curso desde el Lunes 00:00 local hasta "ahora". La zona del coach llega
   *   como `timezone` (default UTC, validada con Intl); el Lunes 00:00 se convierte al instante UTC
   *   exacto para consultar por `fecha_fin_utc`. Los timestamps del DTO se exponen en UTC.
   * - `sesionesPrescritas` se deriva de los bloques de la rutina ACTIVA del alumno que ya debieron
   *   ejecutarse (día sugerido <= día ISO de hoy). Las sesiones materializadas sólo aportan lo
   *   completado (estado COMPLETADA con `fecha_fin_utc` dentro de la ventana).
   * - `tienePlanActivo` permite a la UI distinguir "sin plan" de un ROJO 0/0 engañoso.
   * - `alumnoPerfilId` expone `perfiles_alumno.id` (el `GET /alumnos/:id` espera ese ID) para que
   *   la UI pueda enlazar al expediente; `alumnoId` sigue siendo el `usuarios.id` de sesiones/rutinas.
   * - `diasInactivo`/`ultimaSesionUtc` salen de la ÚLTIMA sesión completada real del alumno
   *   (consulta agregada `MAX(fecha_fin_utc) GROUP BY alumno`, una fila por alumno). Un alumno
   *   sin ninguna sesión completada mantiene `null` + `7` (default RN-03), sin inventar fechas.
   * - Rendimiento: 4 consultas en lote independientes del número de alumnos (sin N+1). El cálculo
   *   completo sigue siendo EN MEMORIA del coach (agregados en lote); el `limit`/`offset` son un
   *   slice de PRESENTACIÓN que se aplica DESPUÉS de ordenar, y `resumen` describe la cartera
   *   completa (no la página) para los chips/filtros globales de la UI.
   * - Orden por nivel de riesgo (ROJO al tope) o por nombre (`orden=nombre`) y racha efectiva
   *   RN-02 (WU1). WU24: envelope `{ items, total, limit, offset, resumen }`.
   * - WU25a: `filtro.q` (nombre, case/acento-insensible y literal) y `filtro.semaforo`
   *   (rojo|amarillo|verde|sinPlan|sinPendientes) se aplican ANTES del slice; `resumen` sigue
   *   describiendo la cartera completa (los filtros solo recortan `items`/`total`).
   * - WU26: `filtro.orden` (`riesgo` default | `nombre`) también se aplica ANTES del slice.
   *   Ambos órdenes desempatan por `alumnoId`, así que la página por offset es determinista
   *   aunque la query base no tenga ORDER BY (el sort en JS es total y estable).
   */
  async calcularSemanaAdherencia(
    entrenadorId: string,
    timezone?: string,
    limit = LIMITE_MONITOR_ADHERENCIA_POR_DEFECTO,
    offset = 0,
    filtro?: FiltroMonitorAdherenciaDTO
  ): Promise<MonitorAdherenciaDTO> {
    // 1. Obtener alumnos activos del entrenador.
    // D10: "activos" es literal: se excluyen los perfiles pausados/suspendidos, no solo los
    // soft-deleted. Un alumno pausado no debe aparecer en el monitor de adherencia.
    const alumnos = await this.db
      .select()
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.entrenadorId, entrenadorId),
          eq(perfilesAlumno.estadoActivacion, EstadoAlumno.ACTIVO),
          isNull(perfilesAlumno.deletedAtUtc)
        )
      );

    if (alumnos.length === 0) {
      return {
        items: [],
        total: 0,
        limit,
        offset,
        resumen: { rojo: 0, amarillo: 0, verde: 0, sinPlan: 0, sinPendientes: 0, total: 0 },
      };
    }

    const ventana = calcularVentanaSemana(new Date(), timezone);
    const alumnoIds = alumnos.map((a) => a.usuarioId);

    // 2. Rutinas activas de todos los alumnos (en lote) -> bloques prescritos por alumno.
    // RNF-003/ADR-009: lectura tenant-scoped con el GUC del coach (withTenant).
    const rutinasActivas = await this.withTenant({ entrenadorId }, async (tx) =>
      tx
        .select()
        .from(rutinas)
        .where(and(inArray(rutinas.alumnoId, alumnoIds), eq(rutinas.activa, true)))
        .orderBy(desc(rutinas.createdAtUtc))
    );

    const rutinaPorAlumno = new Map<string, (typeof rutinasActivas)[number]>();
    for (const rutina of rutinasActivas) {
      if (!rutinaPorAlumno.has(rutina.alumnoId)) {
        rutinaPorAlumno.set(rutina.alumnoId, rutina);
      }
    }

    // 3. Sesiones materializadas COMPLETADAS dentro de la ventana (en lote).
    const sesionesVentana = await this.db
      .select()
      .from(sesionesEntrenamiento)
      .where(
        and(
          inArray(sesionesEntrenamiento.alumnoId, alumnoIds),
          eq(sesionesEntrenamiento.estado, EstadoSesion.COMPLETADA),
          gte(sesionesEntrenamiento.fechaFinUtc, ventana.inicioSemanaUtc),
          lte(sesionesEntrenamiento.fechaFinUtc, ventana.ahoraUtc)
        )
      );

    const completadasPorAlumno = new Map<string, number>();
    for (const sesion of sesionesVentana) {
      completadasPorAlumno.set(
        sesion.alumnoId,
        (completadasPorAlumno.get(sesion.alumnoId) ?? 0) + 1
      );
    }

    // 4. Última sesión completada REAL por alumno (en lote). WU23: una consulta agregada
    //    `MAX(fecha_fin_utc) GROUP BY alumno_id` devuelve una fila por alumno (jamás el
    //    histórico en crudo) con la última sesión real, aunque sea más antigua que la ventana
    //    de 30 días de WU19. Antes, un alumno con historial viejo quedaba en `diasInactivo = 7`
    //    (default) y `ultimaSesionUtc = null`, y la UI lo mostraba como inactividad falsa.
    const ultimasSesiones = await this.db
      .select({
        alumnoId: sesionesEntrenamiento.alumnoId,
        ultimaSesionUtc: max(sesionesEntrenamiento.fechaFinUtc),
      })
      .from(sesionesEntrenamiento)
      .where(
        and(
          inArray(sesionesEntrenamiento.alumnoId, alumnoIds),
          eq(sesionesEntrenamiento.estado, EstadoSesion.COMPLETADA),
          isNotNull(sesionesEntrenamiento.fechaFinUtc)
        )
      )
      .groupBy(sesionesEntrenamiento.alumnoId);

    const ultimaPorAlumno = new Map<string, Date>();
    for (const fila of ultimasSesiones) {
      if (fila.alumnoId && fila.ultimaSesionUtc) {
        ultimaPorAlumno.set(fila.alumnoId, new Date(fila.ultimaSesionUtc));
      }
    }

    const resultados: MonitorAdherenciaSemanalDTO[] = [];

    for (const alumno of alumnos) {
      const rutina = rutinaPorAlumno.get(alumno.usuarioId);
      const bloques = rutina?.bloques ?? [];
      const tienePlanActivo = Array.isArray(bloques) && bloques.length > 0;

      const sesionesPrescritas = tienePlanActivo
        ? contarBloquesPrescritosHasta(bloques, ventana.isoDayHoy)
        : 0;
      const sesionesCompletadas = completadasPorAlumno.get(alumno.usuarioId) ?? 0;

      let diasInactivo = 7; // Inactividad máxima por defecto si nunca ha entrenado
      let ultimaSesionUtc: string | null = null;

      const ultimaFechaSesion = ultimaPorAlumno.get(alumno.usuarioId);
      if (ultimaFechaSesion) {
        ultimaSesionUtc = toIsoUtcString(ultimaFechaSesion);
        const fechaLocalUltima = obtenerFechaLocalYyyyMmDd(ultimaFechaSesion, timezone);
        diasInactivo = diferenciaDiasCalendario(fechaLocalUltima, ventana.hoyLocal);
      }

      const adherencia = evaluarAdherenciaSemanal(
        sesionesPrescritas,
        sesionesCompletadas,
        diasInactivo
      );

      // RN-02: racha efectiva persistida (si la cadena está rota por gap, se muestra 0).
      const rachaDiasConsecutivos = calcularRachaEfectiva(
        alumno.rachaDias ?? 0,
        alumno.rachaUltimaFecha ?? null,
        ventana.hoyLocal
      );

      resultados.push({
        alumnoId: alumno.usuarioId,
        alumnoPerfilId: alumno.id,
        nombreCompleto: `${alumno.nombres} ${alumno.apellidos}`.trim(),
        sesionesPrescritas,
        sesionesCompletadas,
        porcentajeCumplimientoSemanal: adherencia.porcentajeCumplimientoSemanal,
        semaforoAdherencia: adherencia.semaforoAdherencia,
        tienePlanActivo,
        // D6 (aditivo): plan activo sin bloques vencidos aún => la UI lo muestra neutral,
        // nunca ROJO 0/0 a inicio de semana.
        sinPendientesSemana: tienePlanActivo && sesionesPrescritas === 0,
        rachaDiasConsecutivos,
        diasInactivo,
        ultimaSesionUtc,
      });
    }

    // WU24: contadores de TODA la cartera (no de la página ni del filtro), con la misma semántica
    // que los filtros de la UI: un 0/0 con plan pero sin pendientes no cuenta como ROJO (D6).
    const resumen: ResumenMonitorAdherenciaDTO = {
      rojo: resultados.filter(
        (a) => a.tienePlanActivo && !a.sinPendientesSemana && a.semaforoAdherencia === SemaforoAdherencia.ROJO
      ).length,
      amarillo: resultados.filter(
        (a) => a.tienePlanActivo && a.semaforoAdherencia === SemaforoAdherencia.AMARILLO
      ).length,
      verde: resultados.filter(
        (a) => a.tienePlanActivo && a.semaforoAdherencia === SemaforoAdherencia.VERDE
      ).length,
      sinPlan: resultados.filter((a) => !a.tienePlanActivo).length,
      sinPendientes: resultados.filter((a) => a.tienePlanActivo && a.sinPendientesSemana).length,
      total: resultados.length,
    };

    // WU25a/WU26: los filtros recortan la lista ANTES del slice (el resumen ya es de la cartera
    // completa) y el orden pedido (`riesgo` default ROJO->AMARILLO->VERDE, o `nombre` A–Z)
    // también se aplica antes del slice. Ambos comparadores son totales (desempate por
    // `alumnoId`), así que la paginación por offset no repite ni salta filas entre páginas.
    const filtrados = filtrarMonitorAdherencia(resultados, filtro);
    const ordenados =
      filtro?.orden === 'nombre'
        ? ordenarMonitorPorNombre(filtrados)
        : ordenarMonitorPorRiesgo(filtrados);

    // Slice de PRESENTACIÓN posterior al orden: offset avanza sin repetir ni saltar filas.
    return {
      items: ordenados.slice(offset, offset + limit),
      total: ordenados.length,
      limit,
      offset,
      resumen,
    };
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
          pesoPrescritoKg: s.pesoPrescritoKg ?? null,
          rpe: s.rpe,
          descansoSegundos: s.descansoSegundos ?? null,
          completada: s.completada,
          timestampInicioUtc: toIsoUtcString(s.timestampInicioUtc),
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
      motivoOmision: sesion.motivoOmision ?? null,
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
