import { useEffect, useRef, type RefObject } from 'react';

const CAMPOS_DE_TEXTO = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Cuando `activo`, llama a `alPlegar` si el foco entra en un campo (`input`, `textarea` o
 * `select`) FUERA del ancla. El teclado móvil que abre ese campo taparía el panel expandido del
 * cronómetro; los botones y cualquier foco dentro del propio widget no lo pliegan.
 */
export function usePlegarAlEnfocarCampo(
  activo: boolean,
  anclaRef: RefObject<HTMLElement | null>,
  alPlegar: () => void
): void {
  const alPlegarRef = useRef(alPlegar);

  useEffect(() => {
    alPlegarRef.current = alPlegar;
  });

  useEffect(() => {
    if (!activo) return;
    const alEnfocar = (evento: FocusEvent) => {
      const destino = evento.target;
      if (!(destino instanceof HTMLElement) || !CAMPOS_DE_TEXTO.has(destino.tagName)) return;
      if (anclaRef.current?.contains(destino)) return;
      alPlegarRef.current();
    };
    document.addEventListener('focusin', alEnfocar);
    return () => document.removeEventListener('focusin', alEnfocar);
  }, [activo, anclaRef]);
}
