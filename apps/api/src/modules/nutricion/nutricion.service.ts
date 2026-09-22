import {
  Injectable,
  Inject,
  Optional,
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
  desc,
  asc,
  inArray,
  gte,
  lte,
  checkinsNutricionales,
  fotosComida,
  metasNutricionales,
  perfilesAlumno,
  usuarios,
} from '@guachafit/database';
import {
  Rol,
  SemaforoNutricional,
  CheckinNutricionalDTO,
  CheckinNutricionalSchema,
  CheckinNutricionalDetalleDTO,
  FotoComidaDetalleDTO,
  FiltroCheckinsNutricionalesDTO,
  FiltroCheckinsNutricionalesSchema,
  HORA_FIN_VENTANA_CHECKIN_NUTRICIONAL,
  HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL,
  MetasNutricionalesDTO,
  MetasNutricionalesDetalleDTO,
  MetasNutricionalesSchema,
  TIMEZONE_NUTRICION_POR_DEFECTO,
  TOLERANCIA_TOTALES_NUTRICIONAL_PCT,
  ToleranciaNutricionalDTO,
} from '@guachafit/shared';
import { esTimezoneIanaValida, obtenerFechaLocalYyyyMmDd } from '../../common/adherencia.util';
import { R2StorageService } from '../antropometria/r2-storage.service';

// =============================================================================
// METAS Y TOLERANCIA NUTRICIONAL (RF-002, RN-01, RN-04)
// =============================================================================

/**
 * Metas del coach tal como las consume el evaluador de tolerancia.
 * Las dimensiones sin meta configurada (null/undefined) no se evalúan.
 */
export interface MetasNutricionalesCoach {
  caloriasObjetivo?: number | null;
  proteinaGramosObjetivo?: number | null;
  /** Meta de hidratación: informativa, no entra en la tolerancia de totales (RN-04). */
  aguaLitrosObjetivo?: string | null;
}

/** Redondeo a 2 decimales del porcentaje de desviación (contrato histórico del endpoint). */
function redondearPorcentaje(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * RF-002 Escenario 3: compara los totales reportados contra las metas REALES del coach con una
 * tolerancia de ±10% (`TOLERANCIA_TOTALES_NUTRICIONAL_PCT`).
 *
 * - Se evalúa cada dimensión SOLO si hay meta configurada (meta > 0) y total reportado.
 * - `dentroMargenTolerancia` es el AND de las dimensiones evaluadas.
 * - Sin metas del coach, o sin ninguna dimensión evaluable, devuelve `{}` = "sin evaluar":
 *   el alumno no queda marcado, nunca se fabrica un OK (RN-01/Trazabilidad).
 */
export function evaluarToleranciaNutricional(
  caloriasReportadas?: number | null,
  proteinaGramosReportada?: number | null,
  metasCoach?: MetasNutricionalesCoach | null
): ToleranciaNutricionalDTO {
  if (!metasCoach) {
    return {};
  }

  const metaCalorias = metasCoach.caloriasObjetivo ?? null;
  const metaProteina = metasCoach.proteinaGramosObjetivo ?? null;
  const hayCalorias =
    metaCalorias !== null &&
    metaCalorias > 0 &&
    caloriasReportadas !== null &&
    caloriasReportadas !== undefined;
  const hayProteina =
    metaProteina !== null &&
    metaProteina > 0 &&
    proteinaGramosReportada !== null &&
    proteinaGramosReportada !== undefined;

  if (!hayCalorias && !hayProteina) {
    return {};
  }

  const desviacionCaloriasPct = hayCalorias
    ? redondearPorcentaje(((caloriasReportadas! - metaCalorias!) / metaCalorias!) * 100)
    : undefined;
  const desviacionProteinasPct = hayProteina
    ? redondearPorcentaje(((proteinaGramosReportada! - metaProteina!) / metaProteina!) * 100)
    : undefined;

  const caloriasEnMargen =
    desviacionCaloriasPct !== undefined &&
    Math.abs(desviacionCaloriasPct) <= TOLERANCIA_TOTALES_NUTRICIONAL_PCT;
  const proteinaEnMargen =
    desviacionProteinasPct !== undefined &&
    Math.abs(desviacionProteinasPct) <= TOLERANCIA_TOTALES_NUTRICIONAL_PCT;

  const dimensionesEvaluadas = [
    ...(desviacionCaloriasPct !== undefined ? [caloriasEnMargen] : []),
    ...(desviacionProteinasPct !== undefined ? [proteinaEnMargen] : []),
  ];

  return {
    dentroMargenTolerancia: dimensionesEvaluadas.every(Boolean),
    desviacionCaloriasPct,
    desviacionProteinasPct,
  };
}

// =============================================================================
// VENTANA HORARIA DEL CHECK-IN (RF-002 RN-02)
// =============================================================================

export type MotivoFueraDeVentana = 'FUERA_DE_VENTANA' | 'FECHA_DISTINTA_AL_DIA_LOCAL';

export interface ResultadoVentanaCheckinNutricional {
  permitido: boolean;
  /** Fecha local YYYY-MM-DD del alumno en el instante evaluado. */
  fechaLocalHoy: string;
  /** Hora local (0–23) del alumno en el instante evaluado. */
  horaLocal: number;
  /** Zona IANA efectivamente usada (la del cliente si es válida, si no la por defecto). */
  timezone: string;
  motivo?: MotivoFueraDeVentana;
}

/** Zona IANA válida del cliente o la zona por defecto del producto (RN-05/ADR-002). */
export function resolverTimezoneNutricion(timezoneCliente?: string | null): string {
  return timezoneCliente && esTimezoneIanaValida(timezoneCliente)
    ? timezoneCliente
    : TIMEZONE_NUTRICION_POR_DEFECTO;
}

/** Hora local 0–23 de un instante en una zona IANA (h23: medianoche = 00, nunca 24). */
function obtenerHoraLocal(fecha: Date, timezone: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? '0');
  return Number.isFinite(hora) ? hora % 24 : 0;
}

