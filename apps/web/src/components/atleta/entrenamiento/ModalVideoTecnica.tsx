import type { RefObject } from 'react';
import { ExternalLink, Video, X } from 'lucide-react';
import { obtenerUrlVideoEmbebible } from '../../../lib/entrenamiento-video';

export interface ModalVideoTecnicaProps {
  video: { url: string; nombre: string };
  onClose: () => void;
  dialogRef: RefObject<HTMLDivElement | null>;
}

/**
 * WU3b (Escenario 1): modal de video demostrativo con cierre por Escape y foco accesible.
 * CANDIDATO (R3 duda): único uso de `obtenerUrlVideoEmbebible`; reusable si otra vista
 * muestra video. Se decide en fase D.
 */
export function ModalVideoTecnica({ video, onClose, dialogRef }: ModalVideoTecnicaProps) {
  const embedUrl = obtenerUrlVideoEmbebible(video.url);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-video-title"
        tabIndex={-1}
        className="p-5 rounded-3xl bg-card border border-border/80 shadow-2xl w-full max-w-2xl space-y-4"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/80 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 rounded-xl bg-primary/15 text-primary">
              <Video className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3
                id="modal-video-title"
                className="font-bold text-base text-foreground leading-tight"
              >
                Técnica del ejercicio
              </h3>
              <p className="text-[11px] text-muted-foreground truncate">
                {video.nombre}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar video demostrativo"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {embedUrl ? (
          <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black">
            <iframe
              src={embedUrl}
              title={`Video demostrativo: ${video.nombre}`}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-secondary/50 border border-border space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Este video no se puede reproducir embebido. Ábrelo en una pestaña nueva para
              revisar la técnica completa.
            </p>
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/25 hover:brightness-110 active:scale-95 transition-all"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Abrir video</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
