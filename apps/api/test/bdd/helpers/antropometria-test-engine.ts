import {
  Rol,
  Modalidad,
  OrigenAntropometria,
  EstadoMedicion,
  AnguloFoto,
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
  EvolucionCorporalDTO,
  ComparativaAngularDTO,
  FotoAntropometriaDetalleDTO,
  PerimetrosCorporalesDTO,
} from '@guachafit/shared';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

// =============================================================================
// MODELOS DE ESTADO EN MEMORIA (INVARIANTE DE DOMINIO - MÓDULO 4)
// =============================================================================

export interface AlumnoAntropometriaProfile {
  id: string;
  entrenadorId: string;
  nombres: string;
  apellidos: string;
  modalidad: Modalidad;
}

export interface FotoAntropometriaState {
  id: string;
  controlId: string;
  angulo: AnguloFoto;
  storageKey: string;
  presignedGetUrl?: string | null;
  createdAtUtc: string;
}

export interface ControlAntropometricoState {
  id: string;
  alumnoId: string;
  fechaEvaluacion: string; // YYYY-MM-DD
  pesoKg: string; // Decimal string con 2 decimales
  alturaCm?: string | null;
  porcentajeGrasa?: string | null;
  perimetros?: PerimetrosCorporalesDTO | null;
  modalidad: Modalidad;
  origen: OrigenAntropometria;
  registradoPor: string; // UUID
  estado: EstadoMedicion;
  observacionesCoach?: string | null;
  motivoRechazo?: string | null;
  fechaAprobacionUtc?: string | null; // ISO 8601 UTC
  fotos: FotoAntropometriaState[];
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface ActorContext {
  id: string;
  rol: Rol;
  entrenadorId?: string;
}

export interface ComparativaAngularResultadoDTO extends ComparativaAngularDTO {
  fotoDisponible: boolean;
}

// =============================================================================
// SERVICIO DE ALMACENAMIENTO CLOUDFLARE R2 (RNF-001, ADR-007)
// =============================================================================
import { R2StorageService } from '../../../src/modules/antropometria/r2-storage.service';
export { R2StorageService };

// =============================================================================
// MOTOR DE TEST BDD: CONTROL ANTROPOMÉTRICO & RBAC HÍBRIDO (RF-003, RF-004, ADR-001)
// =============================================================================

export class AntropometriaTestEngine {
  private alumnos = new Map<string, AlumnoAntropometriaProfile>();
  private controles = new Map<string, ControlAntropometricoState>();
  public readonly storageService: R2StorageService;

  constructor(storageService?: R2StorageService) {
    this.storageService = storageService ?? new R2StorageService();
  }

  registrarAlumno(alumno: AlumnoAntropometriaProfile): void {
    this.alumnos.set(alumno.id, alumno);
  }

  obtenerAlumno(alumnoId: string): AlumnoAntropometriaProfile | undefined {
    return this.alumnos.get(alumnoId);
  }

