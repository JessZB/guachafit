/**
 * RF-018 · Ajustes del entrenador: reglas de tasas de cambio (lógica pura, ADR-003).
 *
 * Origen: conversor y guardado de la pestaña «Tasa» de `AjustesPage`. Sin DOM ni red.
 *
 * UX-19: los campos aceptan la coma como separador decimal (`38,50`). Los textos escritos se
 * normalizan a punto antes de calcular o enviar, y los valores de la API (punto decimal) se
 * convierten de vuelta a texto editable con `aTextoEntrada`.
 */
import type { TasaCambioVigenteDTO } from '@guachafit/shared';
import type { FormatoNumero } from './formato-monto';

/** Fuente de tasa del formulario. Unión propia de la vista (no es `CalculoConversionDTO.fuenteTasa`). */
export type FuenteTasaAjustes = 'oficial_bcv' | 'paralelo' | 'manual';

export interface EntradasTasa {
  tasaOficialBcv: string;
  tasaParalelo: string;
  tasaActiva: string;
}

/** Errores por campo del formulario de tasa; solo trae las claves inválidas. */
export type ErroresTasa = Partial<Record<keyof EntradasTasa, string>>;

export const MENSAJES_ERROR_TASA: Record<keyof EntradasTasa, string> = {
  tasaOficialBcv:
    'Indica la tasa BCV: un número mayor que 0 con hasta cuatro decimales (por ejemplo, 36,50).',
  tasaParalelo:
    'La tasa paralelo debe ser un número mayor que 0 con hasta cuatro decimales, o déjala vacía.',
  tasaActiva:
    'Indica la tasa activa: un número mayor que 0 con hasta cuatro decimales (por ejemplo, 36,50).',
};

/** Mensaje del paralelo cuando es la fuente elegida y falta o es inválido. */
export const MENSAJE_PARALELO_REQUERIDO =
  'Indica la tasa paralelo: es la fuente que elegiste para cobrar.';
export const MENSAJE_TASA_GUARDADA = 'Tasa guardada. Se aplicará a los cobros y cuotas de tus alumnos.';
export const MENSAJE_ERROR_GUARDAR_TASA = 'No se pudo guardar la tasa. Inténtalo de nuevo.';
export const AVISO_CAMBIOS_SIN_GUARDAR_TASA = 'Cambios sin guardar';

/** Etiquetas visibles de cada fuente de tasa. */
export const ETIQUETAS_FUENTE_TASA: Record<FuenteTasaAjustes, string> = {
  oficial_bcv: 'Oficial BCV',
  paralelo: 'Paralelo',
  manual: 'Personalizada',
};

/** Hasta 7 enteros y 4 decimales, con coma o punto; sin separador de miles ni signo. */
const PATRON_ENTRADA_TASA = /^\d{1,7}([.,]\d{1,4})?$/;

/** Valor de la API (punto decimal, sin signo) para convertirlo en texto editable. */
const PATRON_VALOR_API = /^\d+(\.\d+)?$/;

/**
 * Normaliza lo escrito por el usuario a punto decimal sin rellenar ceros (`'38,50'` → `'38.50'`).
 * Devuelve `null` si el formato no es válido o el valor no es mayor que 0.
 */
export function normalizarTasa(texto: string): string | null {
  const limpio = texto.trim();
  if (!PATRON_ENTRADA_TASA.test(limpio)) return null;
  const normalizado = limpio.replace(',', '.');
  return Number(normalizado) > 0 ? normalizado : null;
}

/** Número de un texto escrito (acepta coma). `NaN` si no se puede leer. */
function aNumeroEntrada(texto: string): number {
  return parseFloat(texto.trim().replace(',', '.'));
}

