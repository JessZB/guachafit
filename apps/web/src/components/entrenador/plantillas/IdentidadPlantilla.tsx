/**
 * M8 plantillas (fase B, prompt 58) · identidad de la plantilla (nombre + nivel).
 *
 * Origen: `PlantillasPage.tsx:883-932` (partido de `ModalPlantilla` para el
 * objetivo R2 ≤ 250 por componente). Componente único (R3). Solo props y
 * callbacks (R1): sin `useQuery` ni `api-client`. Conserva ids, labels y
 * `role="alert"` de validación que usan los specs (R5).
 *
 * §6: español claro, 11px mínimo en etiquetas, tokens con variante
 * claro/oscuro, peso ≤ 700.
 */
import { NivelObjetivoPlantilla } from '@guachafit/shared';
import {
  ETIQUETAS_NIVEL_PLANTILLA,
  NIVELES_PLANTILLA_ORDEN,
} from '../../../lib/plantillas-rutina';

export interface IdentidadPlantillaProps {
  formNombre: string;
  onCambiarNombre: (valor: string) => void;
  formNivel: NivelObjetivoPlantilla;
  onCambiarNivel: (nivel: NivelObjetivoPlantilla) => void;
  nombreError: string | null;
  mostrarNombreError: boolean;
}

export function IdentidadPlantilla({
  formNombre,
  onCambiarNombre,
  formNivel,
  onCambiarNivel,
  nombreError,
  mostrarNombreError,
}: IdentidadPlantillaProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="sm:col-span-2 space-y-1">
        <label
          htmlFor="plantilla-nombre"
          className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block"
        >
          Nombre de la plantilla
        </label>
        <input
          id="plantilla-nombre"
          type="text"
          value={formNombre}
          onChange={(e) => onCambiarNombre(e.target.value)}
          placeholder="ej. Pierna Énfasis Isquios - Fase 1"
          maxLength={120}
          autoFocus
          aria-invalid={mostrarNombreError}
          className={`w-full px-3 py-2 rounded-xl bg-background border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary transition-colors ${
            mostrarNombreError ? 'border-destructive/70' : 'border-border'
          }`}
        />
        {mostrarNombreError && (
          <span role="alert" className="text-xs font-bold text-destructive block">
            {nombreError}
          </span>
        )}
      </div>

      <div className="space-y-1">
        <label
          htmlFor="plantilla-nivel"
          className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block"
        >
          Nivel objetivo
        </label>
        <select
          id="plantilla-nivel"
          value={formNivel}
          onChange={(e) => onCambiarNivel(e.target.value as NivelObjetivoPlantilla)}
          className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary transition-colors cursor-pointer"
        >
          {NIVELES_PLANTILLA_ORDEN.map((nivel) => (
            <option key={nivel} value={nivel}>
              {ETIQUETAS_NIVEL_PLANTILLA[nivel]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
