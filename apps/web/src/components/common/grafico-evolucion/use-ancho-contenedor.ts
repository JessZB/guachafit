/**
 * Hook de medición del contenedor del gráfico (Ola 3, módulo `grafico-evolucion`).
 *
 * Recorte verbatim de `GraficoEvolucion.tsx:83-99`: mide el ancho real para renderizar
 * el SVG a píxeles 1:1 (texto nítido). No pide datos: solo observa el DOM.
 */
import { useEffect, useRef, useState } from 'react';
import type React from 'react';

export function useAnchoContenedor(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [ancho, setAncho] = useState(640);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;
    const medir = () => setAncho(Math.max(280, Math.round(nodo.getBoundingClientRect().width)));
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(medir);
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  return [ref, ancho];
}
