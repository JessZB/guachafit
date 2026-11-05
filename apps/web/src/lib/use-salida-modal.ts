/**
 * Salida animada de modales: al cerrar, el fondo se apaga durante `DURACION_SALIDA_MODAL_MS` y solo
 * entonces se llama al cierre real (el modal sigue montado mientras tanto).
 *
 * Contrato:
 * - `cerrar()` evalúa `prefers-reduced-motion` EN ESE MOMENTO. Sin `matchMedia` o con movimiento
 *   reducido, llama a `onCerrar` de forma síncrona y `saliendo` no llega a activarse.
 * - Un segundo `cerrar()` mientras ya sale se ignora; desmontar cancela el temporizador.
 * - Se usa siempre el `onCerrar` más reciente (ref actualizada en un efecto, como en
 *   `use-dialogo-accesible.ts`).
 * - El elemento de fondo (`fixed inset-0`) debe llevar `data-saliendo={saliendo || undefined}` y la
 *   clase `CLASES_SALIDA_MODAL`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const DURACION_SALIDA_MODAL_MS = 150;

/**
 * Cadena estática (Tailwind la detecta por escaneo). `animate-out`, `fade-out` y `fill-mode-forwards`
 * vienen de tw-animate-css; `duration-150` fija `--tw-duration`, que `animate-out` lee. El
 * `pointer-events-none` evita clics sobre un modal que ya se está cerrando.
 */
export const CLASES_SALIDA_MODAL =
  'data-[saliendo=true]:animate-out data-[saliendo=true]:fade-out data-[saliendo=true]:fill-mode-forwards data-[saliendo=true]:duration-150 data-[saliendo=true]:pointer-events-none';

function movimientoReducido(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useSalidaModal(onCerrar: () => void): { saliendo: boolean; cerrar: () => void } {
  const [saliendo, setSaliendo] = useState(false);
  const onCerrarRef = useRef(onCerrar);
  const saliendoRef = useRef(false);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onCerrarRef.current = onCerrar;
  });

  useEffect(
    () => () => {
      if (temporizadorRef.current !== null) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
    },
    []
  );

  const cerrar = useCallback(() => {
    if (saliendoRef.current) return;
    if (movimientoReducido()) {
      onCerrarRef.current();
      return;
    }
    saliendoRef.current = true;
    setSaliendo(true);
    temporizadorRef.current = setTimeout(() => {
      temporizadorRef.current = null;
      onCerrarRef.current();
      // Los modales siempre montados (`if (!abierto) return null`) conservan el hook: se rearma
      // para que la próxima apertura no nazca con el fondo ya apagándose.
      saliendoRef.current = false;
      setSaliendo(false);
    }, DURACION_SALIDA_MODAL_MS);
  }, []);

  return { saliendo, cerrar };
}
