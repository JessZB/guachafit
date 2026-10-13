/**
 * Ola 3 · módulo `asignacion-masiva-plantilla` (lote B, presentacional).
 *
 * Buscador + lista de alumnos con paginación manual. Recorte verbatim de
 * `AsignacionMasivaPlantilla.tsx:382-480`. No pide datos: todo entra por props.
 */
import type { PerfilAlumnoDetalleDTO } from '@guachafit/shared';
import { Loader2, Search } from 'lucide-react';
import {
  MAX_ALUMNOS_ASIGNACION,
  mensajeListaVaciaAlumnos,
} from '../../../lib/asignacion-masiva';
import { nombreCompletoAsignacion } from '../../../lib/asignacion-masiva-plantilla-nombres';

export function ListaAlumnosAsignacion({
  alumnos,
  seleccion,
  seleccionadosFueraDeLista,
  avisoLimite,
  isLoading,
  isCargandoMas,
  errorCarga,
  busqueda,
  busquedaAplicada,
  hayMas,
  onCambiarBusqueda,
  onAlternar,
  onReintentar,
  onCargarMas,
}: {
  alumnos: PerfilAlumnoDetalleDTO[];
  seleccion: string[];
  seleccionadosFueraDeLista: number;
  avisoLimite: boolean;
  isLoading: boolean;
  isCargandoMas: boolean;
  errorCarga: string | null;
  busqueda: string;
  busquedaAplicada: string;
  hayMas: boolean;
  onCambiarBusqueda: (valor: string) => void;
  onAlternar: (alumnoId: string) => void;
  onReintentar: () => void;
  onCargarMas: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="asignacion-masiva-busqueda" className="text-xs font-bold text-foreground">
          Alumnos
        </label>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {seleccion.length} de {MAX_ALUMNOS_ASIGNACION} seleccionados
          {seleccionadosFueraDeLista > 0 && ` (${seleccionadosFueraDeLista} fuera de esta lista)`}
        </span>
      </div>
      <div className="relative">
        <Search
          className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <input
          id="asignacion-masiva-busqueda"
          type="search"
          value={busqueda}
          onChange={(evento) => onCambiarBusqueda(evento.target.value)}
          placeholder="Buscar por nombre..."
          className="w-full min-h-11 pl-9 pr-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
        />
      </div>
      {avisoLimite && (
        <p role="alert" className="text-xs font-semibold text-warning">
          Puedes asignar hasta {MAX_ALUMNOS_ASIGNACION} alumnos a la vez.
        </p>
      )}

      {isLoading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="Cargando alumnos" />
        </div>
      ) : errorCarga && alumnos.length === 0 ? (
        <div role="alert" className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-2">
          <p>{errorCarga}</p>
          <button
            type="button"
            onClick={onReintentar}
            className="min-h-11 px-3 rounded-xl bg-secondary text-foreground font-bold text-xs cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      ) : alumnos.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          {mensajeListaVaciaAlumnos(busquedaAplicada)}
        </p>
      ) : (
        <ul className="max-h-72 overflow-y-auto space-y-2 pr-1">
          {alumnos.map((alumno) => {
            const marcado = seleccion.includes(alumno.id);
            const idCasilla = `asignacion-masiva-${alumno.id}`;
            return (
              <li key={alumno.id}>
                <label
                  htmlFor={idCasilla}
                  className={`min-h-11 px-3 py-2 rounded-xl border flex items-center gap-3 cursor-pointer text-xs ${
                    marcado ? 'border-primary/50 bg-primary/5' : 'border-border/70 hover:border-primary/30'
                  }`}
                >
                  <input
                    id={idCasilla}
                    type="checkbox"
                    checked={marcado}
                    onChange={() => onAlternar(alumno.id)}
                    className="h-5 w-5 accent-primary cursor-pointer"
                  />
                  <span className="font-semibold text-foreground">{nombreCompletoAsignacion(alumno)}</span>
                </label>
              </li>
            );
          })}
          {(hayMas || errorCarga) && (
            <li className="pt-1 space-y-2">
              {errorCarga && (
                <p role="alert" className="text-xs text-destructive">
                  {errorCarga}
                </p>
              )}
              <button
                type="button"
                onClick={onCargarMas}
                disabled={isCargandoMas}
                aria-busy={isCargandoMas}
                className="w-full min-h-11 px-3 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                {isCargandoMas && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                )}
                <span>{isCargandoMas ? 'Cargando...' : 'Cargar más alumnos'}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

