import { useEffect, useState } from 'react';
import type { CronometroDescanso } from '../atleta/entrenamiento/use-cronometro-descanso';

/** Tiempo que la píldora o el panel siguen montados, ya apagándose, tras cerrar el cronómetro. */
export const DURACION_SALIDA_CRONOMETRO_MS = 150;

/** Lo que se estaba mostrando justo antes de cerrar: el cronómetro tal cual y si era el panel. */
export interface VistaCronometro {
  cronometro: CronometroDescanso;
  expandido: boolean;
}

/**
 * Capa saliente del cronómetro: al cerrarlo (píldora o panel → botón flotante) la última vista
 * sigue montada `DURACION_SALIDA_CRONOMETRO_MS` ms para poder desvanecerse.
 *
 * El hook de descanso devuelve 0 en cuanto se cierra; por eso se guarda la última vista mostrada
 * y se devuelve ESA (congelada): así no se ve «0:00» ni el anillo vacío mientras se apaga.
 * Solo hay salida al cerrar con el widget visible; ocultarlo (modal abierto) o cambiar entre
 * píldora y panel es instantáneo. El estado se ajusta durante el render (patrón de React para
 * derivar estado de props), sin efectos ni lectura de refs; el único efecto es el temporizador.
 */
export function useCapaSalienteCronometro(
  cronometro: CronometroDescanso,
  expandido: boolean,
  visible: boolean
): VistaCronometro | null {
  const capaVisible = cronometro.abierto && visible;
  const [ultima, setUltima] = useState<VistaCronometro | null>(null);
  const [saliente, setSaliente] = useState<VistaCronometro | null>(null);
  const [habiaCapa, setHabiaCapa] = useState(capaVisible);

  if (capaVisible) {
    // `cronometro` cambia de identidad en cada render, así que no se compara el objeto: solo se
    // refresca la instantánea cuando cambia algo que el alumno ve (si no, habría un `setState`
    // durante el render, y una pasada extra de `RestTimer`, en cada tick).
    if (
      ultima === null ||
      ultima.expandido !== expandido ||
      ultima.cronometro.restanteMs !== cronometro.restanteMs ||
      ultima.cronometro.duracionMs !== cronometro.duracionMs ||
      ultima.cronometro.pausado !== cronometro.pausado ||
      ultima.cronometro.terminado !== cronometro.terminado ||
      ultima.cronometro.serieId !== cronometro.serieId
    ) {
      setUltima({ cronometro, expandido });
    }
    // Se reabrió antes de que terminara la salida: la capa vieja ya no tiene sentido.
    if (saliente) setSaliente(null);
  }
  if (capaVisible !== habiaCapa) {
    setHabiaCapa(capaVisible);
    if (!capaVisible && visible && ultima) setSaliente(ultima);
  }
  // Ocultar el widget mientras sale (se abrió un modal) la retira al instante.
  if (!visible && saliente) setSaliente(null);

  useEffect(() => {
    if (!saliente) return;
    const id = setTimeout(() => setSaliente(null), DURACION_SALIDA_CRONOMETRO_MS);
    return () => clearTimeout(id);
  }, [saliente]);

  return saliente;
}
