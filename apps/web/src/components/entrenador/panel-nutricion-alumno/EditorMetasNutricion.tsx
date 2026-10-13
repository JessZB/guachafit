/**
 * Editor de metas nutricionales del panel del entrenador (Ola 2).
 *
 * Recorte verbatim de `PanelNutricionAlumno.tsx`: diálogo accesible con los
 * campos de metas, los recursos educativos (enlace o PDF) y los avisos del
 * formulario. Presentacional (R1): recibe el formulario y callbacks, no pide
 * datos. El estado y el guardado viven en `use-editor-metas-nutricion`.
 */
import type { FormEvent, RefObject } from 'react';
import { CampoMeta } from '../CampoMeta';
import { FilaRecursoEditor } from '../FilaRecursoEditor';
import { AvisosEditorMetas } from '../AvisosEditorMetas';
import {
  esFilaRecursoVacia,
  LIMITE_RECURSOS_EDUCATIVOS,
  type FilaRecursoFormulario,
} from '../../../lib/recursos-pdf';
import { Loader2, Plus, X } from 'lucide-react';

export function EditorMetasNutricion({
  dialogoRef,
  calorias,
  proteina,
  carbohidratos,
  grasas,
  agua,
  onCambiarCalorias,
  onCambiarProteina,
  onCambiarCarbohidratos,
  onCambiarGrasas,
  onCambiarAgua,
  recursos,
  onAnadirRecurso,
  onCambiarRecurso,
  onQuitarRecurso,
  onSubirPdf,
  error,
  exito,
  guardando,
  onCerrar,
  onGuardar,
}: {
  dialogoRef: RefObject<HTMLDivElement | null>;
  calorias: string;
  proteina: string;
  carbohidratos: string;
  grasas: string;
  agua: string;
  onCambiarCalorias: (valor: string) => void;
  onCambiarProteina: (valor: string) => void;
  onCambiarCarbohidratos: (valor: string) => void;
  onCambiarGrasas: (valor: string) => void;
  onCambiarAgua: (valor: string) => void;
  recursos: FilaRecursoFormulario[];
  onAnadirRecurso: () => void;
  onCambiarRecurso: (indice: number, cambios: Partial<FilaRecursoFormulario>) => void;
  onQuitarRecurso: (indice: number) => void;
  onSubirPdf: (indice: number, archivo: File | undefined) => void;
  error: string | null;
  exito: string | null;
  guardando: boolean;
  onCerrar: () => void;
  onGuardar: (e: FormEvent) => void;
}) {
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-metas-nutricion-titulo"
        tabIndex={-1}
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-3xl bg-card border border-border shadow-2xl p-5 space-y-4 focus:outline-hidden"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-3">
          <div>
            <h3 id="editor-metas-nutricion-titulo" className="font-bold text-base text-foreground">
              Metas nutricionales
            </h3>
            <p className="text-xs text-muted-foreground">
              Deja un campo vacío si no quieres fijar esa meta (no se guarda como 0).
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar editor de metas"
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-secondary text-foreground hover:bg-secondary/80 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onGuardar} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <CampoMeta id="meta-calorias" etiqueta="Calorías (kcal)" valor={calorias} onChange={onCambiarCalorias} placeholder="2200" />
            <CampoMeta id="meta-proteina" etiqueta="Proteína (g)" valor={proteina} onChange={onCambiarProteina} placeholder="160" />
            <CampoMeta
              id="meta-carbohidratos"
              etiqueta="Carbohidratos (g)"
              valor={carbohidratos}
              onChange={onCambiarCarbohidratos}
              placeholder="220"
            />
            <CampoMeta id="meta-grasas" etiqueta="Grasas (g)" valor={grasas} onChange={onCambiarGrasas} placeholder="70" />
            <CampoMeta id="meta-agua" etiqueta="Agua (L)" valor={agua} onChange={onCambiarAgua} placeholder="3.00" decimal />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-foreground">Recursos educativos</span>
              <button
                type="button"
                disabled={
                  recursos.length >= LIMITE_RECURSOS_EDUCATIVOS ||
                  recursos.some((recurso) => esFilaRecursoVacia(recurso))
                }
                onClick={onAnadirRecurso}
                className="min-h-11 px-3 rounded-xl bg-secondary border border-border text-foreground text-xs font-bold hover:bg-secondary/70 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Añadir recurso</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Pega un enlace externo o sube un PDF (lista de compras, distribución de comidas).
              Los PDFs se guardan en el espacio privado del alumno (máx. 10 recursos).
            </p>

            {recursos.map((recurso, indice) => (
              <FilaRecursoEditor
                key={indice}
                indice={indice}
                recurso={recurso}
                onCambiar={(cambios) => onCambiarRecurso(indice, cambios)}
                onQuitar={() => onQuitarRecurso(indice)}
                onSubirPdf={(archivo) => onSubirPdf(indice, archivo)}
              />
            ))}
          </div>

          <AvisosEditorMetas error={error} exito={exito} />

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCerrar}
              className="min-h-11 px-4 rounded-xl bg-secondary border border-border text-foreground text-xs font-bold hover:bg-secondary/70 cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="min-h-11 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{guardando ? 'Guardando…' : 'Guardar metas'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
