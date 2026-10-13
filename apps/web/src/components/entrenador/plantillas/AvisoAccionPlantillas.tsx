/**
 * M8 plantillas (fase B, prompt 58) · aviso descartable de error de acción.
 *
 * Origen: `PlantillasPage.tsx:517-536`. Componente único + CANDIDATO a
 * `AvisoDescartable` en D (fila 34 de la consolidación 48). Solo props y
 * callbacks (R1): sin `useQuery` ni `api-client`. Conserva `role="alert"` y el
 * nombre accesible "Descartar aviso" que usan los specs (R5).
 *
 * §6: español claro, área táctil 44px (`min-h-11 min-w-11`), 11px mínimo
 * (`text-xs` = 12px), tokens con variante claro/oscuro, peso ≤ 700.
 */
import { AlertCircle, X } from 'lucide-react';

export interface AvisoAccionPlantillasProps {
  mensaje: string;
  onDescartar: () => void;
}

export function AvisoAccionPlantillas({ mensaje, onDescartar }: AvisoAccionPlantillasProps) {
  return (
    <div
      role="alert"
      className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center justify-between gap-3"
    >
      <span className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {mensaje}
      </span>
      <button
        type="button"
        onClick={onDescartar}
        className="min-h-11 min-w-11 flex items-center justify-center rounded-lg hover:bg-destructive/10 cursor-pointer shrink-0"
        title="Descartar aviso"
        aria-label="Descartar aviso"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

