// Regex para formatos universales
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DECIMAL_STRING_REGEX = /^\d+(\.\d{1,2})?$/;
export const TASA_STRING_REGEX = /^\d+(\.\d{1,4})?$/;
export const FECHA_CALENDARIO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// =============================================================================
// RF-001 / RF-017: LÍMITES DE UNA SERIE (registro del alumno y prescripción del coach)
// =============================================================================

/** Rango válido de cada dato de una serie; lo comparten el contrato, el API y los inputs. */
export const LIMITES_SERIE = {
  pesoKgMax: 999,
  repsMax: 200,
  rpeMin: 1,
  rpeMax: 10,
  rpePaso: 0.5,
} as const;

export const MENSAJE_PESO_FUERA_DE_RANGO = `El peso no puede superar ${LIMITES_SERIE.pesoKgMax} kg`;
export const MENSAJE_ESFUERZO_INVALIDO =
  'El esfuerzo debe estar entre 1 y 10, en pasos de 0,5 (por ejemplo, 8 o 8.5)';
export const MENSAJE_REPS_FUERA_DE_RANGO = `Las repeticiones no pueden superar ${LIMITES_SERIE.repsMax}`;

const RPE_STRING_REGEX = /^\d+(\.\d)?$/;

/** Peso en kg con hasta 2 decimales, entre 0 y el máximo (punto decimal, formato del contrato). */
export function esPesoKgValido(valor: string): boolean {
  if (!DECIMAL_STRING_REGEX.test(valor)) return false;
  const kg = Number(valor);
  return kg >= 0 && kg <= LIMITES_SERIE.pesoKgMax;
}

/** Esfuerzo (RPE) entre 1 y 10 en pasos de 0,5, con un decimal como máximo (`8`, `8.5`, `10.0`). */
export function esRpeValido(valor: string): boolean {
  if (!RPE_STRING_REGEX.test(valor)) return false;
  const rpe = Number(valor);
  return (
    rpe >= LIMITES_SERIE.rpeMin &&
    rpe <= LIMITES_SERIE.rpeMax &&
    Number.isInteger(rpe / LIMITES_SERIE.rpePaso)
  );
}

/**
 * Primer número de un texto libre de carga ('60,5 kg' → 60.5), con coma o punto decimal.
 * `null` si no hay número ('Corporal', ''). Es el mismo número que el API materializa como
 * `peso_prescrito_kg`; el rango lo valida el esquema.
 */
export function extraerPesoKgDeTexto(texto: string): number | null {
  const coincidencia = texto.match(/\d+(?:[.,]\d+)?/);
  return coincidencia ? Number(coincidencia[0].replace(',', '.')) : null;
}

/**
 * LOTE API-N1: `true` solo si el texto es una fecha AAAA-MM-DD que existe en el calendario
 * (rechaza `2026-02-31`, `2026-13-01` o `abc`). Aritmética UTC: no depende de la zona del equipo.
 */
export function esFechaCalendarioReal(valor: string): boolean {
  if (!FECHA_CALENDARIO_REGEX.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(fechaCalendarioAMsUtc(valor));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}

/**
 * Milisegundos UTC de la medianoche de una fecha AAAA-MM-DD (sin validar que exista: `Date.UTC`
 * desborda, p. ej. 2026-02-31 → 3 de marzo). Única conversión de fecha a instante de este archivo.
 */
export function fechaCalendarioAMsUtc(valor: string): number {
  const [anio, mes, dia] = valor.split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

/**
 * LOTE API-N2 (RF-002, decisión del dueño 2026-10-05): zona horaria del perfil del alumno. Decide
 * la ventana del reporte diario (18:00–23:59) y el plazo de recepción (12:00 del día siguiente).
 * Los perfiles existentes y los nuevos arrancan en esta zona.
 */
export const ZONA_HORARIA_ALUMNO_POR_DEFECTO = 'America/Caracas';
export const MENSAJE_ZONA_HORARIA_INVALIDA = `Elige una zona horaria válida, por ejemplo ${ZONA_HORARIA_ALUMNO_POR_DEFECTO}.`;
/** Largo máximo de un identificador de zona IANA (columna `perfiles_alumno.zona_horaria`). */
export const MAX_CARACTERES_ZONA_HORARIA = 64;

/**
 * `true` si el texto es una zona IANA que el motor `Intl` reconoce (p. ej. `Europe/Madrid`).
 * Vacío o con espacios alrededor no es válido: se guarda exactamente lo que se validó.
 */
export function esZonaHorariaIanaValida(valor: string): boolean {
  if (!valor || valor.trim() !== valor || valor.length > MAX_CARACTERES_ZONA_HORARIA) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: valor });
    return true;
  } catch {
    return false;
  }
}

/** LOTE API-N1: fecha AAAA-MM-DD que existe en el calendario (no solo con la forma correcta). */
export const MENSAJE_FECHA_CALENDARIO =
  'La fecha no es válida. Usa el formato año-mes-día (por ejemplo, 2026-01-31)';
