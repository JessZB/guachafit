/**
 * Cabecera de `AntropometriaPage` con las pestanas de la vista.
 *
 * Recorte verbatim (solo props): los tabs conservan sus clases `py-1.5` a proposito
 * (R5: los specs consultan por rol y nombre). Pasar a `ChipFiltro` (44px, §6.8) queda
 * como SUGGESTION para el cierre.
 */
import { Camera } from "lucide-react";

export type PestanaAntropometria = "pendientes" | "comparador";

interface EncabezadoAntropometriaProps {
  pestanaActiva: PestanaAntropometria;
  totalPendientes: number;
  onCambiarPestana: (pestana: PestanaAntropometria) => void;
}

export function EncabezadoAntropometria({
  pestanaActiva,
  totalPendientes,
  onCambiarPestana,
}: EncabezadoAntropometriaProps) {
  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
            <Camera className="h-4 w-4" />
            <span>Medidas y Fotos</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
            Evaluaciones Físicas
          </h1>
          <p className="text-xs text-muted-foreground">
            Revisa las medidas y fotos de progreso que subieron tus alumnos.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-secondary/60 p-1 rounded-2xl border border-border">
          <button
            onClick={() => onCambiarPestana("pendientes")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              pestanaActiva === "pendientes"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Por revisar ({totalPendientes})
          </button>
          <button
            onClick={() => onCambiarPestana("comparador")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              pestanaActiva === "comparador"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Comparador Antes / Después
          </button>
        </div>
      </div>
    </div>
  );
}