/**
 * Errores por campo. BCV es obligatoria; el paralelo es opcional (vacío o solo espacios es
 * válido) pero, si se escribe, debe ser una tasa válida.
 *
 * Con `fuente` `oficial_bcv` o `paralelo`, la tasa activa copia el campo de la fuente: el error
 * se marca solo en ese campo y nunca en la activa. Con `paralelo` el paralelo pasa a ser
 * obligatorio. Sin `fuente`, o con `manual`, la activa es obligatoria.
 */
export function erroresTasa(entradas: EntradasTasa, fuente?: FuenteTasaAjustes): ErroresTasa {
  const errores: ErroresTasa = {};
  if (normalizarTasa(entradas.tasaOficialBcv) === null) {
    errores.tasaOficialBcv = MENSAJES_ERROR_TASA.tasaOficialBcv;
  }
  const paraleloVacio = entradas.tasaParalelo.trim() === '';
  if (fuente === 'paralelo' && normalizarTasa(entradas.tasaParalelo) === null) {
    errores.tasaParalelo = MENSAJE_PARALELO_REQUERIDO;
  } else if (!paraleloVacio && normalizarTasa(entradas.tasaParalelo) === null) {
    errores.tasaParalelo = MENSAJES_ERROR_TASA.tasaParalelo;
  }
  const activaEspejo = fuente === 'oficial_bcv' || fuente === 'paralelo';
  if (!activaEspejo && normalizarTasa(entradas.tasaActiva) === null) {
    errores.tasaActiva = MENSAJES_ERROR_TASA.tasaActiva;
  }
  return errores;
}

/**
 * Tasa guardada utilizable: la efectiva de la API solo si es una tasa válida (mayor que 0).
 * Una tasa guardada en 0 o ilegible cuenta como «sin tasa».
 */
export function tasaGuardadaDe(vigente: TasaCambioVigenteDTO | null | undefined): string | null {
  const efectiva = vigente?.tasaEfectiva;
  return typeof efectiva === 'string' && normalizarTasa(efectiva) !== null ? efectiva : null;
}

/**
 * Tasa final a guardar según la fuente elegida. Con `oficial_bcv`/`paralelo` la tasa
 * activa se sincroniza con el campo de la fuente; con `manual` se conserva la activa.
 */
export function resolverTasaFinal(
  fuente: FuenteTasaAjustes,
  entradas: EntradasTasa
): { tasaFinal: string; tasaActivaSincronizada: string } {
  if (fuente === 'oficial_bcv') {
    return { tasaFinal: entradas.tasaOficialBcv, tasaActivaSincronizada: entradas.tasaOficialBcv };
  }
  if (fuente === 'paralelo') {
    return { tasaFinal: entradas.tasaParalelo, tasaActivaSincronizada: entradas.tasaParalelo };
  }
  return { tasaFinal: entradas.tasaActiva, tasaActivaSincronizada: entradas.tasaActiva };
}

/**
 * Cuerpo de `PUT /finanzas/tasas`. Las entradas deben haber pasado por `erroresTasa`: con un
 * BCV o una activa ilegibles el número no es válido, por eso el guardado valida antes de llamar.
 */
export function construirPayloadTasa(
  entradas: EntradasTasa,
  tasaFinal: string,
  fuente: FuenteTasaAjustes
): {
  tasaOficialBcv: string;
  tasaParalelo: string | undefined;
  tasaActivaEntrenador: string;
  fuente: FuenteTasaAjustes;
} {
  const paralelo = aNumeroEntrada(entradas.tasaParalelo);
  return {
    tasaOficialBcv: aNumeroEntrada(entradas.tasaOficialBcv).toFixed(4),
    // D6: paralelo no informado se omite (nunca se envía "NaN").
    tasaParalelo: paralelo > 0 ? paralelo.toFixed(4) : undefined,
    tasaActivaEntrenador: aNumeroEntrada(tasaFinal).toFixed(4),
    fuente,
  };
}

