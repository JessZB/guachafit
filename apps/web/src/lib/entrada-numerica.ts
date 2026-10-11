/**
 * Entrada numérica filtrada (RF-001 / RF-017, lote E3): los inputs de series solo aceptan
 * datos de su tipo, y lo inválido no llega a escribirse.
 *
 * Cada filtro recibe el texto nuevo del input y el anterior, y devuelve el que debe quedar:
 * el nuevo si es un estado válido MIENTRAS se escribe (p. ej. '8,' camino de '8,5'), o el
 * anterior si no lo es. Nunca transforma el texto; la normalización (coma → punto) ocurre
 * al validar o al componer el valor final. Los topes salen de `LIMITES_SERIE`, la misma
 * fuente que valida el API.
 */
import { LIMITES_SERIE, extraerPesoKgDeTexto } from '@guachafit/shared';
import { kgAUnidad, redondearDecimal, type UnidadPeso } from './weight-unit';

/** Dígitos con un solo separador (coma o punto) y hasta 2 decimales; admite '60,' al escribir. */
const PESO_PARCIAL = /^\d+([.,]\d{0,2})?$/;
/** 0 o un entero sin ceros a la izquierda, de hasta 3 cifras. */
const REPS_PARCIAL = /^(0|[1-9]\d{0,2})$/;
/** 1–9 con un decimal opcional 0 o 5 ('8', '8,', '8.5'), o 10 sin decimales. */
const RPE_PARCIAL = /^(10|[1-9]([.,][05]?)?)$/;
/** Número, rango a medio escribir ('8-', '8 - 10') o segundos ('45 ', '45 s', '45s'). */
const REPS_PRESCRITAS_PARCIAL = /^([1-9]\d{0,2})( ?- ?([1-9]\d{0,2})?| ?s?)$/;

/**
 * Filtro común: acepta el texto nuevo si es un estado válido. Si el anterior NO lo era (un
 * valor guardado antes de los filtros, p. ej. '10-12 reps' o '1200'), deja además borrar
 * libremente para que el campo no quede bloqueado; el rechazo final lo hace la validación
 * al guardar.
 */
function filtrar(nuevo: string, anterior: string, esValido: (texto: string) => boolean): string {
  if (nuevo === '' || esValido(nuevo)) return nuevo;
  if (!esValido(anterior) && nuevo.length < anterior.length) return nuevo;
  return anterior;
}

/** Tope del peso en la unidad visible: 999 kg o su equivalente en lb (2202.42). */
export function pesoMaximoEnUnidad(unidad: UnidadPeso): number {
  return redondearDecimal(kgAUnidad(LIMITES_SERIE.pesoKgMax, unidad), 2);
}

/** Peso real del alumno o carga numérica del coach, en la unidad visible. */
export function filtrarEntradaPeso(nuevo: string, anterior: string, unidad: UnidadPeso): string {
  const maximo = pesoMaximoEnUnidad(unidad);
  return filtrar(
    nuevo,
    anterior,
    (texto) => PESO_PARCIAL.test(texto) && Number(texto.replace(',', '.')) <= maximo
  );
}

/** Repeticiones hechas por el alumno (0–200). */
export function filtrarEntradaReps(nuevo: string, anterior: string): string {
  return filtrar(
    nuevo,
    anterior,
    (texto) => REPS_PARCIAL.test(texto) && Number(texto) <= LIMITES_SERIE.repsMax
  );
}

/** Número de series de un ajuste (1–50, como `AjusteEjercicioPlantillaSchema.series`). */
export function filtrarEntradaSeries(nuevo: string, anterior: string): string {
  if (nuevo === '') return '';
  return /^[1-9]\d?$/.test(nuevo) && Number(nuevo) <= 50 ? nuevo : anterior;
}

/** Esfuerzo (1–10 en pasos de 0,5), del alumno o prescrito por el coach. */
export function filtrarEntradaRpe(nuevo: string, anterior: string): string {
  return filtrar(nuevo, anterior, (texto) => RPE_PARCIAL.test(texto));
}

/** Repeticiones que prescribe el coach: número, rango o segundos; cada número de 1 a 200. */
export function filtrarEntradaRepsPrescritas(nuevo: string, anterior: string): string {
  return filtrar(
    nuevo,
    anterior,
    (texto) =>
      REPS_PRESCRITAS_PARCIAL.test(texto) &&
      (texto.match(/\d+/g) ?? []).every((n) => Number(n) <= LIMITES_SERIE.repsMax)
  );
}

function esRepeticionValida(texto: string): boolean {
  const reps = Number(texto);
  return Number.isInteger(reps) && reps >= 1 && reps <= LIMITES_SERIE.repsMax;
}

export const MENSAJE_REPS_PRESCRITAS_INVALIDAS =
  'Repeticiones no válidas: usa un número (10), un rango de menor a mayor (8-10) o segundos (45 s), entre 1 y 200';

/** Validación final al guardar: '10', '8-10' (rango creciente) o '45 s'; cada número 1–200. */
export function esRepsPrescritasValidas(texto: string): boolean {
  const valor = texto.trim();
  const rango = valor.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rango) {
    return (
      esRepeticionValida(rango[1]) && esRepeticionValida(rango[2]) && Number(rango[1]) < Number(rango[2])
    );
  }
  const segundos = valor.match(/^(\d+)\s?s$/);
  if (segundos) return esRepeticionValida(segundos[1]);
  return /^\d+$/.test(valor) && esRepeticionValida(valor);
}

export type ModoPesoPrescrito = 'numero' | 'corporal';

export interface PesoPrescritoInterpretado {
  modo: ModoPesoPrescrito;
  /** Número en kg con punto decimal ('' = sin carga). */
  numero: string;
  /** Texto de la prescripción sin carga numérica ('Corporal' o un texto antiguo). */
  textoCorporal: string;
}

/**
 * Separa la carga prescrita guardada en número o "peso corporal". Un texto antiguo sin
 * número ('Moderado') se conserva como corporal; uno mixto ('2x20 kg') toma el primer
 * número, igual que el API al materializar la sesión.
 */
export function interpretarPesoPrescrito(texto: string): PesoPrescritoInterpretado {
  const valor = texto.trim();
  if (valor === '') return { modo: 'numero', numero: '', textoCorporal: '' };
  const kg = extraerPesoKgDeTexto(valor);
  if (kg === null) return { modo: 'corporal', numero: '', textoCorporal: valor };
  // Texto antiguo con un número fuera de rango ('500-1200 kg'): se muestra ese número, para
  // que coincida con el aviso de tope al guardar y el coach sepa qué corregir.
  const fueraDeRango = (valor.match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map((n) => Number(n.replace(',', '.')))
    .find((n) => n > LIMITES_SERIE.pesoKgMax);
  return { modo: 'numero', numero: String(fueraDeRango ?? kg), textoCorporal: '' };
}

/** Valor de la carga prescrita listo para el formulario (y para el contrato). */
export function componerPesoPrescrito(valor: PesoPrescritoInterpretado): string {
  if (valor.modo === 'corporal') return valor.textoCorporal.trim() || 'Corporal';
  return valor.numero.replace(',', '.').replace(/\.$/, '');
}
