/**
 * RF-017 RN-01: resolución de ejercicios contra el catálogo VISIBLE para un coach.
 *
 * Un coach solo puede prescribir ejercicios globales (`entrenador_id IS NULL`) o propios. La usan
 * las plantillas (RF-017) y la rutina semanal (RF-001), y la instanciación de sesiones para no
 * enlazar nunca el ejercicio privado de otro coach.
 */
import { BadRequestException } from '@nestjs/common';
import { Database, and, eq, isNull, or, ejerciciosCatalogo } from '@guachafit/database';
import { BloqueDiaRutinaDTO } from '@guachafit/shared';

/** Cuántos ejercicios se nombran como máximo en el mensaje; el resto se cuenta ("y N más"). */
const MAX_EJERCICIOS_NOMBRADOS = 3;

/**
 * Mensaje para los ejercicios que ya no se pueden usar (inactivos, privados de otro coach o que
 * no existen). Los nombra con el nombre que trae la rutina o plantilla, nunca con su id.
 */
export function mensajeEjerciciosNoDisponibles(nombres: string[]): string {
  const unicos = [...new Set(nombres.map((nombre) => nombre.trim() || 'Ejercicio sin nombre'))];
  const nombrados = unicos
    .slice(0, MAX_EJERCICIOS_NOMBRADOS)
    .map((nombre) => `«${nombre}»`)
    .join(', ');
  const restantes = unicos.length - MAX_EJERCICIOS_NOMBRADOS;
  const lista = restantes > 0 ? `${nombrados} y ${restantes} más` : nombrados;

  return unicos.length === 1
    ? `${lista} ya no está en tu lista de ejercicios. Quítalo o cámbialo por otro y vuelve a guardar.`
    : `${lista} ya no están en tu lista de ejercicios. Quítalos o cámbialos por otros y vuelve a guardar.`;
}

export interface EjercicioCatalogoRow {
  id: string;
  entrenadorId: string | null;
  nombre: string;
  activo: boolean;
}

type ConsultaCatalogo = Pick<Database, 'select'>;

/** Global (`entrenadorId` nulo) o del propio coach. */
export function esEjercicioVisibleParaCoach(
  ejercicio: Pick<EjercicioCatalogoRow, 'entrenadorId'> | undefined,
  entrenadorId: string
): boolean {
  if (!ejercicio) return false;
  return ejercicio.entrenadorId == null || ejercicio.entrenadorId === entrenadorId;
}

/**
 * Busca el ejercicio activo por id o, sin id, por nombre exacto; en ambos casos filtrado a
 * `entrenador_id IS NULL OR entrenador_id = coach` en SQL y de nuevo en memoria.
 */
export async function resolverEjercicioDelCatalogo(
  db: ConsultaCatalogo,
  entrenadorId: string,
  ejercicioId: string | undefined,
  nombre: string
): Promise<EjercicioCatalogoRow | undefined> {
  const visibleParaCoach = or(
    eq(ejerciciosCatalogo.entrenadorId, entrenadorId),
    isNull(ejerciciosCatalogo.entrenadorId)
  )!;

  const candidatos: EjercicioCatalogoRow[] = ejercicioId
    ? await db
        .select()
        .from(ejerciciosCatalogo)
        .where(
          and(
            eq(ejerciciosCatalogo.id, ejercicioId),
            eq(ejerciciosCatalogo.activo, true),
            visibleParaCoach
          )
        )
        .limit(1)
    : await db
        .select()
        .from(ejerciciosCatalogo)
        .where(
          and(
            eq(ejerciciosCatalogo.nombre, nombre),
            eq(ejerciciosCatalogo.activo, true),
            visibleParaCoach
          )
        );

  return candidatos.find((ejercicio) => esEjercicioVisibleParaCoach(ejercicio, entrenadorId));
}

/**
 * Valida cada ejercicio de los bloques contra el catálogo del coach y devuelve los bloques con el
 * `ejercicioId` resuelto. Si alguno es inexistente, inactivo o privado de otro coach → 400 que
 * nombra todos los que fallaron, para que el coach sepa cuál quitar o cambiar.
 */
export async function validarEjerciciosDeBloques(
  db: ConsultaCatalogo,
  entrenadorId: string,
  bloques: BloqueDiaRutinaDTO[]
): Promise<BloqueDiaRutinaDTO[]> {
  const resultado: BloqueDiaRutinaDTO[] = [];
  const noDisponibles: string[] = [];

  for (const bloque of bloques) {
    const ejercicios: BloqueDiaRutinaDTO['ejercicios'] = [];

    for (const ejercicio of bloque.ejercicios) {
      const resuelto = await resolverEjercicioDelCatalogo(
        db,
        entrenadorId,
        ejercicio.ejercicioId,
        ejercicio.nombre
      );
      if (!resuelto) {
        noDisponibles.push(ejercicio.nombre);
        continue;
      }
      ejercicios.push({ ...ejercicio, ejercicioId: resuelto.id });
    }

    resultado.push({ ...bloque, ejercicios });
  }

  if (noDisponibles.length > 0) {
    throw new BadRequestException(mensajeEjerciciosNoDisponibles(noDisponibles));
  }

  return resultado;
}
