/**
 * Visor de comprobante de pago (fase B, prompt 54).
 *
 * Extraído desde `pages/atleta/PagosPage.tsx` (L1171–1251): overlay + diálogo
 * accesible (U3b: `role="dialog"`, Escape, trampa de Tab y restore del foco vía
 * `useDialogoAccesible`), marco de imagen con placeholder honesto sin URL y
 * nota de almacenamiento R2 en el pie.
 *
 * R1: REUTILIZABLE (R3.1: `PagosPage:1198–1228` ↔ `ConciliacionPage:693–736`;
 * comparten fallback demo y placeholders honestos; la fase D decide la
 * promoción a `common/`). Presentacional: props tipadas y `onCerrar`; el único
 * estado local es el error de carga de la imagen, que se reinicia con cada URL
 * (igual que el `setComprobanteImgError(false)` al abrir de la página).
 *
 * §6: diálogo real (no solo overlay), placeholders honestos N2 (en sesión real
 * jamás una imagen stock como comprobante propio; la foto stock SOLO vive con
 * `isDemoMode`), `text-[11px]` (piso exacto), `font-bold` (700).
 */
import { useEffect, useState } from 'react';
import { Image as ImageIcon, Receipt, ShieldCheck, X } from 'lucide-react';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';
import { CLASES_SALIDA_MODAL, useSalidaModal } from '../../../lib/use-salida-modal';
import { COMPROBANTE_DEMO_URL } from '../../../lib/pagos-adaptadores';

export interface ComprobantePagoVisible {
  url: string | null;
}

export interface ModalComprobantePagoProps {
  /** `null` = visor cerrado (el componente queda montado y devuelve `null`). */
  comprobante: ComprobantePagoVisible | null;
  isDemoMode: boolean;
  onCerrar: () => void;
}

export function ModalComprobantePago({
  comprobante,
  isDemoMode,
  onCerrar,
}: ModalComprobantePagoProps) {
  // U3b: el visor es un diálogo real (Escape, trampa de Tab, restore del foco).
  const { saliendo, cerrar } = useSalidaModal(onCerrar);
  const refDialogo = useDialogoAccesible({
    abierto: comprobante !== null,
    onCerrar: cerrar,
  });
  const [imagenError, setImagenError] = useState(false);

  // Cada comprobante (o el cierre) reinicia el error de imagen, como el reset
  // explícito al abrir que hacía la página.
  useEffect(() => {
    setImagenError(false);
  }, [comprobante?.url]);

  if (!comprobante) return null;

  return (
    <div
      data-saliendo={saliendo || undefined}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md animate-in fade-in duration-200 ${CLASES_SALIDA_MODAL}`}
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pagos-comprobante-titulo"
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-lg space-y-4 max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            <h3 id="pagos-comprobante-titulo" className="font-bold text-base text-foreground">
              Comprobante de pago
            </h3>
          </div>
          <button
            onClick={cerrar}
            aria-label="Cerrar comprobante de pago"
            className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto rounded-2xl border border-border bg-black/40 flex items-center justify-center min-h-[260px] p-2">
          {comprobante.url && !imagenError ? (
            <img
              src={comprobante.url}
              alt="Comprobante bancario"
              className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-md"
              onError={() => setImagenError(true)}
            />
          ) : isDemoMode && !comprobante.url ? (
            // N2: la foto stock SOLO vive en modo demo explícito.
            <img
              src={COMPROBANTE_DEMO_URL}
              alt="Comprobante bancario (demostración)"
              className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-md opacity-80"
            />
          ) : (
            // N2: en sesión real nunca se muestra una imagen ajena como comprobante propio.
            <div className="text-center space-y-2 px-6">
              <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/60" />
              <p className="text-sm font-bold text-foreground">
                {comprobante.url
                  ? 'No se pudo cargar la imagen del comprobante'
                  : 'Sin comprobante disponible'}
              </p>
              <p className="text-[11px] text-muted-foreground max-w-xs">
                {comprobante.url
                  ? 'El enlace temporal de lectura falló o expiró. Cierra el visor e inténtalo de nuevo.'
                  : 'No pudimos mostrar la imagen de este comprobante en este momento.'}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            {comprobante.url ? (
              <>
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                Almacenamiento seguro
              </>
            ) : (
              'Sin captura digital verificable'
            )}
          </span>
          <button
            onClick={cerrar}
            className="py-2 px-4 rounded-xl bg-secondary text-foreground text-xs font-bold hover:bg-secondary/80 transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
