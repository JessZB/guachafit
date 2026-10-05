/** RF-002 RN-01: fila editable de un recurso educativo (enlace externo o PDF) del editor de metas. */
import { ExternalLink, FileText, FileUp, Loader2, Trash2 } from 'lucide-react';
import type { FilaRecursoFormulario } from '../../lib/recursos-pdf';

/** Fila editable de un recurso educativo: título + enlace externo o PDF subido. */
export function FilaRecursoEditor({
  indice,
  recurso,
  onCambiar,
  onQuitar,
  onSubirPdf,
}: {
  indice: number;
  recurso: FilaRecursoFormulario;
  onCambiar: (cambios: Partial<FilaRecursoFormulario>) => void;
  onQuitar: () => void;
  onSubirPdf: (archivo: File | undefined) => void;
}) {
  const idTitulo = `recurso-${indice}-titulo`;
  const idUrl = `recurso-${indice}-url`;
  const numero = indice + 1;

  return (
    <div className="rounded-2xl border border-border bg-secondary/20 p-2.5 space-y-2">
      <div className="space-y-1">
        <label htmlFor={idTitulo} className="text-xs font-semibold text-muted-foreground">
          Título del recurso {numero}
        </label>
        <div className="flex gap-2">
          <input
            id={idTitulo}
            type="text"
            value={recurso.titulo}
            onChange={(e) => onCambiar({ titulo: e.target.value })}
            placeholder="Ej. Lista de compras"
            className="w-full min-h-11 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
          />
          <button
            type="button"
            onClick={onQuitar}
            aria-label={`Quitar recurso ${numero}`}
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {recurso.storageKey ? (
        <div className="flex flex-wrap items-center gap-2 min-h-11">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success bg-success/10 border border-success/25 rounded-full px-2.5 py-1">
            <FileText className="h-3.5 w-3.5" />
            {recurso.nombreArchivo ?? 'PDF guardado en el espacio privado del alumno'}
          </span>
          {recurso.url ? (
            <a
              href={recurso.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 min-h-11 text-xs font-bold text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Ver PDF</span>
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">Vista previa disponible al guardar</span>
          )}
          <button
            type="button"
            onClick={() => onCambiar({ storageKey: '', nombreArchivo: null, url: '', errorSubida: null })}
            className="min-h-11 px-3 rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 text-xs font-bold transition-colors cursor-pointer"
          >
            Quitar archivo
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          <label htmlFor={idUrl} className="text-xs font-semibold text-muted-foreground">
            Enlace externo del recurso {numero}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id={idUrl}
              type="url"
              value={recurso.url}
              onChange={(e) => onCambiar({ url: e.target.value })}
              placeholder="https://…"
              className="w-full min-h-11 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
            />
            <label
              className={`shrink-0 min-h-11 px-3 rounded-xl border border-border text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                recurso.subiendo
                  ? 'opacity-60 cursor-wait bg-secondary'
                  : 'bg-secondary hover:bg-secondary/70 text-foreground'
              }`}
            >
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                disabled={recurso.subiendo}
                onChange={(e) => {
                  const archivo = e.target.files?.[0];
                  e.target.value = '';
                  onSubirPdf(archivo);
                }}
              />
              {recurso.subiendo ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileUp className="h-3.5 w-3.5" />
              )}
              <span>{recurso.subiendo ? 'Subiendo…' : 'Subir PDF'}</span>
            </label>
          </div>
        </div>
      )}

      {recurso.subiendo && (
        <p role="status" className="text-xs font-semibold text-muted-foreground">
          Subiendo el PDF al espacio privado del alumno…
        </p>
      )}
      {recurso.errorSubida && (
        <p
          role="alert"
          className="text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/25 rounded-xl px-2.5 py-1.5"
        >
          {recurso.errorSubida}
        </p>
      )}
    </div>
  );
}
