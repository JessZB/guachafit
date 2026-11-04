import { NotFoundException } from '@nestjs/common';
import {
  and,
  eq,
  isNull,
  perfilesAlumno,
  perfilesEntrenador,
  usuarios,
} from '@guachafit/database';
import type { Database, TenantTransaction } from '@guachafit/database';
import { EstadoAlumno, EstadoLicencia } from '@guachafit/shared';

/**
 * D17: mensaje ÚNICO de toda negativa pública sobre un enlace de captación. Código inexistente,
 * rotado, cuenta o licencia inoperables, captación pausada y cupo lleno responden igual para no
 * revelar el motivo ni qué códigos existen.
 */
export const MENSAJE_ENLACE_NO_DISPONIBLE =
  'El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach.';

export function enlaceNoDisponible(): NotFoundException {
  return new NotFoundException(MENSAJE_ENLACE_NO_DISPONIBLE);
}

/** Entrenador tal como lo necesitan la resolución pública y el registro del enlace. */
export interface CoachPublico {
  usuarioId: string;
  coachCode: string;
  nombres: string;
  apellidos: string;
  nombreComercial: string | null;
  capacidadMaxima: number;
  estadoLicencia: EstadoLicencia;
  captacionActiva: boolean;
  /** `usuarios.activo`: cuenta habilitada. */
  activo: boolean;
}

/**
 * Busca al entrenador por su código ya normalizado (mayúsculas, sin espacios). Con `bloquear` la
 * fila queda tomada (`FOR UPDATE`) hasta el fin de la transacción: úsese con el `tx` de
 * `withTenant` para serializar los registros concurrentes del mismo entrenador.
 * `perfiles_entrenador` y `usuarios` no tienen RLS.
 */
export async function buscarCoachPublico(
  db: Pick<Database, 'select'>,
  codigo: string,
  opciones: { bloquear?: boolean } = {}
): Promise<CoachPublico | undefined> {
  const consulta = db
    .select({
      usuarioId: perfilesEntrenador.usuarioId,
      coachCode: perfilesEntrenador.coachCode,
      nombres: perfilesEntrenador.nombres,
      apellidos: perfilesEntrenador.apellidos,
      nombreComercial: perfilesEntrenador.nombreComercial,
      capacidadMaxima: perfilesEntrenador.capacidadMaxima,
      estadoLicencia: perfilesEntrenador.estadoLicencia,
      captacionActiva: perfilesEntrenador.captacionActiva,
      activo: usuarios.activo,
    })
    .from(perfilesEntrenador)
    .innerJoin(usuarios, eq(usuarios.id, perfilesEntrenador.usuarioId));
  const filtro = eq(perfilesEntrenador.coachCode, codigo);

  const [coach] = opciones.bloquear
    ? await consulta.for('update', { of: perfilesEntrenador }).where(filtro)
    : await consulta.where(filtro);
  return coach;
}

/** Cuenta habilitada, licencia vigente y captación activa. */
export function coachAdmiteCaptacion(coach: CoachPublico): boolean {
  return (
    coach.estadoLicencia === EstadoLicencia.ACTIVA && !!coach.activo && !!coach.captacionActiva
  );
}

interface FilaCupo {
  estadoActivacion?: string | null;
  deletedAtUtc?: Date | null;
}

/**
 * D17: cupo ocupado = alumnos `ACTIVO` del entrenador sin baja lógica. La consulta ya acota por
 * estado y baja; esta regla es la fuente única y se reaplica sobre las filas leídas.
 */
export function contarCupoOcupado(filas: readonly FilaCupo[]): number {
  return filas.filter((fila) => fila.estadoActivacion === EstadoAlumno.ACTIVO && !fila.deletedAtUtc)
    .length;
}

/**
 * Cuenta el cupo ocupado del entrenador. `perfiles_alumno` tiene RLS: `tx` debe venir de
 * `withTenant({ entrenadorId })`. `entrenadorUsuarioId` es `usuarios.id` del entrenador.
 */
export async function leerCupoOcupado(
  tx: Pick<TenantTransaction, 'select'>,
  entrenadorUsuarioId: string
): Promise<number> {
  const filas = await tx
    .select({
      estadoActivacion: perfilesAlumno.estadoActivacion,
      deletedAtUtc: perfilesAlumno.deletedAtUtc,
    })
    .from(perfilesAlumno)
    .where(
      and(
        eq(perfilesAlumno.entrenadorId, entrenadorUsuarioId),
        eq(perfilesAlumno.estadoActivacion, EstadoAlumno.ACTIVO),
        isNull(perfilesAlumno.deletedAtUtc)
      )
    );
  return contarCupoOcupado(filas);
}
