import { Skeleton } from './Skeleton';

/**
 * Presets de esqueleto (fase 2 «carga sin saltos»).
 *
 * Presentacionales y decorativos: raíz `aria-hidden`, sin `role="status"` ni texto (el anuncio
 * accesible vive en `CargaConEsqueleto`). Las alturas se aproximan a las de la vista real para
 * minimizar el salto al llegar los datos. Cada preset marca su raíz con `data-esqueleto` y cada
 * bloque repetible con `data-esqueleto-bloque`.
 */

const TARJETA = 'rounded-3xl bg-card border border-border/80';

function rango(cantidad: number): number[] {
  return Array.from({ length: Math.max(0, cantidad) }, (_, indice) => indice);
}

export function EsqueletoTarjetasKpi({ cantidad = 4 }: { cantidad?: number }) {
  return (
    <div
      data-esqueleto="tarjetas-kpi"
      aria-hidden="true"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      {rango(cantidad).map((indice) => (
        <div
          key={indice}
          data-esqueleto-bloque
          className={`min-h-[96px] p-5 space-y-3 ${TARJETA}`}
        >
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-36" />
        </div>
      ))}
    </div>
  );
}

export function EsqueletoListaFilas({
  filas = 4,
  conAvatar = false,
}: {
  filas?: number;
  conAvatar?: boolean;
}) {
  return (
    <div data-esqueleto="lista-filas" aria-hidden="true" className="space-y-3">
      {rango(filas).map((indice) => (
        <div
          key={indice}
          data-esqueleto-bloque
          className={`flex items-center gap-3 min-h-[68px] px-4 py-3 ${TARJETA}`}
        >
          {conAvatar && <Skeleton className="h-10 w-10 shrink-0 rounded-full" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EsqueletoRejillaTarjetas({ cantidad = 6 }: { cantidad?: number }) {
  return (
    <div
      data-esqueleto="rejilla-tarjetas"
      aria-hidden="true"
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
    >
      {rango(cantidad).map((indice) => (
        <div
          key={indice}
          data-esqueleto-bloque
          className={`min-h-[140px] p-5 space-y-3 ${TARJETA}`}
        >
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export function EsqueletoFormulario({ campos = 4 }: { campos?: number }) {
  return (
    <div data-esqueleto="formulario" aria-hidden="true" className="space-y-4">
      {rango(campos).map((indice) => (
        <div key={indice} data-esqueleto-bloque className="min-h-[56px] space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      ))}
      <div data-esqueleto-bloque>
        <Skeleton className="h-11 w-40 rounded-xl" />
      </div>
    </div>
  );
}

export function EsqueletoCabeceraPestanas() {
  return (
    <div data-esqueleto="cabecera-pestanas" aria-hidden="true" className="space-y-6">
      <div data-esqueleto-bloque className={`flex items-center gap-4 p-5 ${TARJETA}`}>
        <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div data-esqueleto-bloque className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <div data-esqueleto-bloque className="flex gap-2">
        <Skeleton className="h-10 w-28 rounded-xl" />
        <Skeleton className="h-10 w-28 rounded-xl" />
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>
    </div>
  );
}
