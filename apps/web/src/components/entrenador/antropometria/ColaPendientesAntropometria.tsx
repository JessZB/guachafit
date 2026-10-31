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
import { Search, CheckCircle2 } from "lucide-react";
import { EstadoVacio } from "../../ui/EstadoVacio";
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
              placeholder="Buscar en esta página…"
              aria-label="Buscar evaluación pendiente por alumno"
              className="w-full min-h-11 pl-9 pr-3 py-2.5 rounded-xl bg-background border border-border text-base sm:text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary transition-colors"
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
        <EstadoVacio
          titulo="Sin evaluaciones pendientes"
          detalle="Todos los check-ins antropométricos remotos han sido validados."
          icono={CheckCircle2}
          nivelTitulo={3}
        />
      ) : visibles.length === 0 ? (
        <EstadoVacio
          titulo="Sin resultados"
          detalle="Ninguna evaluación pendiente coincide con la búsqueda."
          accion={{ texto: "Limpiar búsqueda", onAccion: onLimpiarBusqueda }}
        />
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
