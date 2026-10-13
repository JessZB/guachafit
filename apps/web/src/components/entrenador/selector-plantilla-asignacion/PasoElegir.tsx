/**
 * Paso 1 del selector: buscador, skeleton de carga, error con reintento,
 * vacíos y lista de plantillas activas.
 *
 * Recorte verbatim del módulo `selector-plantilla-asignacion` (prompt 71, lote B).
 * Presentacional: no pide datos; recibe listas y callbacks.
 */
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, RefreshCw, Search } from 'lucide-react';
import type { PlantillaRutinaResumenDTO } from '@guachafit/shared';
import { ETIQUETAS_NIVEL_PLANTILLA } from '../../../lib/plantillas-rutina';
import { pluralizar } from '../../../lib/pluralizar';

export function PasoElegir({
  idBase,
  busqueda,
  plantillasFiltradas,
  totalPlantillas,
  detalleId,
  cargandoDetalleId,
  isLoading,
  errorCarga,
  errorDetalle,
  onCambiarBusqueda,
  onRecargar,
  onSeleccionar,
  onNavegarAPlantillas,
}: {
  idBase: string;
  busqueda: string;
  plantillasFiltradas: PlantillaRutinaResumenDTO[];
  totalPlantillas: number;
  detalleId: string | null;
  cargandoDetalleId: string | null;
  isLoading: boolean;
  errorCarga: string | null;
  errorDetalle: string | null;
  onCambiarBusqueda: (texto: string) => void;
  onRecargar: () => void;
  onSeleccionar: (plantilla: PlantillaRutinaResumenDTO) => void;
  onNavegarAPlantillas: () => void;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor={`${idBase}-busqueda`} className="text-sm font-medium text-foreground">
          Buscar plantilla
        </label>
        <div className="relative">
          <Search
            className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <input
            id={`${idBase}-busqueda`}
            type="search"
            value={busqueda}
            onChange={(e) => onCambiarBusqueda(e.target.value)}
            autoFocus
            placeholder="Nombre de la plantilla"
            className="w-full min-h-11 pl-9 pr-3 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-label="Cargando plantillas">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-xl bg-secondary/40 animate-pulse" />
          ))}
        </div>
      ) : errorCarga ? (
        <div role="alert" className="py-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">{errorCarga}</p>
          <button
            type="button"
            onClick={onRecargar}
            className="min-h-11 inline-flex items-center gap-1.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reintentar
          </button>
        </div>
      ) : plantillasFiltradas.length === 0 ? (
        <div className="py-6 text-center space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {totalPlantillas === 0 ? 'No tienes plantillas activas' : 'Sin coincidencias'}
          </p>
          <p className="text-sm text-muted-foreground">
            {totalPlantillas === 0 ? (
              <>
                Crea una en{' '}
                <Link
                  to="/coach/plantillas"
                  className="text-primary font-semibold hover:underline"
                  onClick={onNavegarAPlantillas}
                >
                  Plantillas de ejercicios
                </Link>{' '}
                y vuelve a intentarlo.
              </>
            ) : (
              'Prueba con otro nombre.'
            )}
          </p>
        </div>
      ) : (
        <ul role="list" className="divide-y divide-border/70 border-y border-border/70">
          {plantillasFiltradas.map((plantilla) => {
            const seleccionada = detalleId === plantilla.id;
            return (
              <li key={plantilla.id}>
                <button
                  type="button"
                  onClick={() => onSeleccionar(plantilla)}
                  disabled={Boolean(cargandoDetalleId)}
                  aria-pressed={seleccionada}
                  className={`w-full min-h-14 px-3 py-3 flex items-center gap-3 text-left cursor-pointer transition-colors disabled:opacity-60 ${
                    seleccionada ? 'bg-primary/10' : 'hover:bg-secondary/50'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground break-words">
                      {plantilla.nombre}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {ETIQUETAS_NIVEL_PLANTILLA[plantilla.nivelObjetivo]} ·{' '}
                      {pluralizar(plantilla.totalDias, 'día', 'días')} ·{' '}
                      {pluralizar(plantilla.totalEjercicios, 'ejercicio', 'ejercicios')}
                    </span>
                  </span>
                  {cargandoDetalleId === plantilla.id ? (
                    <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" aria-hidden="true" />
                  ) : (
                    seleccionada && (
                      <CheckCircle2 className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
                    )
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {errorDetalle && (
        <p role="alert" className="text-sm text-destructive">
          {errorDetalle}
        </p>
      )}
      {!detalleId && !isLoading && plantillasFiltradas.length > 0 && (
        <p id={`${idBase}-pista-siguiente`} className="text-sm text-muted-foreground">
          Elige una plantilla para continuar.
        </p>
      )}
    </>
  );
}
