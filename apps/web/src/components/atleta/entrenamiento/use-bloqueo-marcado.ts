import { useCallback, useEffect, useRef, useState } from 'react';

/** Ventana tras marcar una serie en la que «Listo» de las series pendientes no responde. */
export const DURACION_BLOQUEO_MARCADO_MS = 600;

/**
 * Bloqueo corto de «Listo» tras marcar una serie, para evitar el doble toque accidental sobre la
 * serie siguiente (que ocupa el mismo lugar en el modo foco). `bloqueado` alimenta la UI;
 * `estaBloqueado()` lee el instante de fin desde un ref y responde bien incluso antes del re-render.
 */
export function useBloqueoMarcado() {
  const [bloqueado, setBloqueado] = useState(false);
  const finBloqueoRef = useRef(0);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activar = useCallback(() => {
    if (temporizadorRef.current !== null) clearTimeout(temporizadorRef.current);
    finBloqueoRef.current = Date.now() + DURACION_BLOQUEO_MARCADO_MS;
    setBloqueado(true);
    temporizadorRef.current = setTimeout(() => {
      temporizadorRef.current = null;
      finBloqueoRef.current = 0;
      setBloqueado(false);
    }, DURACION_BLOQUEO_MARCADO_MS);
  }, []);

  const estaBloqueado = useCallback(() => Date.now() < finBloqueoRef.current, []);

  useEffect(
    () => () => {
      if (temporizadorRef.current !== null) clearTimeout(temporizadorRef.current);
    },
    []
  );

  return { bloqueado, activar, estaBloqueado };
}
