/**
 * ER1 (prompt 54): clasificación pura de los errores de una ruta.
 *
 * Las páginas de `router.tsx` se cargan con `lazy()`. Si el módulo no se descarga
 * (despliegue nuevo con la pestaña abierta, reinicio del servidor, sin conexión),
 * el navegador lanza uno de estos mensajes. Sin React: se usa desde `ErrorRuta`.
 */

export type TipoErrorRuta = 'version-nueva' | 'sin-conexion' | 'inesperado';

export interface DescripcionErrorRuta {
  tipo: TipoErrorRuta;
  titulo: string;
  detalle: string;
}

/** Mensajes de fallo de carga de módulo por navegador (Chrome, Safari, Firefox), en minúsculas. */
const PATRONES_CARGA_MODULO = [
  'failed to fetch dynamically imported module',
  'importing a module script failed',
  'error loading dynamically imported module',
];

function coincideConPatronCarga(texto: string): boolean {
  const normalizado = texto.toLowerCase();
  return PATRONES_CARGA_MODULO.some((patron) => normalizado.includes(patron));
}

/** `true` si el error es un fallo al descargar un módulo o un chunk perezoso. */
export function esErrorCargaModulo(error: unknown): boolean {
  if (typeof error === 'string') return coincideConPatronCarga(error);
  if (typeof error !== 'object' || error === null) return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === 'ChunkLoadError') return true;
  return typeof message === 'string' && coincideConPatronCarga(message);
}

const TEXTOS_POR_TIPO: Record<TipoErrorRuta, { titulo: string; detalle: string }> = {
  'version-nueva': {
    titulo: 'Hay una versión nueva de GUACHAFIT',
    detalle: 'Esta pantalla no se pudo abrir porque la app se actualizó. Recarga para continuar.',
  },
  'sin-conexion': {
    titulo: 'No se pudo abrir esta pantalla sin conexión',
    detalle: 'Conéctate a internet y vuelve a intentarlo.',
  },
  inesperado: {
    titulo: 'Algo salió mal al abrir esta pantalla',
    detalle: 'Vuelve a intentarlo. Si sigue pasando, ve al inicio.',
  },
};

/**
 * Tipo, título y detalle a mostrar. Un fallo de carga de módulo es `version-nueva` en línea
 * y `sin-conexion` fuera de línea; cualquier otro error es `inesperado`.
 */
export function describirErrorRuta(error: unknown, enLinea: boolean): DescripcionErrorRuta {
  let tipo: TipoErrorRuta = 'inesperado';
  if (esErrorCargaModulo(error)) {
    tipo = enLinea ? 'version-nueva' : 'sin-conexion';
  }
  return { tipo, ...TEXTOS_POR_TIPO[tipo] };
}
