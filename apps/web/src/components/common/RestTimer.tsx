import { useEffect, useState } from 'react';
import type { CronometroDescanso } from '../atleta/entrenamiento/use-cronometro-descanso';
import { RestTimerPildora } from './RestTimerPildora';
import { RestTimerPanel } from './RestTimerPanel';

interface RestTimerProps {
  cronometro: CronometroDescanso;
}

/**
 * Cronómetro de descanso flotante (RF-001, ADR-021). Presentacional: el estado, el reloj y la
 * persistencia viven en `useCronometroDescanso`; aquí solo se elige entre la píldora discreta y el
 * panel expandido, y se anuncia el fin del descanso a los lectores de pantalla.
 */
export function RestTimer({ cronometro }: RestTimerProps) {
  const [expandido, setExpandido] = useState(false);
  const { abierto, serieId, terminado } = cronometro;

  // Cada descanso nuevo (otra serie, o abrir/cerrar) arranca como píldora para no tapar la rutina.
  useEffect(() => {
    setExpandido(false);
  }, [abierto, serieId]);

  if (!abierto) return null;

  return (
    <div
      role="timer"
      aria-label="Cronómetro de descanso"
      className="fixed bottom-[calc(5rem_+_env(safe-area-inset-bottom,0px))] lg:bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-6 z-50 max-w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      {/* Anuncia el fin solo cuando ocurre; la región existe antes para que el cambio se lea. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {terminado ? 'Descanso terminado' : ''}
      </div>
      {expandido ? (
        <RestTimerPanel cronometro={cronometro} onMinimizar={() => setExpandido(false)} />
      ) : (
        <RestTimerPildora cronometro={cronometro} onExpandir={() => setExpandido(true)} />
      )}
    </div>
  );
}
