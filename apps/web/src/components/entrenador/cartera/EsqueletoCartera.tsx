/**
 * Esqueletos de carga de la cartera (lote UX-05, §6.6: carga honesta, sin cifras falsas).
 *
 * Presentacionales: no leen datos ni hacen consultas.
 * - `EsqueletoKpisCartera`: cuatro bloques con la misma rejilla que `ResumenCartera`, para que la
 *   altura no salte al llegar el resumen. Es decorativo (`aria-hidden`).
 * - `EsqueletoFilasCartera`: el anuncio accesible de carga (`role="status"`) con filas de espera.
 */

const CLASES_REJILLA_KPI = 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4';
const FILAS_ESPERA = [0, 1, 2];

export function EsqueletoKpisCartera() {
  return (
    <div className={CLASES_REJILLA_KPI} aria-hidden="true">
      {[0, 1, 2, 3].map((indice) => (
        <div
          key={indice}
          data-esqueleto="kpi"
          className="flex flex-col min-w-0 p-5 rounded-3xl bg-card border border-border/80 space-y-3 animate-pulse"
        >
          <div className="h-3 w-28 bg-secondary rounded" />
          <div className="h-7 w-36 bg-secondary/70 rounded" />
        </div>
      ))}
    </div>
  );
}

export function EsqueletoFilasCartera() {
  return (
    <div role="status" className="p-5 rounded-3xl bg-card border border-border space-y-3">
      <span className="sr-only">Cargando cartera de alumnos...</span>
      {FILAS_ESPERA.map((indice) => (
        <div
          key={indice}
          aria-hidden="true"
          className="h-12 rounded-2xl bg-secondary/60 animate-pulse"
        />
      ))}
    </div>
  );
}
