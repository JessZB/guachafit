/**
 * Navegación fija inferior del selector: "Cerrar" / "Atrás" y
 * "Siguiente" / "Asignar rutina".
 *
 * Recorte verbatim del módulo `selector-plantilla-asignacion` (prompt 71, lote B).
 * Lote E10: la asignación masiva la reutiliza con sus propios pasos y textos; sin esas
 * props opcionales los textos son los de la asignación individual.
 */
import type { RefObject } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { PASOS_ASIGNACION, type PasoAsignacion } from '../../../lib/asignacion-pasos';

export function BarraNavegacionPasos({
  paso,
  pasos = PASOS_ASIGNACION,
  textoCerrar = 'Cerrar',
  textoConfirmar,
  asignacionCompletada,
  isAsignando,
  atrasDeshabilitado = false,
  puedeAvanzar,
  idDescripcionSiguiente,
  botonCerrarRef,
  onCerrar,
  onAtras,
  onAvanzar,
  onConfirmar,
}: {
  paso: PasoAsignacion;
  /** Pasos del flujo: el primero muestra el botón de cierre y el último el de confirmar. */
  pasos?: readonly PasoAsignacion[];
  /** Texto del botón de cierre del primer paso. */
  textoCerrar?: string;
  /** Texto completo del botón de confirmar (sustituye a "Asignar rutina" y sus variantes). */
  textoConfirmar?: string;
  asignacionCompletada: boolean;
  isAsignando: boolean;
  /** Deshabilita también «Atrás» (asignación masiva tras un fallo ambiguo). */
  atrasDeshabilitado?: boolean;
  puedeAvanzar: boolean;
  /** `aria-describedby` del "Siguiente" cuando está deshabilitado sin plantilla. */
  idDescripcionSiguiente?: string;
  botonCerrarRef?: RefObject<HTMLButtonElement | null>;
  onCerrar: () => void;
  onAtras: () => void;
  onAvanzar: () => void;
  onConfirmar: () => void;
}) {
  const esPrimerPaso = paso === pasos[0];
  const esUltimoPaso = paso === pasos[pasos.length - 1];
  return (
    <div className="px-4 sm:px-6 py-3 border-t border-border/80 flex items-center justify-between gap-3 safe-area-pb">
      {esPrimerPaso || asignacionCompletada ? (
        <button
          ref={botonCerrarRef}
          type="button"
          onClick={onCerrar}
          disabled={isAsignando}
          className="min-h-11 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-sm cursor-pointer disabled:opacity-50"
        >
          {textoCerrar}
        </button>
      ) : (
        <button
          type="button"
          onClick={onAtras}
          disabled={isAsignando || atrasDeshabilitado}
          className="min-h-11 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-sm inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Atrás
        </button>
      )}

      {esUltimoPaso ? (
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
            {textoConfirmar ??
              (isAsignando
                ? 'Asignando…'
                : asignacionCompletada
                  ? 'Asignación completada'
                  : 'Asignar rutina')}
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
