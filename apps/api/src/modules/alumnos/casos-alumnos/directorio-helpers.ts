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
 * WU25a: UUID nil (RFC 4122) para representar "sin candidatos" en un `IN`.
 * `IN ()` no es SQL válido y un filtro sin coincidencias debe devolver 0 filas (no romper la
 * consulta); ningún perfil real usa este UUID.
 * Movido sin cambios desde la fachada (P3).
 */
export const UUID_SIN_CANDIDATOS = '00000000-0000-4000-8000-000000000000';

/**
 * WU19: contadores reales de la cartera para los KPIs del directorio.
 *
 * Tres COUNT en el servidor (jamás se traen los perfiles a memoria):
 * 1. Agrupado de alumnos vigentes por estado + modalidad (suma de grupos).
 * 2. Archivados (soft-deleted).
 * 3. Morosos: alumnos vigentes con al menos una cuota vencida; se reutiliza la misma regla
 *    de la bandeja "Alumnos en Mora" del dashboard (`entrenador.service.ts`) para no divergir.
 * Movido sin cambios (P3).
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
 * WU25a/WU23/WU-H: conjuntos de alumnos por semáforo de pago con tres consultas en lote:
 * 1. `enMora`: alumnos con al menos una cuota que cumple `condicionCuotaEnMora`.
 * 2. `porVencer`: alumnos con al menos una cuota que cumple `condicionCuotaPorVencer`.
 * 3. `conCuota`: alumnos con al menos una cuota no anulada (vigente o vencida).
 *
 * Sin `alumnoUsuarioIds` cubre la cartera completa del coach (filtro server-side); con la
 * lista de la página, solo esos alumnos (hidratación por fila, sin N+1).
 * Movido sin cambios (P3).
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
 * WU25a: condición SQL para filtrar el directorio por semáforo de pago.
 *
 * Reutiliza la MISMA regla de mora del resumen (`condicionCuotaEnMora`) y la misma definición
 * de "al día" que `hidratarSemaforoPago` (tiene al menos una cuota no anulada y ninguna en
 * mora). El conjunto de ids se resuelve en una consulta agregada previa (sin subqueries en el
 * WHERE, que romperían el aislamiento por tenant y la lectura del plan).
 *
 * `sin_cuota` es el complemento (no tiene ninguna cuota registrada): se expresa con un
 * `NOT IN` sobre los alumnos con cuota; si nadie tiene cuota, no se agrega condición.
 * Movido sin cambios (P3).
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
 * WU23: hidrata `semaforoPago` de la página listada del directorio.
 *
 * Contexto: la pestaña "En Mora" y los badges de fila dependían de `semaforoPago`, un campo
 * que ninguna ruta del API completaba (siempre `undefined` => la UI asumía "Al día"). Con el
 * KPI `resumen.morosos` ya real, la pestaña decía "En Mora (N)" y la lista mostraba 0 filas.
 *
 * Reutiliza `calcularConjuntosSemaforoPago` (misma condición de mora que el resumen) limitado a
 * los `usuarioId` de la página, para no traer las cuotas de toda la cartera:
 * 1. `moroso`: tiene al menos una cuota que cumple la condición de mora.
 * 2. `por_vencer`: no está en mora y tiene una cuota impaga a ≤5 días del corte (WU-H).
 * 3. `al_dia`: tiene al menos una cuota no anulada que no está en mora ni por vencer.
 * 4. `sin_cuota`: no tiene ninguna cuota registrada (ni vigente ni vencida).
 * Movido sin cambios (P3).
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
