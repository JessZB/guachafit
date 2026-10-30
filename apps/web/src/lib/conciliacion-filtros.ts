/**
 * WU20: filtros de la bandeja de conciliación (búsqueda por alumno/referencia + método de pago).
 *
 * Lógica pura y testeable: el componente mantiene el estado y aplica estas funciones sobre la
 * cola ya cargada, preservando el orden FIFO que entrega el servidor.
 */
import { MetodoPago, type TransaccionPagoDetalleDTO } from '@guachafit/shared';
import { normalizarTextoBusqueda } from './texto-busqueda';

export type FiltroMetodoPago = MetodoPago | 'todos';

type TransaccionFiltrable = Pick<
  TransaccionPagoDetalleDTO,
  'clienteNombre' | 'referenciaBancaria' | 'metodoPago'
>;

/** Etiquetas en sentence case de los métodos conocidos del enum. */
const ETIQUETAS_METODO_PAGO: Record<MetodoPago, string> = {
  [MetodoPago.PAGO_MOVIL]: 'Pago móvil',
  [MetodoPago.TRANSFERENCIA_BANCARIA]: 'Transferencia bancaria',
  [MetodoPago.EFECTIVO_USD]: 'Efectivo en dólares',
  [MetodoPago.EFECTIVO_VES]: 'Efectivo en bolívares',
  [MetodoPago.ZELLE]: 'Zelle',
  [MetodoPago.BINANCE_USDT]: 'Binance (USDT)',
  [MetodoPago.OTRO]: 'Otro',
};

/**
 * Etiqueta visible del método de pago en sentence case. Un método conocido usa su etiqueta fija;
 * uno desconocido reemplaza los guiones bajos por espacios y pone la primera letra en mayúscula.
 *
 * Acepta `string` porque los DTOs de historial del alumno tipan el método como texto; un valor
 * ausente se declara "Sin dato" en lugar de imprimirse vacío.
 */
export function etiquetaMetodoPago(metodo?: MetodoPago | string | null): string {
  const valor = (metodo ?? '').trim();
  if (valor.length === 0) return 'Sin dato';
  if (Object.prototype.hasOwnProperty.call(ETIQUETAS_METODO_PAGO, valor)) {
    return ETIQUETAS_METODO_PAGO[valor as MetodoPago];
  }
  const texto = valor.replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Métodos de pago presentes en la cola, en orden de primera aparición (para los chips). */
export function metodosPagoPresentes(txs: readonly TransaccionFiltrable[]): MetodoPago[] {
  const vistos = new Set<MetodoPago>();
  for (const tx of txs) {
    vistos.add(tx.metodoPago);
  }
  return [...vistos];
}

export interface OpcionesFiltroConciliacion {
  busqueda?: string;
  metodoPago?: FiltroMetodoPago;
}

/**
 * Filtro combinado: método de pago exacto + texto libre sobre nombre del alumno o referencia
 * bancaria. Sin filtros devuelve una copia de la cola.
 */
export function filtrarTransaccionesConciliacion<T extends TransaccionFiltrable>(
  txs: readonly T[],
  opciones: OpcionesFiltroConciliacion = {}
): T[] {
  const termino = normalizarTextoBusqueda(opciones.busqueda);
  const metodo = opciones.metodoPago ?? 'todos';
  if (termino.length === 0 && metodo === 'todos') return [...txs];

  return txs.filter((tx) => {
    if (metodo !== 'todos' && tx.metodoPago !== metodo) return false;
    if (termino.length === 0) return true;
    return (
      normalizarTextoBusqueda(tx.clienteNombre).includes(termino) ||
      normalizarTextoBusqueda(tx.referenciaBancaria).includes(termino)
    );
  });
}

/** ¿Hay búsqueda o chip de método activo? (para "N de M" y el vacío "Sin resultados"). */
export function hayFiltroConciliacionActivo(opciones: OpcionesFiltroConciliacion = {}): boolean {
  return (
    normalizarTextoBusqueda(opciones.busqueda).length > 0 ||
    (opciones.metodoPago ?? 'todos') !== 'todos'
  );
}
