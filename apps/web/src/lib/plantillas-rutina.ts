/**
 * Lógica pura del banco de plantillas de rutina (RF-017) para la web:
 * construcción del payload de creación/edición y mapeo de los ajustes puntuales
 * (overrides de carga/series/reps) al contrato `AjusteEjercicioPlantillaSchema`.
 *
 * Sin dependencias de React para poder cubrirla con tests de Vitest.
 */
import {
  DECIMAL_STRING_REGEX,
  LIMITES_SERIE,
  MENSAJE_PESO_FUERA_DE_RANGO,
  UUID_REGEX,
  NivelObjetivoPlantilla,
  type AjusteEjercicioPlantillaDTO,
  type BloqueDiaRutinaDTO,
} from '@guachafit/shared';
import { normalizarEntradaDecimal, normalizarPesoPrescritoTexto, validarRpe } from './weight-unit';
import { generarTituloBloque, type BloqueEdicion } from './rutina-bloques';
import { MENSAJE_REPS_PRESCRITAS_INVALIDAS, esRepsPrescritasValidas } from './entrada-numerica';

/** Etiquetas humanas del enum `NivelObjetivoPlantilla` (selects y badges). */
export const ETIQUETAS_NIVEL_PLANTILLA: Record<NivelObjetivoPlantilla, string> = {
  [NivelObjetivoPlantilla.PRINCIPIANTE]: 'Principiante',
  [NivelObjetivoPlantilla.INTERMEDIO]: 'Intermedio',
  [NivelObjetivoPlantilla.AVANZADO]: 'Avanzado',
};

/** Orden canónico de niveles para el select del formulario. */
export const NIVELES_PLANTILLA_ORDEN: NivelObjetivoPlantilla[] = [
  NivelObjetivoPlantilla.PRINCIPIANTE,
  NivelObjetivoPlantilla.INTERMEDIO,
  NivelObjetivoPlantilla.AVANZADO,
];

export interface ResumenBloquesPlantilla {
  totalDias: number;
  totalEjercicios: number;
  totalSeries: number;
}

/** Forma mínima resumible: sirve para bloques del contrato y para bloques de edición. */
export interface BloqueResumible {
  ejercicios: Array<{ series?: number }>;
}

/** Resumen de conteos de una plantilla (cards y barras de estado del editor). */
export function resumirBloques(bloques: BloqueResumible[]): ResumenBloquesPlantilla {
  return {
    totalDias: bloques.length,
    totalEjercicios: bloques.reduce((total, bloque) => total + (bloque.ejercicios?.length ?? 0), 0),
    totalSeries: bloques.reduce(
      (total, bloque) =>
        total + (bloque.ejercicios ?? []).reduce((suma, ej) => suma + (ej.series ?? 0), 0),
      0
    ),
  };
}

/** Valida el nombre de la plantilla contra `CrearPlantillaRutinaSchema` (3..120). */
export function validarNombrePlantilla(nombre: string): string | null {
  const limpio = nombre.trim();
  if (limpio.length < 3) return 'El nombre de la plantilla debe tener al menos 3 caracteres.';
  if (limpio.length > 120) return 'El nombre de la plantilla no puede exceder 120 caracteres.';
  return null;
}

export interface ResultadoBloquesContrato {
  bloques: BloqueDiaRutinaDTO[];
  errores: string[];
}

/**
 * Convierte el estado de edición de la UI al contrato `CrearPlantillaRutinaSchema`:
 * - regenera el título desde los selectores estructurados,
 * - normaliza la carga prescrita (coma → punto; vacío = cualitativa, nunca '0.00'),
 * - valida RPE y exige al menos un ejercicio por día.
 * Devuelve los errores legibles para el aviso inline del formulario.
 */
