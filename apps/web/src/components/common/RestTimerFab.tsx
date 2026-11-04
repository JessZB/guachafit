import type { Ref } from 'react';
import { Timer } from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';

interface RestTimerFabProps {
  onAbrir: () => void;
  /** Para devolverle el foco al cerrar el cronómetro. */
  botonRef?: Ref<HTMLButtonElement>;
}

/**
 * Botón flotante que abre el cronómetro de descanso (en pausa, listo para elegir el tiempo).
 * Reposo del widget: el cronómetro cerrado vive aquí. Entra con `starting:` (sin keyframes) y
 * responde al toque con `active:scale-95`.
 */
export function RestTimerFab({ onAbrir, botonRef }: RestTimerFabProps) {
  return (
    <button
      ref={botonRef}
      type="button"
      onClick={() => {
        triggerHaptic('selection');
        onAbrir();
      }}
      aria-label="Abrir cronómetro de descanso"
      className="flex h-14 w-14 origin-bottom-right items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30 transition-[opacity,scale] duration-250 ease-out starting:scale-75 starting:opacity-0 hover:bg-primary/90 active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Timer className="h-6 w-6" aria-hidden="true" />
    </button>
  );
}
