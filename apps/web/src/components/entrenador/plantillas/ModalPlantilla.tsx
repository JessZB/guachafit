/**
 * M8 plantillas (fase B, prompt 58) · modal crear/editar plantilla.
 *
 * Origen: `PlantillasPage.tsx:818-1012`. Componente único + CANDIDATO a
 * `ModalBase` en D (overlay/panel idéntico en 4+ superficies; fila 7 de la
 * consolidación 48: POSPUESTA a propósito, el overlay ya consolidado vive en
 * `DialogoConfirmacion`). Solo props y callbacks (R1): sin `useQuery` ni
 * `api-client` (los datos entran por el hook `use-formulario-plantilla`).
 * Conserva `role="dialog"`, labels, `role="alert"`/`role="status"`, textos de
 * guardado y la confirmación "¿Salir sin guardar?" que usan los specs (R5),
 * más el remonte por `editorKey`, el `fieldset` bloqueado y el foco inicial
 * en el nombre (`autoFocus` + `enfocarAlAbrir: false`).
 *
 * §6: español claro, `pluralizar` en el pie, controles 44px, piso 11px,
 * tokens con variante claro/oscuro, peso ≤ 700, Escape/foco/restore vía
 * `useDialogoAccesible`.
 */
import { AlertCircle, CheckCircle2, ClipboardList, X } from 'lucide-react';
import {
  NivelObjetivoPlantilla,
  type EjercicioCatalogoDetalleDTO,
  type PlantillaRutinaDTO,
} from '@guachafit/shared';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';
import { CLASES_SALIDA_MODAL, useSalidaModal } from '../../../lib/use-salida-modal';
import type { BloqueEdicion } from '../../../lib/rutina-bloques';
import { DialogoConfirmacion } from '../../common/DialogoConfirmacion';
import { BloquesRutinaEditor, type DatosEjercicioNuevo } from '../BloquesRutinaEditor';
import { IdentidadPlantilla } from './IdentidadPlantilla';
import { PieModalPlantilla } from './PieModalPlantilla';

export interface ResumenEditorPlantilla {
  totalDias: number;
  totalEjercicios: number;
  totalSeries: number;
}

export interface ModalPlantillaProps {
  editando: PlantillaRutinaDTO | null;
  formNombre: string;
  onCambiarNombre: (valor: string) => void;
  formNivel: NivelObjetivoPlantilla;
  onCambiarNivel: (nivel: NivelObjetivoPlantilla) => void;
  bloquesEdit: BloqueEdicion[];
  onCambiarBloques: (bloques: BloqueEdicion[]) => void;
  editorKey: number;
  catalogo: EjercicioCatalogoDetalleDTO[];
  catalogoError: string | null;
  onReintentarCatalogo: () => void;
  onCrearEjercicio: (datos: DatosEjercicioNuevo) => Promise<EjercicioCatalogoDetalleDTO | null>;
  nombreError: string | null;
  mostrarNombreError: boolean;
  saveSuccess: string | null;
  saveError: string | null;
  isSaving: boolean;
  isOnline: boolean;
  isDemoMode: boolean;
  resumenEditor: ResumenEditorPlantilla;
  confirmandoCierre: boolean;
  onGuardar: () => void;
  onCerrar: () => void;
  onSeguirEditando: () => void;
  onSalirSinGuardar: () => void;
}

export function ModalPlantilla({
  editando,
  formNombre,
  onCambiarNombre,
  formNivel,
  onCambiarNivel,
  bloquesEdit,
  onCambiarBloques,
  editorKey,
  catalogo,
  catalogoError,
  onReintentarCatalogo,
  onCrearEjercicio,
  nombreError,
  mostrarNombreError,
  saveSuccess,
  saveError,
  isSaving,
  isOnline,
  isDemoMode,
  resumenEditor,
  confirmandoCierre,
  onGuardar,
  onCerrar,
  onSeguirEditando,
  onSalirSinGuardar,
}: ModalPlantillaProps) {
  // U3b: Escape, trampa de Tab y restore del foco; el foco inicial sigue en el nombre
  // (`autoFocus` del formulario), por eso el hook no lo reasigna.
  const refModalPlantilla = useDialogoAccesible({
    abierto: true,
    onCerrar,
    enfocarAlAbrir: false,
  });

  const guardadoBloqueado = !isOnline && !isDemoMode;

  // `onCerrar` es la decisión del padre (puede abrir la confirmación en vez de cerrar), así que
  // solo la salida que de verdad cierra («Salir sin guardar») se anima.
  const { saliendo, cerrar: salirAnimado } = useSalidaModal(onSalirSinGuardar);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      data-saliendo={saliendo || undefined}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200 ${CLASES_SALIDA_MODAL}`}
    >
      <div
        ref={refModalPlantilla}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-plantilla-title"
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-4xl space-y-5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <div>
              <h3 id="modal-plantilla-title" className="font-bold text-base text-foreground">
                {editando ? 'Editar plantilla' : 'Nueva plantilla de rutina'}
              </h3>
              <p className="text-xs text-muted-foreground">
                Estructura los días, los ejercicios y sus cargas. Podrás reutilizarla con cualquier
                alumno.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
            title="Cerrar"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {saveSuccess && (
          <div
            role="status"
            aria-live="polite"
            className="p-3 rounded-2xl bg-success/10 border border-success/30 text-success text-xs flex items-start gap-2"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="block font-bold">{saveSuccess}</span>
              <span className="block text-[11px] text-success/80">
                Puedes seguir ajustando la plantilla o cerrar este panel cuando quieras.
              </span>
            </div>
          </div>
        )}

        {/* Mientras se guarda, el formulario queda bloqueado: lo que ves es lo que se envía. */}
        <fieldset
          disabled={isSaving}
          aria-busy={isSaving}
          className="min-w-0 m-0 p-0 border-0 space-y-5 disabled:opacity-70"
        >
        <legend className="sr-only">Datos de la plantilla</legend>
        {/* Identidad de la plantilla */}
        <IdentidadPlantilla
          formNombre={formNombre}
          onCambiarNombre={onCambiarNombre}
          formNivel={formNivel}
          onCambiarNivel={onCambiarNivel}
          nombreError={nombreError}
          mostrarNombreError={mostrarNombreError}
        />

        <BloquesRutinaEditor
          key={editorKey}
          bloques={bloquesEdit}
          onCambiar={onCambiarBloques}
          catalogo={catalogo}
          catalogoError={catalogoError}
          onReintentarCatalogo={onReintentarCatalogo}
          onCrearEjercicio={onCrearEjercicio}
          mostrarNotas
          minBloques={1}
        />
        </fieldset>

        {saveError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        <PieModalPlantilla
          resumenEditor={resumenEditor}
          isSaving={isSaving}
          guardadoBloqueado={guardadoBloqueado}
          editando={Boolean(editando)}
          onGuardar={onGuardar}
          onCerrar={onCerrar}
        />
      </div>

      {/* C4: aviso de cambios sin guardar al cerrar el panel de la plantilla */}
      <DialogoConfirmacion
        abierto={confirmandoCierre}
        idTitulo="plantilla-confirmar-cierre"
        titulo="¿Salir sin guardar?"
        detalle="Tienes cambios sin guardar en esta plantilla. Si sales ahora, se perderán."
        textoConfirmar="Salir sin guardar"
        textoCancelar="Seguir editando"
        variante="peligro"
        onCancelar={onSeguirEditando}
        onConfirmar={salirAnimado}
      />
    </div>
  );
}

