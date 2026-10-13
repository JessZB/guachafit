/**
 * Navegación fija inferior del selector: "Cerrar" / "Atrás" y
 * "Siguiente" / "Asignar rutina".
 *
 * Recorte verbatim del módulo `selector-plantilla-asignacion` (prompt 71, lote B).
 */
import type { RefObject } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import type { PasoAsignacion } from '../../../lib/asignacion-pasos';

export function BarraNavegacionPasos({
  paso,
  asignacionCompletada,
  isAsignando,
  puedeAvanzar,
  idDescripcionSiguiente,
  botonCerrarRef,
  onCerrar,
  onAtras,
  onAvanzar,
  onConfirmar,
}: {
  paso: PasoAsignacion;
  asignacionCompletada: boolean;
  isAsignando: boolean;
  puedeAvanzar: boolean;
  /** `aria-describedby` del "Siguiente" cuando está deshabilitado sin plantilla. */
  idDescripcionSiguiente?: string;
  botonCerrarRef: RefObject<HTMLButtonElement | null>;
  onCerrar: () => void;
  onAtras: () => void;
  onAvanzar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <div className="px-4 sm:px-6 py-3 border-t border-border/80 flex items-center justify-between gap-3 safe-area-pb">
      {paso === 'elegir' || asignacionCompletada ? (
        <button
          ref={botonCerrarRef}
          type="button"
          onClick={onCerrar}
          disabled={isAsignando}
          className="min-h-11 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-sm cursor-pointer disabled:opacity-50"
        >
          Cerrar
        </button>
      ) : (
        <button
          type="button"
          onClick={onAtras}
          disabled={isAsignando}
          className="min-h-11 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-sm inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Atrás
        </button>
      )}

      {paso === 'confirmar' ? (
        <button
          type="button"
          disabled={isAsignando || asignacionCompletada}
          onClick={onConfirmar}
          aria-busy={isAsignando}
          className="min-h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md shadow-primary/20 hover:brightness-110 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {isAsignando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          )}
          <span>
            {isAsignando ? 'Asignando…' : asignacionCompletada ? 'Asignación completada' : 'Asignar rutina'}
          </span>
        </button>
      ) : (
        <button
          type="button"
          disabled={!puedeAvanzar}
          onClick={onAvanzar}
          aria-describedby={idDescripcionSiguiente}
          className="min-h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Siguiente
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
