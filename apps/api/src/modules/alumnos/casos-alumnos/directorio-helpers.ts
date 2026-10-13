import {
  TenantTransaction,
  and,
  count,
  countDistinct,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  cuotasMembresia,
  perfilesAlumno,
} from '@guachafit/database';
import { EstadoAlumno, EstadoCuota, Modalidad, ResumenDirectorioAlumnosDTO } from '@guachafit/shared';
import {
  condicionCuotaEnMora,
  condicionCuotaPorVencer,
} from '../../../common/cartera.util';

export type SemaforoPago = 'al_dia' | 'por_vencer' | 'moroso' | 'sin_cuota';

/**
 * WU25a: nil UUID (RFC 4122) standing for "no candidates" inside an `IN`.
 * Moved verbatim from the facade (P3).
 */
export const UUID_SIN_CANDIDATOS = '00000000-0000-4000-8000-000000000000';

/**
 * WU19: real portfolio counters for the directory KPIs. Moved verbatim (P3).
 */
export async function calcularResumenDirectorio(
  tx: TenantTransaction,
  entrenadorId: string
): Promise<ResumenDirectorioAlumnosDTO> {
  const ahora = new Date();

  const [grupos, filaArchivados, filaMorosos] = await Promise.all([
    tx
      .select({
        estadoActivacion: perfilesAlumno.estadoActivacion,
        modalidad: perfilesAlumno.modalidad,
        total: count(),
      })
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.entrenadorId, entrenadorId),
          isNull(perfilesAlumno.deletedAtUtc)
        )
      )
      .groupBy(perfilesAlumno.estadoActivacion, perfilesAlumno.modalidad),
    tx
      .select({ total: count() })
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.entrenadorId, entrenadorId),
          isNotNull(perfilesAlumno.deletedAtUtc)
        )
      ),
    tx
      .select({ total: countDistinct(cuotasMembresia.clienteId) })
      .from(cuotasMembresia)
      .innerJoin(
        perfilesAlumno,
        and(
          eq(perfilesAlumno.usuarioId, cuotasMembresia.clienteId),
          eq(perfilesAlumno.entrenadorId, entrenadorId),
          isNull(perfilesAlumno.deletedAtUtc)
        )
      )
      .where(
        and(
          eq(cuotasMembresia.entrenadorId, entrenadorId),
          condicionCuotaEnMora(ahora)
        )
      ),
  ]);

  const resumen: ResumenDirectorioAlumnosDTO = {
    total: 0,
    activos: 0,
    pausados: 0,
    morosos: Number(filaMorosos[0]?.total ?? 0),
    presenciales: 0,
    remotos: 0,
    archivados: Number(filaArchivados[0]?.total ?? 0),
  };

  for (const grupo of grupos) {
    const cantidad = Number(grupo.total ?? 0);
    resumen.total += cantidad;
    if (grupo.estadoActivacion === EstadoAlumno.ACTIVO) resumen.activos += cantidad;
    if (grupo.estadoActivacion === EstadoAlumno.INACTIVO_PAUSADO) resumen.pausados += cantidad;
    if (grupo.modalidad === Modalidad.PRESENCIAL) resumen.presenciales += cantidad;
    if (grupo.modalidad === Modalidad.REMOTO) resumen.remotos += cantidad;
  }
  resumen.total += resumen.archivados;

  return resumen;
}

/**
 * WU25a/WU23/WU-H: student sets per payment semaphore, in batch. Moved verbatim (P3).
 */
export async function calcularConjuntosSemaforoPago(
  tx: TenantTransaction,
  entrenadorId: string,
  alumnoUsuarioIds?: string[]
): Promise<{ enMora: Set<string>; porVencer: Set<string>; conCuota: Set<string> }> {
  const ahora = new Date();
  const filtroAlumnos =
    alumnoUsuarioIds && alumnoUsuarioIds.length > 0
      ? inArray(cuotasMembresia.clienteId, alumnoUsuarioIds)
      : undefined;

  const [filasMorosas, filasPorVencer, filasConCuota] = await Promise.all([
    tx
      .select({ clienteId: cuotasMembresia.clienteId })
      .from(cuotasMembresia)
      .where(
        and(
          eq(cuotasMembresia.entrenadorId, entrenadorId),
          filtroAlumnos,
          condicionCuotaEnMora(ahora)
        )
      ),
    tx
      .select({ clienteId: cuotasMembresia.clienteId })
      .from(cuotasMembresia)
      .where(
        and(
          eq(cuotasMembresia.entrenadorId, entrenadorId),
          filtroAlumnos,
          condicionCuotaPorVencer(ahora)
        )
      ),
    tx
      .select({ clienteId: cuotasMembresia.clienteId })
      .from(cuotasMembresia)
      .where(
        and(
          eq(cuotasMembresia.entrenadorId, entrenadorId),
          filtroAlumnos,
          ne(cuotasMembresia.estado, EstadoCuota.ANULADA)
        )
      ),
  ]);

  return {
    enMora: new Set(filasMorosas.map((fila) => fila.clienteId)),
    porVencer: new Set(filasPorVencer.map((fila) => fila.clienteId)),
    conCuota: new Set(filasConCuota.map((fila) => fila.clienteId)),
  };
}

/**
 * WU25a: SQL condition for filtering the directory by payment semaphore.
 * Moved verbatim (P3).
 */
export async function condicionSemaforoPago(
  tx: TenantTransaction,
  entrenadorId: string,
  semaforo: 'moroso' | 'al_dia' | 'sin_cuota'
) {
  const { enMora, conCuota } = await calcularConjuntosSemaforoPago(tx, entrenadorId);

  if (semaforo === 'sin_cuota') {
    const conCuotaLista = [...conCuota];
    return conCuotaLista.length > 0
      ? notInArray(perfilesAlumno.usuarioId, conCuotaLista)
      : undefined;
  }

  const ids =
    semaforo === 'moroso'
      ? [...enMora]
      : [...conCuota].filter((usuarioId) => !enMora.has(usuarioId));

  return inArray(perfilesAlumno.usuarioId, ids.length > 0 ? ids : [UUID_SIN_CANDIDATOS]);
}

/**
 * WU23: hydrates `semaforoPago` for the listed directory page. Moved verbatim (P3).
 */
export async function hidratarSemaforoPago(
  tx: TenantTransaction,
  entrenadorId: string,
  alumnoUsuarioIds: string[]
): Promise<Map<string, SemaforoPago>> {
  const semaforos = new Map<string, SemaforoPago>();
  if (alumnoUsuarioIds.length === 0) return semaforos;

  const { enMora, porVencer, conCuota } = await calcularConjuntosSemaforoPago(
    tx,
    entrenadorId,
    alumnoUsuarioIds
  );

  for (const usuarioId of alumnoUsuarioIds) {
    semaforos.set(
      usuarioId,
      enMora.has(usuarioId)
        ? 'moroso'
        : porVencer.has(usuarioId)
        ? 'por_vencer'
        : conCuota.has(usuarioId)
        ? 'al_dia'
        : 'sin_cuota'
    );
  }

  return semaforos;
}
