/**
 * Ola 4 · U4 — confirmación de logout con mutaciones sin sincronizar.
 *
 * Diálogo accesible (Escape + trampa de Tab + restore del foco vía `useDialogoAccesible`).
 * Un clic fuera del panel equivale a «Cancelar y volver a la aplicación» (nunca cierra sesión ni
 * sincroniza); mientras se sincroniza no hay cierre.
 */
import React from 'react';
import { AlertTriangle, Loader2, LogOut, RefreshCw, X } from 'lucide-react';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { CLASES_SALIDA_MODAL, useSalidaModal } from '../../lib/use-salida-modal';

export interface DialogoLogoutPendientesProps {
  abierto: boolean;
  pendientes: number;
  sincronizando: boolean;
  mensaje: string | null;
  onCancelar: () => void;
  onConfirmar: () => void;
  onSincronizar: () => void;
}

export function DialogoLogoutPendientes({
  abierto,
  pendientes,
  sincronizando,
  mensaje,
  onCancelar,
  onConfirmar,
  onSincronizar,
}: DialogoLogoutPendientesProps) {
  // Mientras se sincroniza, Escape no cierra: evita dejar la operación a medias.
  const { saliendo, cerrar } = useSalidaModal(onCancelar);
  const refDialogo = useDialogoAccesible({
    abierto,
    onCerrar: cerrar,
    cerrarConEscape: !sincronizando,
  });

  if (!abierto) return null;

  const etiquetaCambios = pendientes === 1 ? 'cambio' : 'cambios';

  return (
    <div
      data-saliendo={saliendo || undefined}
      onClick={(evento) => {
        if (evento.target === evento.currentTarget && !sincronizando) cerrar();
      }}
      className={`fixed inset-0 z-[70] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200 ${CLASES_SALIDA_MODAL}`}
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-pendientes-title"
        aria-describedby="logout-pendientes-desc"
        tabIndex={-1}
        className="w-full max-w-sm rounded-3xl bg-card border border-border/80 shadow-2xl p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-warning/15 text-warning shrink-0">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h2
              id="logout-pendientes-title"
              className="font-bold text-base text-foreground leading-tight"
            >
              Cambios sin sincronizar
            </h2>
          </div>
          <button
            type="button"
            onClick={cerrar}
            disabled={sincronizando}
            aria-label="Cancelar y volver a la aplicación"
            className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p id="logout-pendientes-desc" className="text-sm text-muted-foreground leading-relaxed">
          Tienes <strong className="text-foreground">{pendientes}</strong> {etiquetaCambios} sin
          sincronizar. Si cierras sesión se descartarán.
        </p>

        {mensaje && (
          <p role="alert" className="text-xs font-semibold text-warning leading-relaxed">
            {mensaje}
          </p>
        )}

        <div className="space-y-2 pt-0.5">
          <button
            type="button"
            onClick={onSincronizar}
            disabled={sincronizando}
            className="w-full py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-sm shadow-primary/25 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            {sincronizando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span>{sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={cerrar}
              disabled={sincronizando}
              className="py-2.5 px-4 rounded-xl bg-secondary text-foreground border border-border font-bold text-xs hover:bg-secondary/80 active:scale-98 transition-all cursor-pointer disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirmar}
              disabled={sincronizando}
              className="py-2.5 px-4 rounded-xl bg-destructive/15 text-destructive border border-destructive/30 font-bold text-xs hover:bg-destructive/25 active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Cerrar sesión igualmente</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
