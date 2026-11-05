import { useEffect, useState } from 'react';

/**
 * Devuelve `true` solo cuando `activo` lleva `retardoMs` milisegundos seguidos en `true`.
 *
 * Sirve para no dibujar indicadores de carga en las respuestas rápidas (sin parpadeo):
 * apenas `activo` pasa a `false` el indicador se apaga y el temporizador se cancela; si vuelve a
 * encenderse, el plazo se reinicia completo.
 */
export function useIndicadorRetrasado(activo: boolean, retardoMs = 150): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!activo) {
      setVisible(false);
      return;
    }
    const temporizador = setTimeout(() => setVisible(true), retardoMs);
    return () => clearTimeout(temporizador);
  }, [activo, retardoMs]);

  return activo && visible;
}
