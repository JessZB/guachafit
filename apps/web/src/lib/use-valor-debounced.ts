/**
 * WU25a: valor con retardo (debounce) para búsquedas server-side.
 *
 * Los inputs de búsqueda del directorio y del monitor llaman al servidor ~300 ms después de la
 * última tecla, sin disparar una request por pulsación. El valor devuelto es el último estabilizado.
 */
import { useEffect, useState } from 'react';

export const RETARDO_BUSQUEDA_MS = 300;

export function useValorDebounced<T>(valor: T, milisegundos = RETARDO_BUSQUEDA_MS): T {
  const [valorEstabilizado, setValorEstabilizado] = useState(valor);

  useEffect(() => {
    const temporizador = setTimeout(() => setValorEstabilizado(valor), milisegundos);
    return () => clearTimeout(temporizador);
  }, [valor, milisegundos]);

  return valorEstabilizado;
}
