import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DRIZZLE_DB } from '../../database/database.module';
import {
  Database,
  eq,
  and,
  desc,
  asc,
  inArray,
  gte,
  lte,
  count,
  controlesAntropometricos,
  fotosAntropometria,
  perfilesAlumno,
} from '@guachafit/database';
import {
  Rol,
  Modalidad,
  OrigenAntropometria,
  EstadoMedicion,
  CheckinAntropometricoDTO,
  CheckinAntropometricoSchema,
  ConciliarAntropometriaDTO,
  ConciliarAntropometriaSchema,
  PresignedUploadUrlDTO,
  PresignedUploadUrlSchema,
  PresignedUploadUrlResponseDTO,
  FiltroEvolucionAntropometricaDTO,
  FiltroEvolucionAntropometricaSchema,
  ConsultaComparadorFotograficoDTO,
  ConsultaComparadorFotograficoSchema,
  ControlAntropometricoDetalleDTO,
  ColaPendientesAntropometricosDTO,
  EvolucionCorporalDTO,
  ComparativaAngularDTO,
  FotoAntropometriaDetalleDTO,
  PerimetrosCorporalesDTO,
  LIMITE_COLA_ANTROPOMETRIA_POR_DEFECTO,
  LIMITE_CONTROLES_EVOLUCION_POR_DEFECTO,
} from '@guachafit/shared';
import { R2StorageService } from './r2-storage.service';

export interface ComparativaAngularResultadoDTO extends ComparativaAngularDTO {
  fotoDisponible: boolean;
}

function toIsoUtcString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

