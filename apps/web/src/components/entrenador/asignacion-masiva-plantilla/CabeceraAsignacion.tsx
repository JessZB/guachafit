/**
 * Ola 3 · módulo `asignacion-masiva-plantilla` (lote B, presentacional).
 *
 * Cabecera del diálogo de asignación masiva. Recorte verbatim de
 * `AsignacionMasivaPlantilla.tsx:264-285`. No pide datos.
 */
import { Users, X } from 'lucide-react';
import { MAX_ALUMNOS_ASIGNACION } from '../../../lib/asignacion-masiva';

export function CabeceraAsignacion({
  nombrePlantilla,
  cerrarDeshabilitado,
  onCerrar,
}: {
  nombrePlantilla: string;
  cerrarDeshabilitado: boolean;
  onCerrar: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-3">
      <div className="flex items-center gap-2 min-w-0">
        <Users className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h3 id="asignacion-masiva-titulo" className="font-bold text-base text-foreground">
            Asignar a alumnos
          </h3>
          <p className="text-xs text-muted-foreground break-words">
            Plantilla «{nombrePlantilla}» · elige hasta {MAX_ALUMNOS_ASIGNACION} alumnos.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onCerrar}
        disabled={cerrarDeshabilitado}
        aria-label="Cerrar asignación a alumnos"
        className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}