export function construirBloquesParaPlantilla(bloquesEdit: BloqueEdicion[]): ResultadoBloquesContrato {
  const errores: string[] = [];
  const bloques: BloqueDiaRutinaDTO[] = bloquesEdit.map((b, idx) => {
    const diaNumero = b.diaNumero || idx + 1;
    const titulo =
      (b.titulo || generarTituloBloque(diaNumero, b.diaSugerido, b.anotacion)).trim() ||
      generarTituloBloque(diaNumero, b.diaSugerido, b.anotacion);

    const ejercicios: BloqueDiaRutinaDTO['ejercicios'] = (b.ejercicios ?? []).map((ej) => {
      const nombre = (ej.nombre || '').trim();
      if (nombre.length < 2) {
        errores.push(`«${nombre || 'Ejercicio sin nombre'}»: el nombre debe tener al menos 2 caracteres.`);
      }

      const peso = normalizarPesoPrescritoTexto(ej.peso);
      if (peso.error) {
        errores.push(`«${nombre || `Ejercicio ${idx + 1}`}»: ${peso.error}`);
      }

      const rpe = validarRpe(ej.rpe ?? '');
      if (!rpe.ok && rpe.error) {
        errores.push(`«${nombre || `Ejercicio ${idx + 1}`}»: ${rpe.error}`);
      }

      if (!esRepsPrescritasValidas(ej.reps || '')) {
        errores.push(`«${nombre || `Ejercicio ${idx + 1}`}»: ${MENSAJE_REPS_PRESCRITAS_INVALIDAS}`);
      }

      const notas = (ej.notas ?? '').trim();
      return {
        ...(ej.id ? { id: ej.id } : {}),
        // El contrato exige UUID; si la fuente fue texto libre se resuelve por nombre en la API.
        ...(ej.ejercicioId && UUID_REGEX.test(ej.ejercicioId)
          ? { ejercicioId: ej.ejercicioId }
          : {}),
        nombre,
        series: ej.series,
        reps: (ej.reps || '').trim(),
        peso: peso.valor,
        ...(rpe.ok && rpe.rpe ? { rpe: rpe.rpe } : {}),
        ...(ej.descansoSegundos !== undefined ? { descansoSegundos: ej.descansoSegundos } : {}),
        ...(notas ? { notas } : {}),
      };
    });

    if (ejercicios.length === 0) {
      errores.push(`El ${titulo} debe incluir al menos un ejercicio del catálogo.`);
    }

    return {
      diaId: b.diaId || `d${idx + 1}`,
      ...(b.diaSugerido !== undefined ? { diaSugerido: b.diaSugerido } : {}),
      titulo,
      ...(b.enfoque?.trim() ? { enfoque: b.enfoque.trim() } : {}),
      ejercicios,
    };
  });

  return { bloques, errores };
}

// =============================================================================
// AJUSTES PUNTUALES DE ASIGNACIÓN (RF-017 Escenario 2 / RN-03)
// =============================================================================

/** Override local por ejercicio antes de confirmar la asignación. Campos vacíos = sin cambio. */
export interface OverrideAjusteEjercicio {
  diaId: string;
  ejercicioId?: string;
  /** Nombre de la plantilla; se envía para localizar el ejercicio si no hay `ejercicioId`. */
  nombreEjercicio: string;
  peso: string;
  series: string;
  reps: string;
}

/** Clave estable del override: `diaId::ejercicioId | nombre`. */
export function claveOverrideEjercicio(
  diaId: string,
  ejercicioId: string | undefined,
  nombre: string
): string {
  return `${diaId}::${ejercicioId || nombre}`;
}

/** `true` cuando el coach tocó al menos un campo del override. */
export function overrideTieneCambios(override: OverrideAjusteEjercicio): boolean {
  return (
    override.peso.trim() !== '' || override.series.trim() !== '' || override.reps.trim() !== ''
  );
}

/**
 * Normaliza la carga de un ajuste contra `AjusteEjercicioPlantillaSchema.pesoPrescritoKg`
 * (decimal estricto, máx. 2 decimales). Vacío = sin ajuste; texto no decimal = error inline
 * para bloquear el envío (el contrato NO admite carga cualitativa en los ajustes).
 */
export function normalizarAjustePeso(texto: string): { valor?: string; error?: string } {
  const normalizado = normalizarEntradaDecimal(texto);
  if (normalizado === '') return {};
  if (!DECIMAL_STRING_REGEX.test(normalizado)) {
    return { error: 'Carga inválida: usa solo números (ej. 60 o 60.5)' };
  }
  if (Number(normalizado) > LIMITES_SERIE.pesoKgMax) {
    return { error: MENSAJE_PESO_FUERA_DE_RANGO };
  }
  return { valor: normalizado };
}

export interface ErroresOverride {
  peso?: string;
  series?: string;
  reps?: string;
}

