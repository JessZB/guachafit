/**
 * Lecturas del barrido antropométrico.
 *
 * Copia palabra por palabra las consultas del procesador: controles por
 * rango y avisos previos por bandeja. Sin emisiones ni conteos.
 */
import {
  and,
  controlesAntropometricos,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  notificacionesInApp,
  perfilesAlumno,
  usuarios,
  type Database,
  type WithTenantFn,
} from '@guachafit/database';
import { EstadoAlumno } from '@guachafit/shared';
import type {
  AlumnoCalendarioReglas,
  AvisoBandejaReglas,
  AvisoReferenciaReglas,
  ControlAntropometricoReglas,
} from './recordatorio-reglas';

  /** Alumnos con calendario configurado (modalidad incluida: §6 solo avisa a remotos). */
export async function cargarAlumnosConCalendario(
  withTenant: WithTenantFn
): Promise<AlumnoCalendarioReglas[]> {
  // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; barrido transversal de sistema con
  // el bypass explícito `is_superadmin`.
  return (await withTenant({ isSuperadmin: true }, (tx) =>
    tx
      .select({
        usuarioId: perfilesAlumno.usuarioId,
        entrenadorId: perfilesAlumno.entrenadorId,
        nombres: perfilesAlumno.nombres,
        apellidos: perfilesAlumno.apellidos,
        modalidad: perfilesAlumno.modalidad,
        periodicidad: perfilesAlumno.periodicidadAntropometria,
        inicio: perfilesAlumno.antropometriaInicio,
        timezone: usuarios.timezone,
      })
      .from(perfilesAlumno)
      .innerJoin(usuarios, eq(perfilesAlumno.usuarioId, usuarios.id))
      .where(
        and(
          eq(perfilesAlumno.estadoActivacion, EstadoAlumno.ACTIVO),
          isNull(perfilesAlumno.deletedAtUtc),
          isNotNull(perfilesAlumno.periodicidadAntropometria),
          isNotNull(perfilesAlumno.antropometriaInicio)
        )
      )
  )) as AlumnoCalendarioReglas[];
}

/** Controles de los candidatos dentro de la ventana global de 48 h. */
export async function consultarControlesRecordatorio(
  db: Database,
  alumnoIds: string[],
  desdeGlobal: string,
  hastaGlobal: string
): Promise<ControlAntropometricoReglas[]> {
  return (await db
    .select({
      alumnoId: controlesAntropometricos.alumnoId,
      fechaEvaluacion: controlesAntropometricos.fechaEvaluacion,
    })
    .from(controlesAntropometricos)
    .where(
      and(
        inArray(controlesAntropometricos.alumnoId, alumnoIds),
        gte(controlesAntropometricos.fechaEvaluacion, desdeGlobal),
        lte(controlesAntropometricos.fechaEvaluacion, hastaGlobal)
      )
    )) as Array<{ alumnoId: string; fechaEvaluacion: string }>;
}

/** Avisos del día ya guardados en la bandeja desde el piso global. */
export async function consultarAvisosRecordatorio(
  db: Database,
  alumnoIds: string[],
  inicioAvisoGlobalUtc: Date,
  tipoEvento: string
): Promise<AvisoBandejaReglas[]> {
  return (await db
    .select({
      usuarioId: notificacionesInApp.usuarioId,
      createdAtUtc: notificacionesInApp.createdAtUtc,
    })
    .from(notificacionesInApp)
    .where(
      and(
        inArray(notificacionesInApp.usuarioId, alumnoIds),
        eq(notificacionesInApp.tipoEvento, tipoEvento),
        gte(notificacionesInApp.createdAtUtc, inicioAvisoGlobalUtc)
      )
    )) as Array<{ usuarioId: string; createdAtUtc: Date | string }>;
}

/** Controles desde que abrió la ventana de cada fecha vencida. */
export async function consultarControlesExpiracion(
  db: Database,
  alumnoIds: string[],
  desdeGlobal: string
): Promise<ControlAntropometricoReglas[]> {
  return (await db
    .select({
      alumnoId: controlesAntropometricos.alumnoId,
      fechaEvaluacion: controlesAntropometricos.fechaEvaluacion,
    })
    .from(controlesAntropometricos)
    .where(
      and(
        inArray(controlesAntropometricos.alumnoId, alumnoIds),
        gte(controlesAntropometricos.fechaEvaluacion, desdeGlobal)
      )
    )) as Array<{ alumnoId: string; fechaEvaluacion: string }>;
}

/** Avisos ya emitidos al coach por referencia determinista. */
export async function consultarAvisosExpiracion(
  db: Database,
  coachIds: string[],
  referencias: string[],
  tipoEvento: string
): Promise<AvisoReferenciaReglas[]> {
  return (await db
    .select({
      usuarioId: notificacionesInApp.usuarioId,
      referenciaId: notificacionesInApp.referenciaId,
    })
    .from(notificacionesInApp)
    .where(
      and(
        inArray(notificacionesInApp.usuarioId, coachIds),
        eq(notificacionesInApp.tipoEvento, tipoEvento),
        inArray(notificacionesInApp.referenciaId, referencias)
      )
    )) as Array<{ usuarioId: string; referenciaId: string | null }>;
}
