import { eq, metasNutricionales } from '@guachafit/database';
import {
  MetasNutricionalesSchema,
  type MetasNutricionalesDetalleDTO,
  type MetasNutricionalesDTO,
  type RecursoNutricionalDTO,
} from '@guachafit/shared';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import type { ContextoNutricion } from './contexto-nutricion';
import { validarAlumnoDelCoach } from './acceso-nutricion';
import {
  esClaveDeRecursoDelAlumno,
  storageKeysDeRecursos,
  validarStorageKeysDeRecursos,
} from './claves-nutricion-reglas';
import { mapearMetas } from './hidratacion-nutricion';

/**
 * Definir (crear o reemplazar) las metas nutricionales de un alumno del coach (RN-01).
 *
 * Semántica PUT: la fila se reemplaza completa; un campo omitido queda en NULL ("no
 * configurado"), nunca en 0 fabricado. Valida tenancy contra `perfiles_alumno`.
 *
 * PUT-replace de recursos (RNF-001): si el reemplazo deja de referenciar un PDF subido, el
 * objeto se elimina de la bóveda DESPUÉS del write y fuera de su transacción, best-effort:
 * un fallo del almacenamiento (o de la relectura de verificación) se registra pero no cambia
 * la respuesta (sigue 200).
 * `recursos` omitido o `[]` ⇒ se borran TODOS los PDFs previos.
 */
export async function definirMetasNutricionales(
  ctx: ContextoNutricion,
  coachId: string,
  alumnoId: string,
  dto: MetasNutricionalesDTO
): Promise<MetasNutricionalesDetalleDTO> {
  const validado = parsearContrato(MetasNutricionalesSchema, dto);

  await validarAlumnoDelCoach(ctx, coachId, alumnoId);

  const recursos = validado.recursos ?? [];
  validarStorageKeysDeRecursos(recursos, alumnoId);

  const valores = {
    caloriasObjetivo: validado.caloriasObjetivo ?? null,
    proteinaGramosObjetivo: validado.proteinaGramosObjetivo ?? null,
    carbohidratosGramosObjetivo: validado.carbohidratosGramosObjetivo ?? null,
    grasasGramosObjetivo: validado.grasasGramosObjetivo ?? null,
    aguaLitrosObjetivo: validado.aguaLitrosObjetivo ?? null,
    recursos,
  };
  const now = new Date();

  const [existente] = await ctx.db
    .select()
    .from(metasNutricionales)
    .where(eq(metasNutricionales.alumnoId, alumnoId))
    .limit(1);

  // Claves previas capturadas ANTES del write: son las candidatas a borrado del PUT-replace.
  const clavesPrevias = storageKeysDeRecursos(existente?.recursos ?? []);

  let filaGuardada: typeof metasNutricionales.$inferSelect;
  if (existente) {
    const [actualizado] = await ctx.db
      .update(metasNutricionales)
      .set({ ...valores, updatedAtUtc: now })
      .where(eq(metasNutricionales.id, existente.id))
      .returning();

    filaGuardada = actualizado;
  } else {
    const [creado] = await ctx.db
      .insert(metasNutricionales)
      .values({ alumnoId, ...valores, createdAtUtc: now, updatedAtUtc: now })
      .returning();

    filaGuardada = creado;
  }

  const detalle = await mapearMetas(ctx, filaGuardada);

  // Borrado post-commit y best-effort: la respuesta ya está decidida. Nunca se borra dentro de
  // la transacción del write ni antes de persistir la nueva referencia.
  await eliminarRecursosHuerfanos(ctx, alumnoId, clavesPrevias, recursos);

  return detalle;
}

/**
 * RNF-001/RF-002: borra de la bóveda los PDFs que el PUT-replace dejó sin referencia.
 *
 * - Best-effort post-commit: corre después del write y fuera de su transacción, y NINGUNA ruta
 *   de esta función lanza hacia el llamador: un fallo de la relectura de verificación y un
 *   fallo por clave se registran y se abandonan (la respuesta del PUT ya está decidida, sigue
 *   200; el huérfano se reconcilia aparte).
 * - Solo se borran claves propias del alumno y con estructura válida.
 * - Anti-race: la relectura de la fila recién guardada REDUCE (no elimina) la ventana en la que
 *   un PUT concurrente re-referencia una clave que este PUT quitó: dos PUTs pueden intercalarse
 *   (A relee antes de que B re-referencie) y el borrado dejaría un enlace colgado. Cerrarla del
 *   todo exige serialización por alumno (p. ej. advisory lock transaccional); queda como
 *   follow-up.
 */
export async function eliminarRecursosHuerfanos(
  ctx: ContextoNutricion,
  alumnoId: string,
  clavesPrevias: string[],
  recursosNuevos: RecursoNutricionalDTO[]
): Promise<void> {
  const boveda = ctx.r2StorageService;
  if (!boveda || clavesPrevias.length === 0) return;

  const clavesNuevas = new Set(storageKeysDeRecursos(recursosNuevos));
  const candidatas = new Set(clavesPrevias.filter((clave) => !clavesNuevas.has(clave)));
  if (candidatas.size === 0) return;

  // Si no se puede verificar la fila actual, no se borra nada: el write ya persistió y propagar
  // el fallo de lectura convertiría el PUT en un 500 pese a haber guardado.
  let filaActual: typeof metasNutricionales.$inferSelect | undefined;
  try {
    [filaActual] = await ctx.db
      .select()
      .from(metasNutricionales)
      .where(eq(metasNutricionales.alumnoId, alumnoId))
      .limit(1);
  } catch (error) {
    ctx.logger.warn(
      `No se verificó la fila de metas del alumno '${alumnoId}' tras el PUT; no se borra ningún recurso: ${error instanceof Error ? error.message : String(error)}`
    );
    return;
  }

  const clavesReferenciadas = new Set(storageKeysDeRecursos(filaActual?.recursos ?? []));

  const aBorrar = [...candidatas].filter(
    (clave) => !clavesReferenciadas.has(clave) && esClaveDeRecursoDelAlumno(clave, alumnoId)
  );
  if (aBorrar.length === 0) return;

  // Un fallo por clave no cancela el resto ni altera la respuesta ya emitida.
  await Promise.allSettled(
    aBorrar.map(async (clave) => {
      try {
        await boveda.eliminarObjeto(clave);
      } catch (error) {
        ctx.logger.warn(
          `No se pudo eliminar el objeto '${clave}' de la bóveda: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );
}
