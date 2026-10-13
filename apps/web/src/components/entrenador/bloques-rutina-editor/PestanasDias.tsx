/**
 * Módulo `bloques-rutina-editor` (Ola 2, prompt 74) · pestañas de días del editor.
 *
 * Origen: `BloquesRutinaEditor.tsx:201-237`. Componente único de la vista (R3: las
 * pestañas de `ContenidoRutinaSemanal.tsx:41-76` usan otro copy —`Añadir Día` frente
 * a `Añadir día`— y sin `aria-pressed` ni área 44px, así que la sustitución no es
 * mecánica). Solo props y callbacks (R1): sin `useQuery` ni `api-client` (R9).
 * Conserva `aria-pressed`, textos y clases que usan los specs (R5).
 *
 * Convergence (76): reused by the alumno routine body via the optional
 * `addDayLabel` variant (Plantillas copy stays the default). Extra `aria-pressed`
 * and 44px targets do not alter any spec-queried name.
 *
 * §6: español claro, controles 44px (`min-h-11`), piso 11px, tokens con variante
 * claro/oscuro, pesos ≤ 700.
 */
import { Plus } from 'lucide-react';
import { NOMBRES_DIAS_SEMANA, type BloqueEdicion } from '../../../lib/rutina-bloques';
import { triggerHaptic } from '../../../lib/haptics';

interface PestanasDiasProps {
  bloques: BloqueEdicion[];
  indiceActivo: number;
  onElegirDia: (indice: number) => void;
  onAgregarDia: () => void;
  /** Copy variant for the add-day button (default: Plantillas copy). */
  addDayLabel?: string;
}

export function PestanasDias({ bloques, indiceActivo, onElegirDia, onAgregarDia, addDayLabel = 'Añadir día' }: PestanasDiasProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-border/60">
      {bloques.map((bloque, idx) => {
        const diaNum = bloque.diaNumero || idx + 1;
        const nombreDia = bloque.diaSugerido ? NOMBRES_DIAS_SEMANA[bloque.diaSugerido] : undefined;
        return (
          <button
            key={bloque.diaId || idx}
            type="button"
            onClick={() => {
              triggerHaptic('selection');
              onElegirDia(idx);
            }}
            aria-pressed={indiceActivo === idx}
            className={`min-h-11 py-1.5 px-3 rounded-xl font-bold text-xs whitespace-nowrap transition-all cursor-pointer ${
              indiceActivo === idx
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            {nombreDia ? `Día ${diaNum} (${nombreDia})` : `Día ${diaNum}`}
          </button>
        );
      })}

      {bloques.length < 7 && (
        <button
          type="button"
          onClick={onAgregarDia}
          className="min-h-11 py-1.5 px-3 rounded-xl bg-secondary/80 hover:bg-secondary text-primary font-bold text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{addDayLabel}</span>
        </button>
      )}
    </div>
  );
}
