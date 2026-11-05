import { useCallback, useEffect, useRef, useState } from 'react';

/** Tiempo que la franja «Serie N completada · Deshacer» permanece visible. */
export const DURACION_AVISO_SERIE_MS = 6000;

/** Serie recién completada a la que se ofrece «Deshacer» (ubicada por `id` y por índices). */
export type AvisoSerieCompletada = {
  serieId: string;
  ejercicioIndex: number;
  serieIndex: number;
  numeroSerie: number;
};

/**
 * Estado del aviso temporal de serie completada: solo hay uno a la vez, un aviso nuevo sustituye al
 * anterior y reinicia el plazo, y se auto-oculta a los 6 s.
 */
export function useAvisoSerieCompletada() {
  const [aviso, setAviso] = useState<AvisoSerieCompletada | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelar = useCallback(() => {
    if (temporizadorRef.current !== null) {
      clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
    }
  }, []);

  const ocultar = useCallback(() => {
    cancelar();
    setAviso(null);
  }, [cancelar]);

  const mostrar = useCallback(
    (nuevo: AvisoSerieCompletada) => {
      cancelar();
      setAviso(nuevo);
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        setAviso(null);
      }, DURACION_AVISO_SERIE_MS);
    },
    [cancelar]
  );

  useEffect(() => cancelar, [cancelar]);

  return { aviso, mostrar, ocultar };
}