/**
 * RF-002 RN-02: el check-in 1-Tap solo se habilita entre las 18:00 y las 23:59 (hora local del
 * alumno) y para el día local en curso. Fuera de esa ventana el día ya cerró: el reporte se
 * rechaza (el día quedará `No reportado` si nunca se registró), nunca se acepta tarde en
 * silencio.
 */
export function evaluarVentanaCheckinNutricional(
  fecha: string,
  timezoneCliente?: string | null,
  ahora: Date = new Date()
): ResultadoVentanaCheckinNutricional {
  const timezone = resolverTimezoneNutricion(timezoneCliente);
  const fechaLocalHoy = obtenerFechaLocalYyyyMmDd(ahora, timezone);
  const horaLocal = obtenerHoraLocal(ahora, timezone);

  if (fecha !== fechaLocalHoy) {
    return { permitido: false, fechaLocalHoy, horaLocal, timezone, motivo: 'FECHA_DISTINTA_AL_DIA_LOCAL' };
  }

  if (
    horaLocal < HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL ||
    horaLocal > HORA_FIN_VENTANA_CHECKIN_NUTRICIONAL
  ) {
    return { permitido: false, fechaLocalHoy, horaLocal, timezone, motivo: 'FUERA_DE_VENTANA' };
  }

  return { permitido: true, fechaLocalHoy, horaLocal, timezone };
}

// =============================================================================
// "NO REPORTADO" DEL CALENDARIO NUTRICIONAL (RF-002 §6)
// =============================================================================

/** Suma (o resta) días a una fecha YYYY-MM-DD con aritmética UTC, sin TZ del servidor. */
export function sumarDiasCalendario(fechaYyyyMmDd: string, dias: number): string {
  const [y, m, d] = fechaYyyyMmDd.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().split('T')[0];
}

