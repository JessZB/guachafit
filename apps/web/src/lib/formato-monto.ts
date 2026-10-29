/**
 * Formato de montos y decimales para la UI (UX-03; COB-15 y SEG-09 de
 * `00_Inbox/Auditoria_UX_Vistas_2026-10-28.md`).
 *
 * Decisión del dueño (2026-10-28): formato venezolano por defecto (`$1.900,00`,
 * `Bs. 36.500,00`). A futuro el formato vendrá de la preferencia del usuario firmado. Por eso
 * las vistas llaman siempre a estos helpers y nunca fijan un locale a mano; la preferencia se
 * inyectará en un único punto, mediante la opción `formato`.
 *
 * No usa `Intl` ni `toLocaleString`: el locale `es` tiene `minimumGroupingDigits` 2 y la salida
 * varía según la versión de ICU del navegador. El formateo es manual y determinista.
 *
 * `formatDecimal` es el núcleo único: `formatMonto` lo reutiliza y solo añade signo, símbolo y
 * código. Sin JSX, sin red, sin estado.
 */

export type FormatoNumero = 'coma-decimal' | 'punto-decimal';
export const FORMATO_NUMERO_POR_DEFECTO: FormatoNumero = 'coma-decimal';
export type MonedaMonto = 'USD' | 'VES';

/** Valor no disponible o no válido: guion largo, nunca un número inventado. */
const SIN_VALOR = '—';

/** Entrada válida de texto: formato de la API (punto decimal, signo opcional). */
const PATRON_API = /^-?\d+(\.\d+)?$/;

const SEPARADORES: Record<FormatoNumero, { miles: string; decimal: string }> = {
  'coma-decimal': { miles: '.', decimal: ',' },
  'punto-decimal': { miles: ',', decimal: '.' },
};

/** Convierte la entrada a número finito, o `null` si no es un dato válido. */
function aNumeroValido(valor: string | number | null | undefined): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor === 'string' && PATRON_API.test(valor)) return Number(valor);
  return null;
}

/**
 * Formatea un decimal con separadores de miles y decimal. Devuelve el signo `-` solo si el valor
 * redondeado no es cero. Nota: `toFixed` redondea sobre la representación binaria (`1.005` queda
 * en `1,00`).
 */
export function formatDecimal(
  valor: string | number | null | undefined,
  opciones: { decimales?: number; formato?: FormatoNumero } = {}
): string {
  const numero = aNumeroValido(valor);
  if (numero === null) return SIN_VALOR;

  const decimales = opciones.decimales ?? 2;
  const { miles, decimal } = SEPARADORES[opciones.formato ?? FORMATO_NUMERO_POR_DEFECTO];

  // Se redondea el valor absoluto para que el signo no quede pegado a un cero redondeado.
  const absoluto = Math.abs(numero).toFixed(decimales);
  const esCero = Number(absoluto) === 0;
  const [entero, fraccion] = absoluto.split('.');
  const enteroAgrupado = entero.replace(/\B(?=(\d{3})+(?!\d))/g, miles);
  const cuerpo = fraccion === undefined ? enteroAgrupado : `${enteroAgrupado}${decimal}${fraccion}`;

  return numero < 0 && !esCero ? `-${cuerpo}` : cuerpo;
}

/**
 * Formatea un monto con su símbolo: `$` para USD y `Bs. ` para VES. El signo va antes del símbolo
 * (`-$5,00`). `conCodigo` añade ` USD` y no tiene efecto en VES.
 */
export function formatMonto(
  valor: string | number | null | undefined,
  moneda: MonedaMonto,
  opciones: { formato?: FormatoNumero; conCodigo?: boolean } = {}
): string {
  const texto = formatDecimal(valor, { formato: opciones.formato });
  if (texto === SIN_VALOR) return SIN_VALOR;

  const signo = texto.startsWith('-') ? '-' : '';
  const absoluto = texto.slice(signo.length);

  if (moneda === 'USD') {
    return `${signo}$${absoluto}${opciones.conCodigo ? ' USD' : ''}`;
  }
  return `${signo}Bs. ${absoluto}`;
}