@Injectable()
export class AntropometriaService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    public readonly r2StorageService: R2StorageService
  ) {}

  /**
   * Genera URL presignada PUT directa a Cloudflare R2 con TTL de 15 minutos (RNF-001, ADR-007).
   * Aplica validación RBAC híbrida: los alumnos presenciales no pueden subir fotos corporales de antropometría.
   */
  async solicitarPresignedUploadUrl(
    caller: { id: string; rol: Rol; entrenadorId?: string },
    dto: PresignedUploadUrlDTO,
    customUuid?: string
  ): Promise<PresignedUploadUrlResponseDTO> {
    const validado = PresignedUploadUrlSchema.parse(dto);

    const [alumno] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, validado.alumnoId))
      .limit(1);

    if (!alumno) {
      throw new NotFoundException(`Perfil del alumno '${validado.alumnoId}' no encontrado.`);
    }

    if (caller.rol === Rol.ALUMNO) {
      if (caller.id !== validado.alumnoId) {
        throw new ForbiddenException('Aislamiento RBAC: No puede solicitar URLs de subida para otro alumno.');
      }
      if (validado.modulo === 'antropometria' && alumno.modalidad === Modalidad.PRESENCIAL) {
        throw new ForbiddenException(
          'RBAC Híbrido: Los alumnos en modalidad presencial tienen permisos de solo lectura. El registro debe ser realizado por el entrenador en sala.'
        );
      }
    } else if (caller.rol === Rol.ENTRENADOR) {
      const coachId = caller.entrenadorId || caller.id;
      if (alumno.entrenadorId !== coachId) {
        throw new ForbiddenException('Aislamiento de Tenant: Acceso denegado a datos de otro entrenador.');
      }
    }

    return this.r2StorageService.generarPresignedUploadUrl(validado, customUuid);
  }

  /**
   * Registra una evaluación antropométrica aplicando RBAC híbrido (ADR-001, RF-003):
   * - Presencial (por Coach): origen presencial_verificado, estado aprobado, fechaAprobacionUtc inmediata.
   * - Remoto (por Alumno): origen remoto_autoreporte, estado pendiente_aprobacion, fechaAprobacionUtc nula.
   * - Presencial (por Alumno): 403 Forbidden (solo lectura).
   */
  async registrarCheckin(
    caller: { id: string; rol: Rol; entrenadorId?: string },
    dto: CheckinAntropometricoDTO,
    customId?: string
  ): Promise<ControlAntropometricoDetalleDTO> {
    const validado = CheckinAntropometricoSchema.parse(dto);

    const [alumno] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, validado.alumnoId))
      .limit(1);

    if (!alumno) {
      throw new NotFoundException(`Perfil del alumno '${validado.alumnoId}' no encontrado.`);
    }

    let origen: OrigenAntropometria;
    let estado: EstadoMedicion;
    let registradoPor: string;
    let fechaAprobacionUtc: Date | null = null;
    const now = new Date();

    if (caller.rol === Rol.ALUMNO) {
      if (caller.id !== validado.alumnoId) {
        throw new ForbiddenException('Aislamiento RBAC: No puede registrar métricas para otro alumno.');
      }
      if (alumno.modalidad === Modalidad.PRESENCIAL) {
        throw new ForbiddenException(
          'RBAC Híbrido: Los alumnos en modalidad presencial tienen permisos de solo lectura. El registro debe ser realizado por el entrenador en sala.'
        );
      }
      origen = OrigenAntropometria.REMOTO_AUTOREPORTE;
      estado = EstadoMedicion.PENDIENTE_APROBACION;
      registradoPor = caller.id;
      fechaAprobacionUtc = null;
    } else if (caller.rol === Rol.ENTRENADOR) {
      const coachId = caller.entrenadorId || caller.id;
      if (alumno.entrenadorId !== coachId) {
        throw new ForbiddenException('Aislamiento de Tenant: Acceso denegado a datos de otro entrenador.');
      }
      origen = OrigenAntropometria.PRESENCIAL_VERIFICADO;
      estado = EstadoMedicion.APROBADO;
      registradoPor = caller.id;
      fechaAprobacionUtc = now;
    } else {
      throw new ForbiddenException('Rol no autorizado para registrar evaluaciones antropométricas.');
    }

    const controlId = await this.db.transaction(async (tx) => {
      const valuesToInsert: any = {
        alumnoId: validado.alumnoId,
        fechaEvaluacion: validado.fechaEvaluacion,
        pesoKg: validado.pesoKg,
        alturaCm: validado.alturaCm ?? null,
        porcentajeGrasa: validado.porcentajeGrasa ?? null,
        cuelloCm: validado.perimetros?.cuelloCm ?? null,
        pechoCm: validado.perimetros?.pechoCm ?? null,
        cinturaCm: validado.perimetros?.cinturaCm ?? null,
        caderaCm: validado.perimetros?.caderaCm ?? null,
        brazoCm: validado.perimetros?.brazoCm ?? null,
        musloCm: validado.perimetros?.musloCm ?? null,
        modalidad: alumno.modalidad,
        origen,
        registradoPor,
        estado,
        observacionesCoach: validado.observacionesCoach ?? null,
        motivoRechazo: null,
        fechaAprobacionUtc,
        createdAtUtc: now,
        updatedAtUtc: now,
      };

      if (customId) {
        valuesToInsert.id = customId;
      }

      const [inserted] = await tx
        .insert(controlesAntropometricos)
        .values(valuesToInsert)
        .returning();

      if (validado.fotos && validado.fotos.length > 0) {
        for (const f of validado.fotos) {
          await tx.insert(fotosAntropometria).values({
            controlId: inserted.id,
            angulo: f.angulo,
            storageKey: f.storageKey,
            createdAtUtc: now,
          });
        }
      }

      return inserted.id;
    });

    return this.obtenerControlPorIdInterno(controlId);
  }

  /**
   * Conciliación de check-in remoto por el entrenador (aprobación o rechazo con motivo obligatorio).
   */
  async conciliarControl(
    coachId: string,
    controlId: string,
    dto: ConciliarAntropometriaDTO
  ): Promise<ControlAntropometricoDetalleDTO> {
    const validado = ConciliarAntropometriaSchema.parse(dto);

    const [control] = await this.db
      .select()
      .from(controlesAntropometricos)
      .where(eq(controlesAntropometricos.id, controlId))
      .limit(1);

    if (!control) {
      throw new NotFoundException(`Control antropométrico con ID '${controlId}' no encontrado.`);
    }

    const [alumno] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, control.alumnoId))
      .limit(1);

    if (!alumno || alumno.entrenadorId !== coachId) {
      throw new ForbiddenException('Aislamiento de Tenant: Acceso denegado a datos de otro entrenador.');
    }

    const now = new Date();
    let nuevoEstado: EstadoMedicion;
    let fechaAprobacionUtc: Date | null = null;
    let motivoRechazo: string | null = null;

    if (validado.accion === 'aprobar') {
      nuevoEstado = EstadoMedicion.APROBADO;
      fechaAprobacionUtc = now;
      motivoRechazo = null;
    } else if (validado.accion === 'rechazar') {
      if (!validado.motivoRechazo || validado.motivoRechazo.trim().length === 0) {
        throw new BadRequestException('El motivo de rechazo es obligatorio al rechazar una evaluación antropométrica.');
      }
      nuevoEstado = EstadoMedicion.RECHAZADO;
      fechaAprobacionUtc = null;
      motivoRechazo = validado.motivoRechazo;
    } else {
      throw new BadRequestException('Acción no reconocida.');
    }

    await this.db
      .update(controlesAntropometricos)
      .set({
        estado: nuevoEstado,
        fechaAprobacionUtc,
        motivoRechazo,
        observacionesCoach:
          validado.observacionesCoach !== undefined ? validado.observacionesCoach : control.observacionesCoach,
        updatedAtUtc: now,
      })
      .where(eq(controlesAntropometricos.id, controlId));

    return this.obtenerControlPorIdInterno(controlId);
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
    if (filtro) {
      FiltroEvolucionAntropometricaSchema.parse(filtro);
    }

    if (caller) {
      if (caller.rol === Rol.ALUMNO && caller.id !== alumnoId) {
        throw new ForbiddenException('Aislamiento RBAC: Solo puedes consultar tu propia evolución corporal.');
      }
      if (caller.rol === Rol.ENTRENADOR) {
        const coachId = caller.entrenadorId || caller.id;
        const [perfil] = await this.db
          .select()
          .from(perfilesAlumno)
          .where(eq(perfilesAlumno.usuarioId, alumnoId))
          .limit(1);

        if (!perfil || perfil.entrenadorId !== coachId) {
          throw new ForbiddenException('Aislamiento de Tenant: Acceso denegado a datos de otro entrenador.');
        }
      }
    }

    const conditions = [
      eq(controlesAntropometricos.alumnoId, alumnoId),
      eq(controlesAntropometricos.estado, EstadoMedicion.APROBADO),
    ];

    if (filtro?.desde) {
      conditions.push(gte(controlesAntropometricos.fechaEvaluacion, filtro.desde));
    }
    if (filtro?.hasta) {
      conditions.push(lte(controlesAntropometricos.fechaEvaluacion, filtro.hasta));
    }
    if (filtro?.periodo && filtro.periodo !== 'todo' && !filtro.desde) {
      const now = new Date();
      let meses = 1;
      if (filtro.periodo === '3M') meses = 3;
      else if (filtro.periodo === '6M') meses = 6;
      else if (filtro.periodo === '1A') meses = 12;
      const fechaDesde = new Date(now.setMonth(now.getMonth() - meses)).toISOString().split('T')[0];
      conditions.push(gte(controlesAntropometricos.fechaEvaluacion, fechaDesde));
    }

    const whereEvolucion = and(...conditions);

    // WU24b: COUNT real en SQL para el total del envelope (independiente del slice).
    const [filaTotal] = await this.db
      .select({ total: count() })
      .from(controlesAntropometricos)
      .where(whereEvolucion);
    const totalControles = Number(filaTotal?.total ?? 0);

    // WU24b: paginación OPT-IN; sin parámetros la serie completa sigue siendo el default.
    const paginando = filtro?.controlesLimit !== undefined || filtro?.controlesOffset !== undefined;
    const controlesLimit = paginando
      ? filtro?.controlesLimit ?? LIMITE_CONTROLES_EVOLUCION_POR_DEFECTO
      : undefined;
    const controlesOffset = paginando ? filtro?.controlesOffset ?? 0 : 0;

    const queryEvolucion = this.db
      .select()
      .from(controlesAntropometricos)
      .where(whereEvolucion)
      .orderBy(
        asc(controlesAntropometricos.fechaEvaluacion),
        // WU24b: desempate estable para que `controlesOffset` no repita ni salte filas.
        asc(controlesAntropometricos.createdAtUtc),
        asc(controlesAntropometricos.id)
      );

    const rows = await (controlesLimit !== undefined
      ? queryEvolucion.limit(controlesLimit).offset(controlesOffset)
      : queryEvolucion);

    const evaluaciones: ControlAntropometricoDetalleDTO[] = await Promise.all(
      rows.map((row) => this.hidratarControl(row))
    );

    let cambioNetoPesoKg: string | null = null;
    let cambioNetoGrasaPorcentaje: string | null = null;

    // WU24b: los cambios netos se calculan sobre la SERIE COMPLETA (no la página) con dos
    // consultas ligeras de primera/última evaluación; así el valor no depende del slice.
    if (totalControles >= 1) {
      const [primera] = await this.db
        .select({
          pesoKg: controlesAntropometricos.pesoKg,
          porcentajeGrasa: controlesAntropometricos.porcentajeGrasa,
        })
        .from(controlesAntropometricos)
        .where(whereEvolucion)
        .orderBy(
          asc(controlesAntropometricos.fechaEvaluacion),
          asc(controlesAntropometricos.createdAtUtc),
          asc(controlesAntropometricos.id)
        )
        .limit(1);

      if (totalControles === 1) {
        cambioNetoPesoKg = '0.00';
        if (primera && primera.porcentajeGrasa !== null && primera.porcentajeGrasa !== undefined) {
          cambioNetoGrasaPorcentaje = '0.00';
        }
      } else {
        const [ultima] = await this.db
          .select({
            pesoKg: controlesAntropometricos.pesoKg,
            porcentajeGrasa: controlesAntropometricos.porcentajeGrasa,
          })
          .from(controlesAntropometricos)
          .where(whereEvolucion)
          .orderBy(
            desc(controlesAntropometricos.fechaEvaluacion),
            desc(controlesAntropometricos.createdAtUtc),
            desc(controlesAntropometricos.id)
          )
          .limit(1);

        if (primera && ultima) {
          cambioNetoPesoKg = (Number(ultima.pesoKg) - Number(primera.pesoKg)).toFixed(2);

          if (
            primera.porcentajeGrasa !== null &&
            primera.porcentajeGrasa !== undefined &&
            ultima.porcentajeGrasa !== null &&
            ultima.porcentajeGrasa !== undefined
          ) {
            cambioNetoGrasaPorcentaje = (
              Number(ultima.porcentajeGrasa) - Number(primera.porcentajeGrasa)
            ).toFixed(2);
          }
        }
      }
    }

    return {
      alumnoId,
      totalEvaluaciones: totalControles,
      controlesTotal: totalControles,
      evaluaciones,
      cambioNetoPesoKg,
      cambioNetoGrasaPorcentaje,
      rangoSeleccionado: filtro?.periodo ?? 'todo',
    };
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
    ConsultaComparadorFotograficoSchema.parse(dto);

    if (caller) {
      if (caller.rol === Rol.ALUMNO && caller.id !== alumnoId) {
        throw new ForbiddenException('Aislamiento RBAC: Solo puedes consultar tu propia comparativa.');
      }
      if (caller.rol === Rol.ENTRENADOR) {
        const coachId = caller.entrenadorId || caller.id;
        const [perfil] = await this.db
          .select()
          .from(perfilesAlumno)
          .where(eq(perfilesAlumno.usuarioId, alumnoId))
          .limit(1);

        if (!perfil || perfil.entrenadorId !== coachId) {
          throw new ForbiddenException('Aislamiento de Tenant: Acceso denegado a datos de otro entrenador.');
        }
      }
    }

    const [controlA] = await this.db
      .select()
      .from(controlesAntropometricos)
      .where(eq(controlesAntropometricos.id, dto.controlIdA))
      .limit(1);

    const [controlB] = await this.db
      .select()
      .from(controlesAntropometricos)
      .where(eq(controlesAntropometricos.id, dto.controlIdB))
      .limit(1);

    if (!controlA || controlA.alumnoId !== alumnoId) {
      throw new NotFoundException(`Control antropométrico A (${dto.controlIdA}) no encontrado para este alumno.`);
    }
    if (!controlB || controlB.alumnoId !== alumnoId) {
      throw new NotFoundException(`Control antropométrico B (${dto.controlIdB}) no encontrado para este alumno.`);
    }

    if (controlA.estado !== EstadoMedicion.APROBADO || controlB.estado !== EstadoMedicion.APROBADO) {
      throw new BadRequestException('Solo es posible comparar fotográficamente evaluaciones en estado Aprobado.');
    }

    const [fotoARaw] = await this.db
      .select()
      .from(fotosAntropometria)
      .where(
        and(
          eq(fotosAntropometria.controlId, dto.controlIdA),
          eq(fotosAntropometria.angulo, dto.angulo)
        )
      )
      .limit(1);

    const [fotoBRaw] = await this.db
      .select()
      .from(fotosAntropometria)
      .where(
        and(
          eq(fotosAntropometria.controlId, dto.controlIdB),
          eq(fotosAntropometria.angulo, dto.angulo)
        )
      )
      .limit(1);

    let fotoA: FotoAntropometriaDetalleDTO | null = null;
    let fotoB: FotoAntropometriaDetalleDTO | null = null;

    if (fotoARaw) {
      fotoA = {
        id: fotoARaw.id,
        controlId: fotoARaw.controlId,
        angulo: fotoARaw.angulo,
        storageKey: fotoARaw.storageKey,
        presignedGetUrl: await this.r2StorageService.generarPresignedGetUrl(fotoARaw.storageKey, 900),
        createdAtUtc: toIsoUtcString(fotoARaw.createdAtUtc)!,
      };
    }

    if (fotoBRaw) {
      fotoB = {
        id: fotoBRaw.id,
        controlId: fotoBRaw.controlId,
        angulo: fotoBRaw.angulo,
        storageKey: fotoBRaw.storageKey,
        presignedGetUrl: await this.r2StorageService.generarPresignedGetUrl(fotoBRaw.storageKey, 900),
        createdAtUtc: toIsoUtcString(fotoBRaw.createdAtUtc)!,
      };
    }

    const fotoDisponible = Boolean(fotoA && fotoB);

    const pesoA = Number(controlA.pesoKg);
    const pesoB = Number(controlB.pesoKg);
    const diferenciaPesoKg = (pesoB - pesoA).toFixed(2);

    let diferenciaGrasaPorcentaje: string | null = null;
    if (controlA.porcentajeGrasa !== null && controlB.porcentajeGrasa !== null) {
      const grasaA = Number(controlA.porcentajeGrasa);
      const grasaB = Number(controlB.porcentajeGrasa);
      diferenciaGrasaPorcentaje = (grasaB - grasaA).toFixed(2);
    }

    const controlADetalle = await this.hidratarControl(controlA, false);
    const controlBDetalle = await this.hidratarControl(controlB, false);

    return {
      angulo: dto.angulo,
      controlA: controlADetalle,
      controlB: controlBDetalle,
      fotoA,
      fotoB,
      fotoDisponible,
      diferenciaPesoKg,
      diferenciaGrasaPorcentaje,
    };
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
    const alumnosCoach = await this.db
      .select({
        usuarioId: perfilesAlumno.usuarioId,
        nombres: perfilesAlumno.nombres,
        apellidos: perfilesAlumno.apellidos,
      })
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.entrenadorId, coachId));

    const alumnoIds = alumnosCoach.map((a) => a.usuarioId);
    if (alumnoIds.length === 0) {
      return { items: [], total: 0, limit, offset };
    }

    // WU20: nombre visible del alumno para la cola del coach (aditivo; el cliente tiene fallback).
    const nombrePorAlumno = new Map(
      alumnosCoach.map((a) => [a.usuarioId, `${a.nombres} ${a.apellidos}`])
    );

    const wherePendientes = and(
      inArray(controlesAntropometricos.alumnoId, alumnoIds),
      eq(controlesAntropometricos.estado, EstadoMedicion.PENDIENTE_APROBACION)
    );

    // WU24b: COUNT real en SQL para el `total` del envelope.
    const [filaTotal] = await this.db
      .select({ total: count() })
      .from(controlesAntropometricos)
      .where(wherePendientes);

    const rows = await this.db
      .select()
      .from(controlesAntropometricos)
      .where(wherePendientes)
      .orderBy(
        desc(controlesAntropometricos.fechaEvaluacion),
        desc(controlesAntropometricos.createdAtUtc),
        desc(controlesAntropometricos.id)
      )
      .limit(limit)
      .offset(offset);

    const items = await Promise.all(
      rows.map((row) => this.hidratarControl(row, true, nombrePorAlumno.get(row.alumnoId) ?? null))
    );

    return {
      items,
      total: Number(filaTotal?.total ?? 0),
      limit,
      offset,
    };
  }

  /**
   * Obtiene un control antropométrico por su ID.
   */
  async obtenerControlPorId(
    controlId: string,
    caller?: { id: string; rol: Rol; entrenadorId?: string }
  ): Promise<ControlAntropometricoDetalleDTO> {
    const [control] = await this.db
      .select()
      .from(controlesAntropometricos)
      .where(eq(controlesAntropometricos.id, controlId))
      .limit(1);

    if (!control) {
      throw new NotFoundException(`Control antropométrico con ID '${controlId}' no encontrado.`);
    }

    if (caller) {
      if (caller.rol === Rol.ALUMNO && caller.id !== control.alumnoId) {
        throw new ForbiddenException('Aislamiento RBAC: No puede acceder a este control antropométrico.');
      }
      if (caller.rol === Rol.ENTRENADOR) {
        const coachId = caller.entrenadorId || caller.id;
        const [alumno] = await this.db
          .select()
          .from(perfilesAlumno)
          .where(eq(perfilesAlumno.usuarioId, control.alumnoId))
          .limit(1);

        if (!alumno || alumno.entrenadorId !== coachId) {
          throw new ForbiddenException('Aislamiento de Tenant: Acceso denegado a datos de otro entrenador.');
        }
      }
    }

    return this.hidratarControl(control);
  }

  // ---------------------------------------------------------------------------
  // HELPERS PRIVADOS DE HIDRATACIÓN
  // ---------------------------------------------------------------------------

  private async hidratarControl(
    control: any,
    cargarFotos = true,
    alumnoNombre: string | null = null
  ): Promise<ControlAntropometricoDetalleDTO> {
    let fotos: FotoAntropometriaDetalleDTO[] = [];
    if (cargarFotos) {
      const fotosRows = await this.db
        .select()
        .from(fotosAntropometria)
        .where(eq(fotosAntropometria.controlId, control.id))
        .orderBy(asc(fotosAntropometria.createdAtUtc));

      fotos = await Promise.all(
        fotosRows.map(async (f) => ({
          id: f.id,
          controlId: f.controlId,
          angulo: f.angulo,
          storageKey: f.storageKey,
          presignedGetUrl: await this.r2StorageService.generarPresignedGetUrl(f.storageKey, 900),
          createdAtUtc: toIsoUtcString(f.createdAtUtc)!,
        }))
      );
    }

    const perimetros: PerimetrosCorporalesDTO | null =
      control.cuelloCm ||
      control.pechoCm ||
      control.cinturaCm ||
      control.caderaCm ||
      control.brazoCm ||
      control.musloCm
        ? {
            cuelloCm: control.cuelloCm ?? undefined,
            pechoCm: control.pechoCm ?? undefined,
            cinturaCm: control.cinturaCm ?? undefined,
            caderaCm: control.caderaCm ?? undefined,
            brazoCm: control.brazoCm ?? undefined,
            musloCm: control.musloCm ?? undefined,
          }
        : null;

    return {
      id: control.id,
      alumnoId: control.alumnoId,
      alumnoNombre,
      fechaEvaluacion: control.fechaEvaluacion,
      pesoKg: control.pesoKg,
      alturaCm: control.alturaCm ?? null,
      porcentajeGrasa: control.porcentajeGrasa ?? null,
      perimetros,
      modalidad: control.modalidad,
      origen: control.origen,
      registradoPor: control.registradoPor,
      estado: control.estado,
      observacionesCoach: control.observacionesCoach ?? null,
      motivoRechazo: control.motivoRechazo ?? null,
      fechaAprobacionUtc: toIsoUtcString(control.fechaAprobacionUtc),
      fotos,
      createdAtUtc: toIsoUtcString(control.createdAtUtc)!,
      updatedAtUtc: toIsoUtcString(control.updatedAtUtc)!,
    };
  }

  private async obtenerControlPorIdInterno(controlId: string): Promise<ControlAntropometricoDetalleDTO> {
    const [control] = await this.db
      .select()
      .from(controlesAntropometricos)
      .where(eq(controlesAntropometricos.id, controlId))
      .limit(1);

    if (!control) {
      throw new NotFoundException(`Control antropométrico con ID '${controlId}' no encontrado.`);
    }

    return this.hidratarControl(control);
  }
}
