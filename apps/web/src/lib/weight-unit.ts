/**
 * RN-01 (RF-001): el alumno puede registrar el peso en kg o lb, pero la API persiste
 * SIEMPRE kg (`pesoKg` real y `pesoPrescritoKg` prescrito). Este módulo centraliza la
 * conversión, el redondeo y la validación contra el contrato decimal compartido para que
 * ningún valor inválido llegue a la API ni a la cola offline.
 */
import { DECIMAL_STRING_REGEX } from '@guachafit/shared';

export type UnidadPeso = 'kg' | 'lb';

/** Clave local donde se persiste la preferencia de unidad del alumno. */
export const PESO_UNIDAD_STORAGE_KEY = 'guachafit_weight_unit';

/** Factor de conversión usado en toda la app: 1 kg = 2.20462 lb. */
export const KG_POR_LB = 2.20462;

/** Decimales de presentación en la unidad elegida (redondeo razonable, 1 decimal). */
const DECIMALES_DISPLAY = 1;

/** La API acepta hasta 2 decimales en `pesoKg` (DECIMAL_STRING_REGEX). */
const DECIMALES_KG = 2;

/** Mismo contrato que `RegistrarSerieSchema.rpe` en packages/shared. */
const RPE_REGEX = /^\d+(\.\d)?$/;

export function esUnidadPeso(valor: unknown): valor is UnidadPeso {
  return valor === 'kg' || valor === 'lb';
}

/** Lee la preferencia de unidad; default kg si no existe o el almacenamiento falla. */
export function leerUnidadPesoPreferida(): UnidadPeso {
  if (typeof window === 'undefined') return 'kg';
  try {
    const guardada = window.localStorage.getItem(PESO_UNIDAD_STORAGE_KEY);
    return esUnidadPeso(guardada) ? guardada : 'kg';
  } catch {
    return 'kg';
  }
}

/** Persiste la preferencia de unidad (best-effort: nunca rompe la pantalla). */
export function guardarUnidadPesoPreferida(unidad: UnidadPeso): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PESO_UNIDAD_STORAGE_KEY, unidad);
  } catch {
    // Almacenamiento no disponible (modo privado): la preferencia aplica solo en memoria.
  }
}

/**
 * Normaliza la entrada del alumno: recorta espacios, convierte la coma decimal en punto
 * y tolera un separador final sin decimales (' 28, ' -> '28', ' 28,5 ' -> '28.5').
 */
export function normalizarEntradaDecimal(texto: string): string {
  const base = texto.trim().replace(',', '.');
  return /^\d+\.$/.test(base) ? base.slice(0, -1) : base;
}

export function redondearDecimal(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}

/** Convierte un valor persistido en kg al valor numérico de la unidad elegida. */
export function kgAUnidad(kg: number, unidad: UnidadPeso): number {
  return unidad === 'kg' ? kg : kg * KG_POR_LB;
}

/** Convierte un valor expresado en la unidad elegida a kg (contrato de la API). */
export function unidadAKg(valor: number, unidad: UnidadPeso): number {
  return unidad === 'kg' ? valor : valor / KG_POR_LB;
}

/** Cantidad sin sufijo, recortando ceros sobrantes: 61.70 -> '61.7', 28.0 -> '28'. */
export function formatearCantidad(valor: number, decimales = DECIMALES_DISPLAY): string {
  return redondearDecimal(valor, decimales)
    .toFixed(decimales)
    .replace(/\.0+$/, '');
}

/**
 * Formatea un peso persistido en kg para mostrarlo en la unidad elegida.
 * Devuelve null cuando no hay valor numérico representable. Tolera datos legacy con coma.
 */
export function formatearPesoDesdeKg(
  kg: string | number | null | undefined,
  unidad: UnidadPeso,
  decimales = DECIMALES_DISPLAY
): string | null {
  if (kg === null || kg === undefined || kg === '') return null;
  const numerico = typeof kg === 'number' ? kg : Number(normalizarEntradaDecimal(String(kg)));
  if (!Number.isFinite(numerico)) return null;
  return formatearCantidad(kgAUnidad(numerico, unidad), decimales);
}

/** Peso con sufijo de unidad listo para UI: '28 kg' | '61.7 lb'. */
export function formatearPesoConUnidad(
  kg: string | number | null | undefined,
  unidad: UnidadPeso,
  decimales = DECIMALES_DISPLAY
): string | null {
  const cantidad = formatearPesoDesdeKg(kg, unidad, decimales);
  return cantidad === null ? null : `${cantidad} ${unidad}`;
}

export interface ResultadoPeso {
  ok: boolean;
  /** Peso canónico en kg (string decimal del contrato) o '' cuando el campo está vacío. */
  kg: string;
  error?: string;
}