/** Fechas YYYY-MM-DD del rango inclusivo [desde, hasta]. Vacío si el rango es inválido. */
export function enumerarFechasCalendario(desde: string, hasta: string): string[] {
  const fechas: string[] = [];
  let actual = desde;
  // Guard de rango invertido o malformado: nunca un bucle sin salida.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
    return fechas;
  }
  while (actual <= hasta) {
    fechas.push(actual);
    actual = sumarDiasCalendario(actual, 1);
  }
  return fechas;
}

/**
 * RF-002 §6: cuenta los días CERRADOS del rango [desde, hasta] en los que el alumno no registró
 * el semáforo. El llamador decide qué días están cerrados (normalmente hasta ayer: el día en
 * curso sigue dentro de la ventana de las 18:00–23:59). `fechasReportadas` son YYYY-MM-DD.
 */
export function contarDiasNoReportados(
  desde: string,
  hasta: string,
  fechasReportadas: ReadonlySet<string>
): number {
  return enumerarFechasCalendario(desde, hasta).filter((fecha) => !fechasReportadas.has(fecha))
    .length;
}

function toIsoUtcString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

// =============================================================================
// SERVICIO DE NUTRICIÓN (RF-002)
// =============================================================================

@Injectable()
export class NutricionService {
  // Bóveda R2 opcional (RF-002 RN-03): sirve las URLs firmadas de lectura de las fotos de platos.
  // Sin servicio inyectado (p. ej. tests unitarios que construyen el service con solo la DB) las
  // fotos quedan sin `fotoUrl` — nunca se fabrica un enlace.
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Optional() @Inject(R2StorageService) private readonly r2StorageService?: R2StorageService
  ) {}

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
    const validado = CheckinNutricionalSchema.parse({ ...input, alumnoId });

    // Regla RN-02: ventana horaria local del alumno (18:00–23:59) y día local en curso.
    const ventana = evaluarVentanaCheckinNutricional(validado.fecha, validado.timezoneCliente, ahora);
    if (!ventana.permitido) {
      if (ventana.motivo === 'FECHA_DISTINTA_AL_DIA_LOCAL') {
        throw new BadRequestException(
          `La fecha del check-in '${validado.fecha}' no corresponde al día local actual '${ventana.fechaLocalHoy}' en la zona horaria del alumno '${ventana.timezone}'.`
        );
      }
      throw new BadRequestException(
        `El check-in nutricional solo se habilita entre las 18:00 y las 23:59 (hora local del alumno '${ventana.timezone}'). Fuera de esa ventana el día queda como 'No reportado'.`
      );
    }

    // Regla RN-03: Máximo 4 fotos de platos por día
    if (validado.fotosPlatos && validado.fotosPlatos.length > 4) {
      throw new BadRequestException(
        'Regla RN-03 violada: No se permiten más de 4 fotografías de platos por día.'
      );
    }

    // Verificar unicidad diaria por (alumno_id, fecha)
    const [existente] = await this.db
      .select()
      .from(checkinsNutricionales)
      .where(
        and(
          eq(checkinsNutricionales.alumnoId, alumnoId),
          eq(checkinsNutricionales.fecha, validado.fecha)
        )
      )
      .limit(1);

    if (existente) {
      throw new ConflictException(
        `Violación de unicidad: Ya existe un check-in nutricional registrado para el alumno '${alumnoId}' en la fecha '${validado.fecha}'.`
      );
    }

    // Insertar en transacción atómica
    const checkinId = await this.db.transaction(async (tx) => {
      const [nuevoCheckin] = await tx
        .insert(checkinsNutricionales)
        .values({
          alumnoId,
          fecha: validado.fecha,
          semaforo: validado.semaforo,
          caloriasReportadas: validado.caloriasReportadas ?? null,
          proteinaGramosReportada: validado.proteinaGramosReportada ?? null,
          aguaLitros: validado.aguaLitros ?? null,
          notasAlumno: validado.notasAlumno ?? null,
          createdAtUtc: new Date(),
          updatedAtUtc: new Date(),
        })
        .returning();

      if (validado.fotosPlatos && validado.fotosPlatos.length > 0) {
        for (const f of validado.fotosPlatos) {
          await tx.insert(fotosComida).values({
            checkinId: nuevoCheckin.id,
            tipoComida: f.tipoComida,
            storageKey: f.storageKey,
            createdAtUtc: new Date(),
          });
        }
      }

      return nuevoCheckin.id;
    });

    const checkinDetalle = await this.obtenerCheckinPorId(checkinId);

    // RF-002 Escenario 3: metas REALES del coach (RN-01). Sin metas persistidas el resultado
    // queda sin evaluar (campos `undefined`): nunca un falso "dentro del margen".
    const metasCoach = await this.obtenerMetasNutricionales(alumnoId);
    const tolerancia = evaluarToleranciaNutricional(
      validado.caloriasReportadas,
      validado.proteinaGramosReportada,
      metasCoach
    );

    return {
      checkin: checkinDetalle,
      dentroMargenTolerancia: tolerancia.dentroMargenTolerancia,
      desviacionCaloriasPct: tolerancia.desviacionCaloriasPct,
      desviacionProteinasPct: tolerancia.desviacionProteinasPct,
    };
  }

  // ---------------------------------------------------------------------------
  // METAS DEL COACH (RF-002 RN-01)
  // ---------------------------------------------------------------------------

  /**
   * Consultar las metas nutricionales de un alumno (o `null` si el coach no las configuró).
   * Usada por el alumno (las suyas) y por el coach (las de su alumno, tras validar tenancy).
   */
  async obtenerMetasNutricionales(alumnoId: string): Promise<MetasNutricionalesDetalleDTO | null> {
    const [fila] = await this.db
      .select()
      .from(metasNutricionales)
      .where(eq(metasNutricionales.alumnoId, alumnoId))
      .limit(1);

    return fila ? this.mapearMetas(fila) : null;
  }

  /**
   * Consultar las metas de un alumno de la cartera del coach (RN-01).
   * Valida tenancy ANTES de responder, incluso si el alumno no tiene metas.
   */
  async obtenerMetasDeAlumno(
    coachId: string,
    alumnoId: string
  ): Promise<MetasNutricionalesDetalleDTO | null> {
    await this.validarAlumnoDelCoach(coachId, alumnoId);
    return this.obtenerMetasNutricionales(alumnoId);
  }

  /**
   * Definir (crear o reemplazar) las metas nutricionales de un alumno del coach (RN-01).
   *
   * Semántica PUT: la fila se reemplaza completa; un campo omitido queda en NULL ("no
   * configurado"), nunca en 0 fabricado. Valida tenancy contra `perfiles_alumno`.
   */
  async definirMetasNutricionales(
    coachId: string,
    alumnoId: string,
    dto: MetasNutricionalesDTO
  ): Promise<MetasNutricionalesDetalleDTO> {
    const validado = MetasNutricionalesSchema.parse(dto);

    await this.validarAlumnoDelCoach(coachId, alumnoId);

    const valores = {
      caloriasObjetivo: validado.caloriasObjetivo ?? null,
      proteinaGramosObjetivo: validado.proteinaGramosObjetivo ?? null,
      carbohidratosGramosObjetivo: validado.carbohidratosGramosObjetivo ?? null,
      grasasGramosObjetivo: validado.grasasGramosObjetivo ?? null,
      aguaLitrosObjetivo: validado.aguaLitrosObjetivo ?? null,
      recursos: validado.recursos ?? [],
    };
    const now = new Date();

    const [existente] = await this.db
      .select()
      .from(metasNutricionales)
      .where(eq(metasNutricionales.alumnoId, alumnoId))
      .limit(1);

    if (existente) {
      const [actualizado] = await this.db
        .update(metasNutricionales)
        .set({ ...valores, updatedAtUtc: now })
        .where(eq(metasNutricionales.id, existente.id))
        .returning();

      return this.mapearMetas(actualizado);
    }

    const [creado] = await this.db
      .insert(metasNutricionales)
      .values({ alumnoId, ...valores, createdAtUtc: now, updatedAtUtc: now })
      .returning();

    return this.mapearMetas(creado);
  }

  /** Tenancy: el alumno debe pertenecer a la cartera del coach autenticado. */
  private async validarAlumnoDelCoach(coachId: string, alumnoId: string): Promise<void> {
    const [perfil] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.usuarioId, alumnoId),
          eq(perfilesAlumno.entrenadorId, coachId)
        )
      )
      .limit(1);

    if (!perfil) {
      throw new ForbiddenException(
        'Aislamiento de Tenant: Acceso denegado a datos de un alumno que no pertenece a este entrenador.'
      );
    }
  }

  private mapearMetas(fila: typeof metasNutricionales.$inferSelect): MetasNutricionalesDetalleDTO {
    return {
      id: fila.id,
      alumnoId: fila.alumnoId,
      caloriasObjetivo: fila.caloriasObjetivo,
      proteinaGramosObjetivo: fila.proteinaGramosObjetivo,
      carbohidratosGramosObjetivo: fila.carbohidratosGramosObjetivo,
      grasasGramosObjetivo: fila.grasasGramosObjetivo,
      aguaLitrosObjetivo: fila.aguaLitrosObjetivo,
      recursos: fila.recursos ?? [],
      createdAtUtc: toIsoUtcString(fila.createdAtUtc)!,
      updatedAtUtc: toIsoUtcString(fila.updatedAtUtc)!,
    };
  }

  /**
   * Consultar el reporte nutricional del día en curso (o fecha indicada) para el alumno.
   * Sin `fecha`, el día se resuelve en la zona local del alumno (RN-05/ADR-002), no en UTC.
   */
  async obtenerCheckinHoy(
    alumnoId: string,
    fecha?: string,
    timezoneCliente?: string
  ): Promise<CheckinNutricionalDetalleDTO | null> {
    const targetFecha =
      fecha || obtenerFechaLocalYyyyMmDd(new Date(), resolverTimezoneNutricion(timezoneCliente));

    const [checkin] = await this.db
      .select()
      .from(checkinsNutricionales)
      .where(
        and(
          eq(checkinsNutricionales.alumnoId, alumnoId),
          eq(checkinsNutricionales.fecha, targetFecha)
        )
      )
      .limit(1);

    if (!checkin) {
      return null;
    }

    return this.hidratarCheckin(checkin);
  }

  /**
   * Obtener detalle de check-in nutricional por su ID.
   */
  async obtenerCheckinPorId(checkinId: string): Promise<CheckinNutricionalDetalleDTO> {
    const [checkin] = await this.db
      .select()
      .from(checkinsNutricionales)
      .where(eq(checkinsNutricionales.id, checkinId))
      .limit(1);

    if (!checkin) {
      throw new NotFoundException(`Check-in nutricional con ID '${checkinId}' no encontrado.`);
    }

    return this.hidratarCheckin(checkin);
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
    // Validar aislamiento Tenancy
    if (callerRol === Rol.ALUMNO && callerId && callerId !== alumnoId) {
      throw new ForbiddenException('Aislamiento de Tenant: Solo puedes consultar tus propios check-ins.');
    }

    if (callerRol === Rol.ENTRENADOR) {
      await this.validarAlumnoDelCoach(entrenadorId, alumnoId);
    }

    const conditions = [eq(checkinsNutricionales.alumnoId, alumnoId)];

    if (filtro?.desde) {
      conditions.push(gte(checkinsNutricionales.fecha, filtro.desde));
    }
    if (filtro?.hasta) {
      conditions.push(lte(checkinsNutricionales.fecha, filtro.hasta));
    }
    if (filtro?.semaforo) {
      conditions.push(eq(checkinsNutricionales.semaforo, filtro.semaforo));
    }

    const rows = await this.db
      .select()
      .from(checkinsNutricionales)
      .where(and(...conditions))
      .orderBy(desc(checkinsNutricionales.fecha));

    const checkinIds = rows.map((r) => r.id);
    const fotosMap = new Map<string, FotoComidaDetalleDTO[]>();

    if (checkinIds.length > 0) {
      const fotosRows = await this.db
        .select()
        .from(fotosComida)
        .where(inArray(fotosComida.checkinId, checkinIds));

      // RN-03: cada foto se hidrata con su URL firmada de lectura (TTL 900s). `fotoUrl` queda
      // null si la firma falla o no hay bóveda configurada; la UI lo declara en vez de romperse.
      const fotosHidratadas = await Promise.all(
        fotosRows.map(async (f) => ({
          id: f.id,
          checkinId: f.checkinId,
          tipoComida: f.tipoComida,
          storageKey: f.storageKey,
          fotoUrl: await this.resolverFotoUrl(f.storageKey),
          createdAtUtc: toIsoUtcString(f.createdAtUtc)!,
        }))
      );

      for (const foto of fotosHidratadas) {
        if (!fotosMap.has(foto.checkinId)) {
          fotosMap.set(foto.checkinId, []);
        }
        fotosMap.get(foto.checkinId)!.push(foto);
      }
    }

    return rows.map((r) => ({
      id: r.id,
      alumnoId: r.alumnoId,
      fecha: r.fecha,
      semaforo: r.semaforo,
      caloriasReportadas: r.caloriasReportadas,
      proteinaGramosReportada: r.proteinaGramosReportada,
      aguaLitros: r.aguaLitros,
      notasAlumno: r.notasAlumno,
      fotosPlatos: fotosMap.get(r.id) || [],
      createdAtUtc: toIsoUtcString(r.createdAtUtc)!,
      updatedAtUtc: toIsoUtcString(r.updatedAtUtc)!,
    }));
  }

  // ---------------------------------------------------------------------------
  // HELPER: HIDRATACIÓN DE CHECKIN CON FOTOS Y ALUMNO
  // ---------------------------------------------------------------------------

  /**
   * RN-03: URL firmada de lectura de una foto del diario (TTL 900s). `null` honesto cuando no
   * hay bóveda inyectada o la firma falla: el llamador nunca recibe un enlace inventado.
   */
  private async resolverFotoUrl(storageKey: string): Promise<string | null> {
    if (!this.r2StorageService) return null;
    try {
      return await this.r2StorageService.generarPresignedGetUrl(storageKey, 900);
    } catch {
      return null;
    }
  }

  private async hidratarCheckin(checkin: any): Promise<CheckinNutricionalDetalleDTO> {
    const fotos = await this.db
      .select()
      .from(fotosComida)
      .where(eq(fotosComida.checkinId, checkin.id))
      .orderBy(asc(fotosComida.createdAtUtc));

    let alumnoNombre: string | undefined;
    const [perfilAlumno] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, checkin.alumnoId))
      .limit(1);

    if (perfilAlumno) {
      alumnoNombre = `${perfilAlumno.nombres} ${perfilAlumno.apellidos}`.trim();
    }

    return {
      id: checkin.id,
      alumnoId: checkin.alumnoId,
      fecha: checkin.fecha,
      semaforo: checkin.semaforo,
      caloriasReportadas: checkin.caloriasReportadas,
      proteinaGramosReportada: checkin.proteinaGramosReportada,
      aguaLitros: checkin.aguaLitros,
      notasAlumno: checkin.notasAlumno,
      fotosPlatos: await Promise.all(
        fotos.map(async (f) => ({
          id: f.id,
          checkinId: f.checkinId,
          tipoComida: f.tipoComida,
          storageKey: f.storageKey,
          fotoUrl: await this.resolverFotoUrl(f.storageKey),
          createdAtUtc: toIsoUtcString(f.createdAtUtc)!,
        }))
      ),
      alumnoNombre,
      createdAtUtc: toIsoUtcString(checkin.createdAtUtc)!,
      updatedAtUtc: toIsoUtcString(checkin.updatedAtUtc)!,
    };
  }
}
