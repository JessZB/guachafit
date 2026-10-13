/**
 * Cola de evaluaciones pendientes: paginacion server-side, buscador client-side
 * sobre la pagina ("en esta página"), vacios honestos y lista de tarjetas.
 *
 * Recorte verbatim: componente presentacional, recibe datos y callbacks (R9: el
 * mecanismo de datos vive en `use-cola-antropometria`).
 */
import type { ControlAntropometricoDetalleDTO } from "@guachafit/shared";
import { pluralizar } from "../../../lib/pluralizar";
import { Paginacion } from "../../common/Paginacion";
import { RotateCcw, Search, SearchX, CheckCircle2 } from "lucide-react";
import { TarjetaControlPendiente } from "./TarjetaControlPendiente";

interface ColaPendientesAntropometriaProps {
  pagina: number;
  tamano: number;
  total: number;
  cargando: boolean;
  busqueda: string;
  visibles: ControlAntropometricoDetalleDTO[];
  totalEnPagina: number;
  fotosConError: string[];
  onCambiarPagina: (pagina: number) => void;
  onCambiarTamano: (tamano: number) => void;
  onCambiarBusqueda: (busqueda: string) => void;
  onLimpiarBusqueda: () => void;
  onFotoError: (fotoId: string) => void;
  onVerFoto: (
    foto: ControlAntropometricoDetalleDTO["fotos"][number],
    fecha: string,
  ) => void;
  onRechazar: (control: ControlAntropometricoDetalleDTO) => void;
  onAprobar: (id: string) => void;
}

export function ColaPendientesAntropometria({
  pagina,
  tamano,
  total,
  cargando,
  busqueda,
  visibles,
  totalEnPagina,
  fotosConError,
  onCambiarPagina,
  onCambiarTamano,
  onCambiarBusqueda,
  onLimpiarBusqueda,
  onFotoError,
  onVerFoto,
  onRechazar,
  onAprobar,
}: ColaPendientesAntropometriaProps) {
  return (
    <div className="space-y-4">
      {/* WU25b: paginación numerada server-side (cola FIFO del endpoint) */}
      {total > 0 && (
        <div className="px-1">
          <Paginacion
            pagina={pagina}
            tamano={tamano}
            total={total}
            onCambiarPagina={onCambiarPagina}
            onCambiarTamano={onCambiarTamano}
            cargando={cargando}
          />
        </div>
      )}

      {total > 0 && (
        <div className="p-4 rounded-3xl bg-card border border-border/80 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => onCambiarBusqueda(e.target.value)}
              placeholder="Buscar por alumno..."
              aria-label="Buscar evaluación pendiente por alumno"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-background border border-border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary transition-colors"
            />
          </div>
          <p className="text-[11px] text-muted-foreground font-mono">
            Mostrando {visibles.length} de {totalEnPagina} en esta página ·{" "}
            {pluralizar(
              total,
              "evaluación pendiente",
              "evaluaciones pendientes",
            )}
          </p>
        </div>
      )}

      {total === 0 ? (
        <div className="p-12 text-center space-y-3 bg-card rounded-3xl border border-border">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
          <h3 className="font-bold text-base text-foreground">
            Sin Evaluaciones Pendientes
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Todos los check-ins antropométricos remotos han sido validados.
          </p>
        </div>
      ) : visibles.length === 0 ? (
        <div className="p-10 rounded-3xl bg-card border border-dashed border-border text-center space-y-3">
          <SearchX className="h-9 w-9 text-muted-foreground mx-auto opacity-50" />
          <h3 className="text-sm font-bold text-foreground">Sin resultados</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Ninguna evaluación pendiente coincide con la búsqueda.
          </p>
          <button
            type="button"
            onClick={onLimpiarBusqueda}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Limpiar búsqueda</span>
          </button>
        </div>
      ) : (
        visibles.map((ctrl) => (
          <TarjetaControlPendiente
            key={ctrl.id}
            control={ctrl}
            fotosConError={fotosConError}
            onFotoError={onFotoError}
            onVerFoto={onVerFoto}
            onRechazar={onRechazar}
            onAprobar={onAprobar}
          />
        ))
      )}
    </div>
  );
}
