/**
 * Mis alumnos (2026-10-19) · esqueleto de carga del directorio.
 *
 * `role="status"` con nombre accesible "Cargando alumnos": los lectores de pantalla lo anuncian y
 * la vista no muestra cifras falsas mientras llega la respuesta. Las formas imitan las tarjetas para
 * que la página no salte al cargar.
 * Presentacional: sin datos ni red (R1).
 */

const TARJETAS_ESQUELETO = [0, 1, 2, 3, 4, 5];

export function EsqueletoDirectorio() {
  return (
    <div
      role="status"
      aria-label="Cargando alumnos"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5"
    >
      {TARJETAS_ESQUELETO.map((indice) => (
        <div
          key={indice}
          aria-hidden="true"
          className="p-4 rounded-3xl bg-card border border-border/80 space-y-3 animate-pulse"
        >
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 shrink-0 rounded-full bg-secondary" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/3 rounded bg-secondary" />
              <div className="h-3 w-1/3 rounded bg-secondary" />
            </div>
          </div>
          <div className="h-3 w-1/2 rounded bg-secondary" />
          <div className="h-3 w-3/4 rounded bg-secondary" />
        </div>
      ))}
    </div>
  );
}