  /**
   * Registro de check-in antropométrico con RBAC Híbrido (ADR-001, RF-003).
   */
  async registrarCheckin(params: {
    actor: ActorContext;
    alumno: AlumnoAntropometriaProfile;
    dto: CheckinAntropometricoDTO;
    customId?: string;
  }): Promise<ControlAntropometricoState> {
    const { actor, alumno, dto, customId } = params;

    // 1. Validación de contrato y límites biológicos con Zod (RF-003 RN-02, Casos Borde)
    const validado = CheckinAntropometricoSchema.parse(dto);

    // 2. Aplicación de RBAC Híbrido (ADR-001, RF-003 RN-03, RN-04)
    let origen: OrigenAntropometria;
    let estado: EstadoMedicion;
    let registradoPor: string;
    let fechaAprobacionUtc: string | null = null;
    const nowIso = new Date().toISOString();

    if (actor.rol === Rol.ALUMNO) {
      // Verificación de identidad: alumno solo puede enviar para sí mismo
      if (actor.id !== alumno.id) {
        throw new ForbiddenException('Aislamiento RBAC: No puede registrar métricas para otro alumno.');
      }

      // Invariante ADR-001: Alumno en modalidad Presencial NO tiene permiso de escritura
      if (alumno.modalidad === Modalidad.PRESENCIAL) {
        throw new ForbiddenException(
          'Los alumnos en modalidad presencial no registran sus propias medidas: las toma tu entrenador y quedan verificadas.'
        );
      }

      // Modalidad Remoto: Autoreporte condicional
      origen = OrigenAntropometria.REMOTO_AUTOREPORTE;
      estado = EstadoMedicion.PENDIENTE_APROBACION;
      registradoPor = actor.id;
      fechaAprobacionUtc = null;
    } else if (actor.rol === Rol.ENTRENADOR) {
      // Entrenador en consulta presencial o asistida
      origen = OrigenAntropometria.PRESENCIAL_VERIFICADO;
      estado = EstadoMedicion.APROBADO;
      registradoPor = actor.id;
      fechaAprobacionUtc = nowIso;
    } else {
      throw new ForbiddenException('Rol no autorizado para registrar evaluaciones antropométricas.');
    }

    const controlId = customId ?? `ctrl-${randomUUID()}`;

    // Procesar fotos adjuntas
    const fotos: FotoAntropometriaState[] = (validado.fotos ?? []).map((f, idx) => ({
      id: `foto-${controlId}-${idx + 1}`,
      controlId,
      angulo: f.angulo,
      storageKey: f.storageKey,
      createdAtUtc: nowIso,
    }));

    const controlState: ControlAntropometricoState = {
      id: controlId,
      alumnoId: alumno.id,
      fechaEvaluacion: validado.fechaEvaluacion,
      pesoKg: validado.pesoKg,
      alturaCm: validado.alturaCm ?? null,
      porcentajeGrasa: validado.porcentajeGrasa ?? null,
      perimetros: validado.perimetros ?? null,
      modalidad: alumno.modalidad,
      origen,
      registradoPor,
      estado,
      observacionesCoach: validado.observacionesCoach ?? null,
      motivoRechazo: null,
      fechaAprobacionUtc,
      fotos,
      createdAtUtc: nowIso,
      updatedAtUtc: nowIso,
    };

    this.controles.set(controlId, controlState);
    return controlState;
  }

  /**
   * Conciliación de check-in antropométrico por el entrenador (RF-003 RN-04, API §5).
   */
  conciliarCheckin(params: {
    coachId: string;
    controlId: string;
    dto: ConciliarAntropometriaDTO;
  }): ControlAntropometricoState {
    const { coachId, controlId, dto } = params;

    // Validación de contrato (incluye superRefine que exige motivoRechazo si accion == 'rechazar')
    const validado = ConciliarAntropometriaSchema.parse(dto);

    const control = this.controles.get(controlId);
    if (!control) {
      throw new NotFoundException(`Control antropométrico con ID '${controlId}' no encontrado.`);
    }

    const alumno = this.alumnos.get(control.alumnoId);
    if (alumno && alumno.entrenadorId !== coachId) {
      throw new ForbiddenException('Aislamiento de Tenant: Acceso denegado a datos de otro entrenador.');
    }

    const nowIso = new Date().toISOString();

    if (validado.accion === 'aprobar') {
      control.estado = EstadoMedicion.APROBADO;
      control.fechaAprobacionUtc = nowIso;
      control.motivoRechazo = null;
      if (validado.observacionesCoach) {
        control.observacionesCoach = validado.observacionesCoach;
      }
    } else if (validado.accion === 'rechazar') {
      if (!validado.motivoRechazo || validado.motivoRechazo.trim().length === 0) {
        throw new BadRequestException('El motivo de rechazo es obligatorio al rechazar una evaluación antropométrica.');
      }
      control.estado = EstadoMedicion.RECHAZADO;
      control.motivoRechazo = validado.motivoRechazo;
      control.fechaAprobacionUtc = null;
      if (validado.observacionesCoach) {
        control.observacionesCoach = validado.observacionesCoach;
      }
    }

    control.updatedAtUtc = nowIso;
    this.controles.set(controlId, control);
    return control;
  }

