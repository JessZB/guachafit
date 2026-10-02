/**
 * C6: diálogo de confirmación accesible reutilizable (extraído del panel de administración).
 *
 * - `role="dialog"` + `aria-modal` + título enlazado, foco atrapado, Escape y restauración del
 *   foco vía `useDialogoAccesible`.
 * - Mientras `procesando` es `true` no se puede cerrar (ni con Escape, ni con el fondo, ni con
 *   Cancelar) para no perder el resultado de la acción en vuelo.
 */
import React from 'react';
import { Loader2 } from 'lucide-react';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';

export interface DialogoConfirmacionProps {
  abierto: boolean;
  /** `id` del título (único en la página). */
  idTitulo: string;
  titulo: string;
  detalle: React.ReactNode;
  textoConfirmar: string;
  textoCancelar?: string;
  procesando?: boolean;
  /** `peligro` pinta el botón de confirmar en rojo (acciones destructivas como archivar). */
  variante?: 'primaria' | 'peligro';
  onCancelar: () => void;
  onConfirmar: () => void;
}

export function DialogoConfirmacion({
  abierto,
  idTitulo,
  titulo,
  detalle,
  textoConfirmar,
  textoCancelar = 'Cancelar',
  procesando = false,
  variante = 'primaria',
  onCancelar,
  onConfirmar,
}: DialogoConfirmacionProps) {
  const refDialogo = useDialogoAccesible({
    abierto,
    onCerrar: () => {
      if (!procesando) onCancelar();
    },
  });

  if (!abierto) return null;

  const claseConfirmar =
    variante === 'peligro'
      ? 'bg-destructive text-white'
      : 'bg-primary text-primary-foreground';

  return (
    <div
      onClick={(evento) => {
        if (evento.target === evento.currentTarget && !procesando) {
          onCancelar();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl p-5 space-y-4"
      >
        <h2 id={idTitulo} className="text-base font-bold text-foreground">
          {titulo}
        </h2>
        <div className="text-xs text-muted-foreground">{detalle}</div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={procesando}
            className="min-h-11 px-3 py-2 rounded-xl border border-border text-muted-foreground text-xs font-semibold hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
          >
            {textoCancelar}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={procesando}
            className={`min-h-11 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50 ${claseConfirmar}`}
          >
            {procesando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