/** Validación inline por campo del override (misma que aplica el contrato al confirmar). */
export function validarOverrideEjercicio(override: OverrideAjusteEjercicio): ErroresOverride {
  const errores: ErroresOverride = {};

  const peso = normalizarAjustePeso(override.peso);
  if (peso.error) errores.peso = peso.error;

  const seriesTexto = override.series.trim();
  if (seriesTexto !== '') {
    const series = Number(seriesTexto);
    if (!Number.isInteger(series) || series < 1 || series > 50) {
      errores.series = 'Series: entero entre 1 y 50';
    }
  }

  if (override.reps.trim() !== '' && !esRepsPrescritasValidas(override.reps)) {
    errores.reps = MENSAJE_REPS_PRESCRITAS_INVALIDAS;
  } else if (override.reps.trim().length > 30) {
    errores.reps = 'Reps: máximo 30 caracteres';
  }

  return errores;
}

export interface ErrorAjuste {
  clave: string;
  mensaje: string;
}

export interface ResultadoConstruccionAjustes {
  ajustes: AjusteEjercicioPlantillaDTO[];
  errores: ErrorAjuste[];
}

/**
 * Mapea los overrides de la UI al array `ajustes` del contrato de asignación.
 * Solo se envían los ejercicios con al menos un cambio válido; cualquier valor inválido
 * se reporta por clave para el bloqueo inline. No inventa ajustes vacíos.
 */
export function construirAjustesPlantilla(
  overrides: Record<string, OverrideAjusteEjercicio>
): ResultadoConstruccionAjustes {
  const ajustes: AjusteEjercicioPlantillaDTO[] = [];
  const errores: ErrorAjuste[] = [];

  for (const [clave, override] of Object.entries(overrides)) {
    if (!overrideTieneCambios(override)) continue;

    const erroresCampo = validarOverrideEjercicio(override);
    if (erroresCampo.peso || erroresCampo.series || erroresCampo.reps) {
      const detalle = erroresCampo.peso || erroresCampo.series || erroresCampo.reps;
      errores.push({ clave, mensaje: `«${override.nombreEjercicio}»: ${detalle}` });
      continue;
    }

    const peso = normalizarAjustePeso(override.peso);
    const seriesTexto = override.series.trim();
    const reps = override.reps.trim();

    ajustes.push({
      diaId: override.diaId,
      ...(override.ejercicioId && UUID_REGEX.test(override.ejercicioId)
        ? { ejercicioId: override.ejercicioId }
        : { nombre: override.nombreEjercicio }),
      ...(peso.valor !== undefined ? { pesoPrescritoKg: peso.valor } : {}),
      ...(seriesTexto !== '' ? { series: Number(seriesTexto) } : {}),
      ...(reps !== '' ? { reps } : {}),
    });
  }

  return { ajustes, errores };
}

/** Devuelve el override de un ejercicio de la plantilla, si existe. */
export function obtenerOverrideDeEjercicio(
  overrides: Record<string, OverrideAjusteEjercicio>,
  diaId: string,
  ejercicio: { ejercicioId?: string; nombre: string }
): OverrideAjusteEjercicio | undefined {
  return overrides[claveOverrideEjercicio(diaId, ejercicio.ejercicioId, ejercicio.nombre)];
}

/**
 * Aplica los overrides válidos sobre una copia de los bloques para la previsualización
 * previa a la confirmación. Los valores inválidos se ignoran (la validación inline los
 * bloquea con su propio mensaje).
 */
export function aplicarOverridesPreview(
  bloques: BloqueDiaRutinaDTO[],
  overrides: Record<string, OverrideAjusteEjercicio>
): BloqueDiaRutinaDTO[] {
  return bloques.map((bloque) => ({
    ...bloque,
    ejercicios: bloque.ejercicios.map((ej) => {
      const override = obtenerOverrideDeEjercicio(overrides, bloque.diaId, ej);
      if (!override) return ej;

      const peso = normalizarAjustePeso(override.peso);
      const seriesTexto = override.series.trim();
      const seriesNumero = Number(seriesTexto);
      const series =
        seriesTexto !== '' && Number.isInteger(seriesNumero) && seriesNumero >= 1 && seriesNumero <= 50
          ? seriesNumero
          : undefined;
      const reps = override.reps.trim();

      return {
        ...ej,
        ...(peso.valor !== undefined ? { peso: peso.valor } : {}),
        ...(series !== undefined ? { series } : {}),
        ...(reps !== '' && reps.length <= 30 ? { reps } : {}),
      };
    }),
  }));
}

/**
 * C4: firma estable del formulario de plantilla para detectar cambios sin guardar al cerrar
 * el panel (se compara contra la firma tomada al abrir o al guardar).
 */
export function firmaFormularioPlantilla(
  nombre: string,
  nivelObjetivo: string,
  bloques: BloqueEdicion[]
): string {
  return JSON.stringify({ nombre: nombre.trim(), nivelObjetivo, bloques });
}
