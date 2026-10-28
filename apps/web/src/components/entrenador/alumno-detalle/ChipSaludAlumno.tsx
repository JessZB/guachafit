/**
 * Chip "Salud y limitaciones" de la cabecera de la ficha del alumno (L7.5–L7.6).
 *
 * Disclosure propio (sin Radix): el botón indica `aria-expanded` y `aria-controls`. El texto
 * de la ficha solo se monta mientras el panel está abierto, así que plegado no aparece en el
 * DOM ni en ningún `title`. Con el panel abierto, Escape lo pliega desde el chip o desde el
 * panel y devuelve el foco al chip. Sin ficha (`null`, vacía o solo espacios) no renderiza nada.
 *
 * Decisión del owner (2026-10-26, lote L7 de la ficha del alumno): la salud va plegada por
 * defecto y se despliega desde la cabecera; el texto completo sigue ahí, con scroll interno.
 *
 * §6: táctil `min-h-11`, texto ≥ 11px, tokens semánticos y foco visible.
 */
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Lock } from 'lucide-react';

interface ChipSaludAlumnoProps {
  fichaSaludPrivada: string | null | undefined;
  /** Abre la pestaña Perfil, donde se edita la ficha completa. */
  onVerFichaCompleta: () => void;
}

export function ChipSaludAlumno({ fichaSaludPrivada, onVerFichaCompleta }: ChipSaludAlumnoProps) {
  const [abierto, setAbierto] = useState(false);
  const idPanel = useId();
  const refChip = useRef<HTMLButtonElement>(null);

  if (!fichaSaludPrivada?.trim()) return null;

  // Escape cierra desde el chip o desde el panel (ambos dentro de este wrapper).
  const alPulsarEscape = (evento: KeyboardEvent<HTMLDivElement>) => {
    if (evento.key !== 'Escape' || !abierto) return;
    evento.stopPropagation();
    setAbierto(false);
    refChip.current?.focus();
  };

  return (
    <div className="max-w-full space-y-2" onKeyDown={alPulsarEscape}>
      <button
        ref={refChip}
        type="button"
        aria-expanded={abierto}
        aria-controls={idPanel}
        onClick={() => setAbierto((estadoPrevio) => !estadoPrevio)}
        className="min-h-11 px-3 py-2 rounded-xl inline-flex items-center gap-1.5 border border-warning/25 bg-warning/10 hover:bg-warning/20 text-warning text-xs font-semibold transition-all active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
      >
        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Salud y limitaciones</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none ${abierto ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {abierto && (
        <div
          id={idPanel}
          role="region"
          tabIndex={0}
          aria-label="Salud y limitaciones"
          className="max-w-xl max-h-64 overflow-y-auto p-3 rounded-2xl bg-warning/10 border border-warning/20 space-y-2 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">
            {fichaSaludPrivada}
          </p>
          <button
            type="button"
            onClick={onVerFichaCompleta}
            className="min-h-11 px-3 rounded-xl bg-card border border-border text-xs font-bold text-primary hover:bg-secondary transition-all active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
          >
            Editar en Perfil
          </button>
        </div>
      )}
    </div>
  );
}
