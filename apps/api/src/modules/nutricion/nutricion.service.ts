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
  desc,
  asc,
  inArray,
  gte,
  lte,
  checkinsNutricionales,
  fotosComida,
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
} from '@guachafit/shared';

// =============================================================================
// METAS Y TOLERANCIA NUTRICIONAL (RF-002, RN-01, RN-04)
// =============================================================================

export interface MetasNutricionalesCoach {
  caloriasObjetivo: number;
  proteinaGramosObjetivo: number;
  aguaLitrosObjetivo?: string;
}

export function evaluarToleranciaNutricional(
  caloriasReportadas?: number | null,
  proteinaGramosReportada?: number | null,
  metasCoach?: MetasNutricionalesCoach
): {
  dentroMargenTolerancia?: boolean;
  desviacionCaloriasPct?: number;
  desviacionProteinasPct?: number;
} {
  if (
    !metasCoach ||
    caloriasReportadas === null ||
    caloriasReportadas === undefined ||
    proteinaGramosReportada === null ||
    proteinaGramosReportada === undefined
  ) {
    return {};
  }

  const calReport = caloriasReportadas;
  const calMeta = metasCoach.caloriasObjetivo;
  const desviacionCaloriasPct = Math.round(((calReport - calMeta) / calMeta) * 10000) / 100;

  const protReport = proteinaGramosReportada;
  const protMeta = metasCoach.proteinaGramosObjetivo;
  const desviacionProteinasPct = Math.round(((protReport - protMeta) / protMeta) * 10000) / 100;

  const calEnMargen = Math.abs(desviacionCaloriasPct) <= 10.0;
  const protEnMargen = Math.abs(desviacionProteinasPct) <= 10.0;
  const dentroMargenTolerancia = calEnMargen && protEnMargen;

  return {
    dentroMargenTolerancia,
    desviacionCaloriasPct,
    desviacionProteinasPct,
  };
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
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  /**
   * Registrar check-in nutricional diario 1-Tap.
   * Valida semáforo, notas (hasta 280 caracteres), agua, calorías, proteínas
   * y hasta 4 fotografías de platos principales.
   * Aplica unicidad diaria por (alumno_id, fecha).
   */
  async registrarCheckinDiario(
    alumnoId: string,
    input: CheckinNutricionalDTO,
    metasCoach?: MetasNutricionalesCoach
  ): Promise<{
    checkin: CheckinNutricionalDetalleDTO;
    dentroMargenTolerancia?: boolean;
    desviacionCaloriasPct?: number;
    desviacionProteinasPct?: number;
  }> {
    const validado = CheckinNutricionalSchema.parse({ ...input, alumnoId });

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

  /**
   * Consultar el reporte nutricional del día en curso (o fecha indicada) para el alumno.
   */
  async obtenerCheckinHoy(
    alumnoId: string,
    fecha?: string
  ): Promise<CheckinNutricionalDetalleDTO | null> {
    const targetFecha = fecha || new Date().toISOString().split('T')[0];

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
      const [perfil] = await this.db
        .select()
        .from(perfilesAlumno)
        .where(
          and(
            eq(perfilesAlumno.usuarioId, alumnoId),
            eq(perfilesAlumno.entrenadorId, entrenadorId)
          )
        )
        .limit(1);

      if (!perfil) {
        throw new ForbiddenException(
          'Aislamiento de Tenant: Acceso denegado a datos de un alumno que no pertenece a este entrenador.'
        );
      }
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

      for (const f of fotosRows) {
        if (!fotosMap.has(f.checkinId)) {
          fotosMap.set(f.checkinId, []);
        }
        fotosMap.get(f.checkinId)!.push({
          id: f.id,
          checkinId: f.checkinId,
          tipoComida: f.tipoComida,
          storageKey: f.storageKey,
          createdAtUtc: toIsoUtcString(f.createdAtUtc)!,
        });
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
      fotosPlatos: fotos.map((f) => ({
        id: f.id,
        checkinId: f.checkinId,
        tipoComida: f.tipoComida,
        storageKey: f.storageKey,
        createdAtUtc: toIsoUtcString(f.createdAtUtc)!,
      })),
      alumnoNombre,
      createdAtUtc: toIsoUtcString(checkin.createdAtUtc)!,
      updatedAtUtc: toIsoUtcString(checkin.updatedAtUtc)!,
    };
  }
}
