/**
 * Subida del comprobante de pago en la vista `pagos` (fase B, prompt 54).
 *
 * Extraída tal cual desde `pages/atleta/PagosPage.tsx` (L882–944): input oculto,
 * zona punteada de adjuntar, preview con tamaño y botón de quitar.
 *
 * R1: vive en la carpeta de la vista. CANDIDATO (solapa R3.1 con Nutrición en
 * la validación MIME —`PagosPage:423–431` ↔ `NutricionPage:329–331`— y en el
 * `accept`; pero la forma difiere por vista, así que ante la duda es único y
 * la fase D decide).
 * Presentacional: el `input` se activa vía `inputRef` (prop del hook de estado);
 * validación y preview llegan por props.
 *
 * R5: conserva `accept="image/jpeg,image/png,image/webp"`, el `type="file"` y
 * los textos ("Toca para adjuntar foto o captura", "Listo para enviar").
 *
 * §6: `text-[11px]` (piso exacto), `font-bold` (700), validación honesta del
 * archivo antes de preparar la subida (vive en el hook), tokens con variante
 * claro/oscuro.
 */
import { useId, type ChangeEvent, type RefObject } from 'react';
import { Image as ImageIcon, Trash2, Upload } from 'lucide-react';

export interface SubidaComprobantePagoProps {
  inputRef: RefObject<HTMLInputElement | null>;
  selectedFile: File | null;
  previewUrl: string | null;
  onArchivo: (e: ChangeEvent<HTMLInputElement>) => void;
  onQuitar: () => void;
  errorArchivo?: string | null;
}

export function SubidaComprobantePago({
  inputRef,
  selectedFile,
  previewUrl,
  onArchivo,
  onQuitar,
  errorArchivo,
}: SubidaComprobantePagoProps) {
  const idAyuda = useId();

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
        <span>Captura del comprobante</span>
        <span className="text-[11px] text-muted-foreground">Recomendado · máx. 5 MB</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onArchivo}
        className="hidden"
      />

      {!selectedFile ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-describedby={idAyuda}
          className="w-full min-h-11 p-5 rounded-2xl border-2 border-dashed border-border/80 hover:border-primary/60 bg-secondary/20 hover:bg-secondary/40 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 text-center"
        >
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Upload className="h-5 w-5" aria-hidden="true" />
          </div>
          <p className="text-xs font-bold text-foreground">
            Toca para adjuntar foto o captura
          </p>
          <p id={idAyuda} className="text-[11px] text-muted-foreground">
            Captura de Pago Móvil, Zelle o Transferencia (JPG, PNG, WebP)
          </p>
        </button>
      ) : (
        <div className="p-3.5 rounded-2xl border border-primary/30 bg-primary/5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 overflow-hidden">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview comprobante"
                className="h-12 w-12 rounded-xl object-cover border border-border shrink-0"
              />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <ImageIcon className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground line-clamp-2 break-words">
                {selectedFile.name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {(selectedFile.size / 1024).toFixed(1)} KB • Listo para enviar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onQuitar}
            aria-label="Quitar comprobante"
            title="Quitar comprobante"
            className="min-h-11 min-w-11 p-2 rounded-xl hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors shrink-0 cursor-pointer flex items-center justify-center"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {errorArchivo && (
        <p role="alert" className="text-xs font-semibold text-destructive">
          {errorArchivo}
        </p>
      )}
    </div>
  );
}