/**
 * Convierte el texto del alumno (en la unidad elegida) al kg canónico del contrato.
 * El campo vacío es válido (el peso es opcional, RN-01); un texto no decimal se rechaza
 * con mensaje inline para que jamás viaje a la API ni a la cola offline.
 */
export function convertirEntradaPesoAKg(texto: string, unidad: UnidadPeso): ResultadoPeso {
  const normalizado = normalizarEntradaDecimal(texto);
  if (normalizado === '') return { ok: true, kg: '' };
  if (!DECIMAL_STRING_REGEX.test(normalizado)) {
    return { ok: false, kg: '', error: 'Peso inválido: usa solo números (ej. 28 o 28.5)' };
  }
  const valor = Number(normalizado);
  if (!Number.isFinite(valor)) {
    return { ok: false, kg: '', error: 'Peso inválido: usa solo números (ej. 28 o 28.5)' };
  }
  const kg = unidad === 'kg' ? valor : unidadAKg(valor, unidad);
  return { ok: true, kg: redondearDecimal(kg, DECIMALES_KG).toFixed(DECIMALES_KG) };
}

/**
 * Normaliza un kg persistido (incluso valores legacy con coma) al formato del contrato.
 * Devuelve '' para "sin peso", null cuando el valor no es representable y debe bloquearse.
 */
export function normalizarKgParaContrato(kg: string | null | undefined): string | null {
  if (kg === null || kg === undefined) return null;
  const normalizado = normalizarEntradaDecimal(String(kg));
  if (normalizado === '') return '';
  return DECIMAL_STRING_REGEX.test(normalizado) ? normalizado : null;
}

export interface ResultadoPesoPrescrito {
  /** Texto listo para enviar a la API (coma decimal convertida a punto). */
  valor: string;
  error?: string;
}

/**
 * Normaliza la carga prescrita escrita por el coach ANTES de enviarla a la API.
 *
 * - Acepta vacío (prescripción cualitativa): la API persiste `peso_prescrito_kg = null`
 *   y conserva el texto en notas; nunca se materializa '0.00'.
 * - Convierte la coma decimal entre dígitos ('60,5 kg' → '60.5 kg') para que el extractor
 *   numérico del backend no pierda la fracción.
 * - Si el texto contiene números que no cumplen el contrato decimal (máx. 2 decimales),
 *   devuelve un error para bloqueo y aviso inline.
 */
export function normalizarPesoPrescritoTexto(texto: string | null | undefined): ResultadoPesoPrescrito {
  const base = (texto ?? '').trim();
  if (base === '') return { valor: '' };

  const conPunto = base.replace(/(\d),(\d)/g, '$1.$2').replace(/[.,]\s*$/, '');
  const numeros = conPunto.match(/\d+(\.\d+)?/g) ?? [];
  const invalido = numeros.find((numero) => !DECIMAL_STRING_REGEX.test(numero));
  if (invalido) {
    return {
      valor: conPunto,
      error: 'Carga inválida: usa números con punto o coma (ej. 60 o 60.5)',
    };
  }
  return { valor: conPunto };
}


export function validarRpe(texto: string): { ok: boolean; rpe: string; error?: string } {
  const normalizado = normalizarEntradaDecimal(texto);
  if (normalizado === '') return { ok: true, rpe: '' };
  if (!RPE_REGEX.test(normalizado)) {
    return { ok: false, rpe: '', error: 'Esfuerzo no válido: usa un número del 0 al 10 (ej. 8 u 8.5)' };
  }
  const valor = Number(normalizado);
  if (!Number.isFinite(valor) || valor < 0 || valor > 10) {
    return { ok: false, rpe: '', error: 'Esfuerzo no válido: debe estar entre 0 y 10' };
  }
  return { ok: true, rpe: normalizado };
}

/** Valida reps contra `RegistrarSerieSchema` (entero 0..200). Devuelve el error o null. */
export function validarReps(valor: number): string | null {
  if (!Number.isInteger(valor) || valor < 0 || valor > 200) {
    return 'Repeticiones no válidas: usa un número entero entre 0 y 200';
  }
  return null;
}

/**
 * Paso de los steppers de peso en la unidad visible: ±2.5 kg o ±5 lb.
 * Se devuelve también el equivalente en kg para no acumular deriva decimal.
 */
export function pasoPesoEnUnidad(unidad: UnidadPeso): number {
  return unidad === 'kg' ? 2.5 : 5;
}

export function pasoPesoEnKg(unidad: UnidadPeso): number {
  const paso = pasoPesoEnUnidad(unidad);
  return unidad === 'kg' ? paso : paso / KG_POR_LB;
}