/** USD→VES con `toFixed(2)`; sin tasa no se proyecta resultado ficticio (campo vacío). */
export function calcularVesDesdeUsd(tasaStr: string, usdStr: string): string {
  const tasa = aNumeroEntrada(tasaStr) || 0;
  const usd = aNumeroEntrada(usdStr) || 0;
  return tasa > 0 ? (usd * tasa).toFixed(2) : '';
}

/** VES→USD; sin tasa se conserva el valor actual (el original no tocaba el estado). */
export function calcularUsdDesdeVes(tasaStr: string, vesStr: string, usdActual: string): string {
  const tasa = aNumeroEntrada(tasaStr) || 0;
  const ves = aNumeroEntrada(vesStr) || 0;
  if (tasa > 0) {
    return (ves / tasa).toFixed(2);
  }
  return usdActual;
}

/**
 * Valor de la API (punto decimal) → texto editable con el separador del formato: al menos dos
 * decimales, sin ceros sobrantes más allá del segundo y sin separador de miles. Lo vacío o
 * inválido da cadena vacía.
 */
export function aTextoEntrada(valor: string | null | undefined, formato: FormatoNumero): string {
  if (typeof valor !== 'string' || !PATRON_VALOR_API.test(valor)) return '';
  const [entero, fraccion = ''] = valor.split('.');
  const decimales = fraccion.replace(/0+$/, '').padEnd(2, '0');
  return `${entero}${formato === 'coma-decimal' ? ',' : '.'}${decimales}`;
}

/**
 * Fuente que muestra el formulario a partir de la guardada: sin configurar → oficial BCV; una
 * fuente que el formulario no ofrece (p. ej. `perfil_coach`) se trata como personalizada.
 */
export function fuenteFormularioDesde(fuente: string | null | undefined): FuenteTasaAjustes {
  if (fuente === 'oficial_bcv' || fuente === 'paralelo' || fuente === 'manual') return fuente;
  if (fuente === null || fuente === undefined || fuente === 'sin_configurar') return 'oficial_bcv';
  return 'manual';
}

/** Etiqueta de la fuente guardada; vacía cuando no hay tasa configurada. */
export function etiquetaFuenteTasa(fuente: string | null | undefined): string {
  if (fuente === null || fuente === undefined || fuente === 'sin_configurar') return '';
  return ETIQUETAS_FUENTE_TASA[fuenteFormularioDesde(fuente)];
}

/** Valor guardado como número, o `null` si no hay dato. */
function numeroGuardado(valor: string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const numero = parseFloat(valor);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Valor escrito como número comparable: `null` si el campo está vacío y `NaN` si hay texto que
 * no es una tasa válida (nunca coincide con lo guardado).
 */
function numeroEscrito(texto: string): number | null {
  if (texto.trim() === '') return null;
  const normalizado = normalizarTasa(texto);
  return normalizado === null ? Number.NaN : Number(normalizado);
}

/**
 * ¿Hay cambios sin guardar? Compara los valores como números (`'36,50'` y `'36.5000'` son lo
 * mismo) y la fuente. Sin tasa guardada, solo cuenta que algún campo tenga texto.
 */
export function hayCambiosTasa(
  vigente: TasaCambioVigenteDTO | null | undefined,
  entradas: EntradasTasa,
  fuente: FuenteTasaAjustes
): boolean {
  const guardadas = [
    numeroGuardado(vigente?.tasaOficialBcv),
    numeroGuardado(vigente?.tasaParalelo),
    numeroGuardado(vigente?.tasaActivaEntrenador),
  ];
  const escritas = [
    numeroEscrito(entradas.tasaOficialBcv),
    numeroEscrito(entradas.tasaParalelo),
    numeroEscrito(entradas.tasaActiva),
  ];
  if (guardadas.every((valor) => valor === null)) {
    return escritas.some((valor) => valor !== null);
  }
  if (fuente !== fuenteFormularioDesde(vigente?.fuente)) return true;
  return escritas.some((valor, indice) => valor !== guardadas[indice]);
}
