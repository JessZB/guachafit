/**
 * M8 plantillas (fase B, prompt 58) · pie del modal crear/editar plantilla.
 *
 * Origen: `PlantillasPage.tsx:957-996` (partido de `ModalPlantilla` para
 * cumplir el objetivo R2 ≤ 250 por componente). Componente único (R3).
 * Solo props y callbacks (R1): sin `useQuery` ni `api-client`. Conserva el
 * resumen del editor y los textos de guardado que usan los specs (R5).
 *
 * §6: `pluralizar` en el resumen, botones 44px (`min-h-11`), piso 11px,
 * tokens con variante claro/oscuro, peso ≤ 700.
 */
import { Sparkles, WifiOff } from 'lucide-react';
import { pluralizar } from '../../../lib/pluralizar';
import type { ResumenEditorPlantilla } from './ModalPlantilla';

export interface PieModalPlantillaProps {
  resumenEditor: ResumenEditorPlantilla;
  isSaving: boolean;
  guardadoBloqueado: boolean;
  editando: boolean;
  onGuardar: () => void;
  onCerrar: () => void;
}

export function PieModalPlantilla({
  resumenEditor,
  isSaving,
  guardadoBloqueado,
  editando,
  onGuardar,
  onCerrar,
}: PieModalPlantillaProps) {
  return (
    <div className="pt-3 border-t border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <span className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        {pluralizar(resumenEditor.totalDias, 'día', 'días')} ·{' '}
        {pluralizar(resumenEditor.totalEjercicios, 'ejercicio', 'ejercicios')} ·{' '}
        {pluralizar(resumenEditor.totalSeries, 'serie', 'series')}
      </span>

      <div className="flex gap-2 self-end sm:self-auto">
        <button
          type="button"
          disabled={isSaving}
          onClick={onCerrar}
          className="min-h-11 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs cursor-pointer disabled:opacity-50"
        >
          Cerrar
        </button>
        <button
          type="button"
          disabled={isSaving || guardadoBloqueado}
          onClick={onGuardar}
          className="min-h-11 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
        >
          {isSaving ? (
            <>
              <div className="h-3 w-3 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
              <span>Guardando...</span>
            </>
          ) : guardadoBloqueado ? (
            <>
              <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Necesitas internet para guardar</span>
            </>
          ) : (
            <span>{editando ? 'Guardar cambios' : 'Crear plantilla'}</span>
          )}
        </button>
      </div>
    </div>
  );
}