  /**
   * Consulta de evolución corporal multieje con filtrado estricto por 'Aprobado' (ADR-001, RF-004 RN-01).
   */
  async obtenerEvolucionCorporal(
    alumnoId: string,
    filtro?: FiltroEvolucionAntropometricaDTO
  ): Promise<EvolucionCorporalDTO> {
    if (filtro) {
      FiltroEvolucionAntropometricaSchema.parse(filtro);
    }

    // 1. Filtrar evaluaciones del alumno
    const controlesAlumno = Array.from(this.controles.values()).filter(
      (c) => c.alumnoId === alumnoId
    );

    // 2. Invariante ADR-001: Filtrado ESTRICTO por estado == 'Aprobado'
    let aprobados = controlesAlumno.filter((c) => c.estado === EstadoMedicion.APROBADO);

    // 3. Filtrar por rango de fechas si se proporciona
    if (filtro?.desde) {
      aprobados = aprobados.filter((c) => c.fechaEvaluacion >= filtro.desde!);
    }
    if (filtro?.hasta) {
      aprobados = aprobados.filter((c) => c.fechaEvaluacion <= filtro.hasta!);
    }

    // 4. Ordenar cronológicamente (ascendente)
    aprobados.sort((a, b) => a.fechaEvaluacion.localeCompare(b.fechaEvaluacion));

    // 5. Asignar URLs presignadas GET de 15 minutos (RNF-001)
    const evaluacionesDetalle: ControlAntropometricoDetalleDTO[] = await Promise.all(
      aprobados.map(async (ctrl) => {
        const fotosConSignedUrl: FotoAntropometriaDetalleDTO[] = await Promise.all(
          ctrl.fotos.map(async (foto) => ({
            id: foto.id,
            controlId: foto.controlId,
            angulo: foto.angulo,
            storageKey: foto.storageKey,
            presignedGetUrl: await this.storageService.generarPresignedGetUrl(foto.storageKey, 900),
            createdAtUtc: foto.createdAtUtc,
          }))
        );

        return {
          id: ctrl.id,
          alumnoId: ctrl.alumnoId,
          fechaEvaluacion: ctrl.fechaEvaluacion,
          pesoKg: ctrl.pesoKg,
          alturaCm: ctrl.alturaCm,
          porcentajeGrasa: ctrl.porcentajeGrasa,
          perimetros: ctrl.perimetros,
          modalidad: ctrl.modalidad,
          origen: ctrl.origen,
          registradoPor: ctrl.registradoPor,
          estado: ctrl.estado,
          observacionesCoach: ctrl.observacionesCoach,
          fechaAprobacionUtc: ctrl.fechaAprobacionUtc,
          fotos: fotosConSignedUrl,
          createdAtUtc: ctrl.createdAtUtc,
          updatedAtUtc: ctrl.updatedAtUtc,
        };
      })
    );

    // 6. Calcular cambios netos (delta peso y delta grasa)
    let cambioNetoPesoKg: string | null = null;
    let cambioNetoGrasaPorcentaje: string | null = null;

    if (evaluacionesDetalle.length >= 2) {
      const primera = evaluacionesDetalle[0];
      const ultima = evaluacionesDetalle[evaluacionesDetalle.length - 1];

      const pesoInicial = Number(primera.pesoKg);
      const pesoFinal = Number(ultima.pesoKg);
      cambioNetoPesoKg = (pesoFinal - pesoInicial).toFixed(2);

      if (primera.porcentajeGrasa !== null && ultima.porcentajeGrasa !== null) {
        const grasaInicial = Number(primera.porcentajeGrasa);
        const grasaFinal = Number(ultima.porcentajeGrasa);
        cambioNetoGrasaPorcentaje = (grasaFinal - grasaInicial).toFixed(2);
      }
    } else if (evaluacionesDetalle.length === 1) {
      cambioNetoPesoKg = '0.00';
      if (evaluacionesDetalle[0].porcentajeGrasa !== null) {
        cambioNetoGrasaPorcentaje = '0.00';
      }
    }

    return {
      alumnoId,
      totalEvaluaciones: evaluacionesDetalle.length,
      // WU24b: el motor de pruebas no pagina; el total real coincide con la serie devuelta.
      controlesTotal: evaluacionesDetalle.length,
      evaluaciones: evaluacionesDetalle,
      cambioNetoPesoKg,
      cambioNetoGrasaPorcentaje,
      rangoSeleccionado: filtro?.periodo ?? 'todo',
    };
  }

