/**
 * Sección RN-01 del panel de nutrición del alumno (Ola 2).
 *
 * Recorte verbatim de `PanelNutricionAlumno.tsx`: cabecera con el botón del
 * editor (bloqueado hasta conocer las metas guardadas), estados honestos de
 * carga/error/vacío, grilla de objetivos y recursos educativos. Presentacional
 * (R1): recibe props y callbacks, no pide datos.
 */
import { metasConfiguradas, resumenMetas } from '../../../lib/nutricion-metas';
import type { EstadoEdicionMetas } from '../../../lib/editor-metas-nutricion';
import type { MetasNutricionalesDetalleDTO } from '@guachafit/shared';
import { AlertTriangle, ExternalLink, FileText, Loader2, Pencil, Target } from 'lucide-react';

export function SeccionMetasNutricion({
  alumnoNombre,
  metas,
  edicionMetas,
  isCargandoMetas,
  metasError,
  onAbrirEditor,
  onReintentarMetas,
}: {
  alumnoNombre?: string | null;
  metas: MetasNutricionalesDetalleDTO | null;
  edicionMetas: EstadoEdicionMetas;
  isCargandoMetas: boolean;
  metasError: string | null;
  onAbrirEditor: () => void;
  onReintentarMetas: () => void;
}) {
  const recursosVisibles = metas?.recursos ?? [];
  const objetivos = resumenMetas(metas);

  return (
    <section className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
      <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm text-foreground">
            Metas nutricionales{alumnoNombre ? ` de ${alumnoNombre}` : ''}
          </h3>
        </div>
        <button
          type="button"
          onClick={onAbrirEditor}
          disabled={!edicionMetas.habilitado}
          aria-describedby={edicionMetas.habilitado ? undefined : 'metas-edicion-motivo'}
          className="shrink-0 min-h-11 px-3 rounded-xl bg-secondary border border-border text-foreground text-xs font-bold hover:bg-secondary/70 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center gap-1.5"
        >
          <Pencil className="h-3.5 w-3.5" />
          <span>{metasConfiguradas(metas) ? 'Editar metas' : 'Definir metas'}</span>
        </button>
      </div>

      {!edicionMetas.habilitado && (
        <p id="metas-edicion-motivo" className="text-xs text-muted-foreground">
          {edicionMetas.motivo}
        </p>
      )}

      {isCargandoMetas && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando metas…
        </p>
      )}

      {metasError && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-destructive/10 border border-destructive/25">
          <p role="alert" className="text-xs text-destructive font-semibold">{metasError}</p>
          <button
            type="button"
            onClick={onReintentarMetas}
            className="shrink-0 min-h-11 px-3 rounded-xl bg-secondary text-foreground text-xs font-bold hover:bg-secondary/80 cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {!isCargandoMetas && !metasError && !metasConfiguradas(metas) && (
        <p className="text-xs text-muted-foreground">
          Sin metas configuradas. Define calorías, macros, agua o recursos para que el alumno vea
          sus objetivos y su reporte se compare contra ellos.
        </p>
      )}

      {!metasError && objetivos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {objetivos.map((objetivo) => (
            <div key={objetivo.etiqueta} className="p-3 rounded-2xl bg-secondary/40 border border-border">
              <span className="block text-xs font-semibold uppercase text-muted-foreground">
                {objetivo.etiqueta}
              </span>
              <p className="text-base font-bold font-mono text-foreground mt-0.5">{objetivo.valor}</p>
            </div>
          ))}
        </div>
      )}

      {!metasError && recursosVisibles.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            Recursos educativos
          </span>
          <ul className="space-y-1.5">
            {recursosVisibles.map((recurso) => (
              <li key={recurso.storageKey ?? recurso.url ?? recurso.titulo}>
                {recurso.url ? (
                  <a
                    href={recurso.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-11 text-xs font-bold text-primary hover:underline"
                  >
                    {recurso.storageKey ? (
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>{recurso.titulo}</span>
                    {recurso.storageKey && (
                      <span className="text-xs font-bold uppercase text-muted-foreground">PDF</span>
                    )}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 min-h-11 text-xs font-semibold text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                    <span>{recurso.titulo} · no pudimos generar el enlace del archivo</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