  /**
   * Comparador fotográfico angular (RF-004 RN-02, RN-03, Casos Borde).
   */
  async compararFotografias(
    alumnoId: string,
    dto: ConsultaComparadorFotograficoDTO
  ): Promise<ComparativaAngularResultadoDTO> {
    ConsultaComparadorFotograficoSchema.parse(dto);

    const controlA = this.controles.get(dto.controlIdA);
    const controlB = this.controles.get(dto.controlIdB);

    if (!controlA || controlA.alumnoId !== alumnoId) {
      throw new NotFoundException(`Control antropométrico A (${dto.controlIdA}) no encontrado para este alumno.`);
    }
    if (!controlB || controlB.alumnoId !== alumnoId) {
      throw new NotFoundException(`Control antropométrico B (${dto.controlIdB}) no encontrado para este alumno.`);
    }

    // Invariante ADR-001: Ambos controles deben estar APROBADOS
    if (controlA.estado !== EstadoMedicion.APROBADO || controlB.estado !== EstadoMedicion.APROBADO) {
      throw new BadRequestException('Solo es posible comparar fotográficamente evaluaciones en estado Aprobado.');
    }

    // Buscar fotos para el ángulo solicitado
    const fotoARaw = controlA.fotos.find((f) => f.angulo === dto.angulo);
    const fotoBRaw = controlB.fotos.find((f) => f.angulo === dto.angulo);

    let fotoA: FotoAntropometriaDetalleDTO | null = null;
    let fotoB: FotoAntropometriaDetalleDTO | null = null;

    if (fotoARaw) {
      fotoA = {
        id: fotoARaw.id,
        controlId: fotoARaw.controlId,
        angulo: fotoARaw.angulo,
        storageKey: fotoARaw.storageKey,
        presignedGetUrl: await this.storageService.generarPresignedGetUrl(fotoARaw.storageKey, 900),
        createdAtUtc: fotoARaw.createdAtUtc,
      };
    }

    if (fotoBRaw) {
      fotoB = {
        id: fotoBRaw.id,
        controlId: fotoBRaw.controlId,
        angulo: fotoBRaw.angulo,
        storageKey: fotoBRaw.storageKey,
        presignedGetUrl: await this.storageService.generarPresignedGetUrl(fotoBRaw.storageKey, 900),
        createdAtUtc: fotoBRaw.createdAtUtc,
      };
    }

    // Caso Borde RF-004: Si falta foto en alguna fecha, no lanzar 500
    const fotoDisponible = Boolean(fotoA && fotoB);

    // Calcular diferencias numéricas entre control B y control A
    const pesoA = Number(controlA.pesoKg);
    const pesoB = Number(controlB.pesoKg);
    const diferenciaPesoKg = (pesoB - pesoA).toFixed(2);

    let diferenciaGrasaPorcentaje: string | null = null;
    if (controlA.porcentajeGrasa !== null && controlB.porcentajeGrasa !== null) {
      const grasaA = Number(controlA.porcentajeGrasa);
      const grasaB = Number(controlB.porcentajeGrasa);
      diferenciaGrasaPorcentaje = (grasaB - grasaA).toFixed(2);
    }

    const mapDetalle = (ctrl: ControlAntropometricoState): ControlAntropometricoDetalleDTO => ({
      id: ctrl.id,
      alumnoId: ctrl.alumnoId,
      fechaEvaluacion: ctrl.fechaEvaluacion,
      pesoKg: ctrl.pesoKg,
      alturaCm: ctrl.alturaCm,
      porcentajeGrasa: ctrl.porcentajeGrasa,
      perimetros: ctrl.perimetros,
      modalidad: ctrl.modalidad,
      origen: ctrl.origen,
      registradoPor: ctrl.registradoPor,
      estado: ctrl.estado,
      observacionesCoach: ctrl.observacionesCoach,
      fechaAprobacionUtc: ctrl.fechaAprobacionUtc,
      fotos: [],
      createdAtUtc: ctrl.createdAtUtc,
      updatedAtUtc: ctrl.updatedAtUtc,
    });

    return {
      angulo: dto.angulo,
      controlA: mapDetalle(controlA),
      controlB: mapDetalle(controlB),
      fotoA,
      fotoB,
      fotoDisponible,
      diferenciaPesoKg,
      diferenciaGrasaPorcentaje,
    };
  }

  obtenerControlPorId(controlId: string): ControlAntropometricoState | undefined {
    return this.controles.get(controlId);
  }

  limpiar(): void {
    this.alumnos.clear();
    this.controles.clear();
  }
}
