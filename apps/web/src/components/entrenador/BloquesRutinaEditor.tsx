/**
 * Módulo `bloques-rutina-editor` (Ola 2, prompt 74) · contenedor orquestador.
 *
 * Origen: `BloquesRutinaEditor.tsx` (830 líneas). Conserva su ruta, su export y su
 * API de props (R11): lo importan `components/entrenador/plantillas/ModalPlantilla.tsx`
 * y `use-plantillas-banco.ts` (tipo `DatosEjercicioNuevo`), que no se tocan. El
 * estado y las operaciones viven en `bloques-rutina-editor/useEditorBloques.ts` (R9:
 * mismo mecanismo controlado, sin TanStack Query); el JSX en las piezas
 * `bloques-rutina-editor/`; el filtrado y el resumen en `lib/bloques-rutina-editor-*`.
 *
 * Editor controlado de bloques de días con selectores estructurados (número de bloque,
 * día sugerido, anotación), pods de prescripción (series/reps/peso/RPE/descanso), notas
 * técnicas y picker del catálogo con búsqueda y estado "sin resultados".
 */
import { useId } from 'react';
import { EjercicioCatalogoDetalleDTO } from '@guachafit/shared';
import { DialogoConfirmacion } from '../common/DialogoConfirmacion';
import { ConfiguracionDia } from './bloques-rutina-editor/ConfiguracionDia';
import { PanelCatalogo } from './bloques-rutina-editor/PanelCatalogo';
import { PestanasDias } from './bloques-rutina-editor/PestanasDias';
import { PieResumen } from './bloques-rutina-editor/PieResumen';
import { TarjetaEjercicio } from './bloques-rutina-editor/TarjetaEjercicio';
import { useEditorBloques } from './bloques-rutina-editor/useEditorBloques';
import type { BloqueEdicion } from '../../lib/rutina-bloques';

export interface DatosEjercicioNuevo {
  nombre: string;
  grupoMuscular: string;
  patronMovimiento: string;
}

interface BloquesRutinaEditorProps {
  bloques: BloqueEdicion[];
  onCambiar: (bloques: BloqueEdicion[]) => void;
  catalogo: EjercicioCatalogoDetalleDTO[];
  /** Error de carga del catálogo (se muestra con acción de reintento en el picker). */
  catalogoError?: string | null;
  onReintentarCatalogo?: () => void;
  /** Alta rápida de ejercicio en el catálogo; devuelve null si falla. */
  onCrearEjercicio?: (datos: DatosEjercicioNuevo) => Promise<EjercicioCatalogoDetalleDTO | null>;
  /** RF-017 RN-01: muestra el campo de notas técnicas por ejercicio. */
  mostrarNotas?: boolean;
  /** Mínimo de días requerido (plantillas: 1). */
  minBloques?: number;
}

export function BloquesRutinaEditor({
  bloques,
  onCambiar,
  catalogo,
  catalogoError,
  onReintentarCatalogo,
  onCrearEjercicio,
  mostrarNotas = false,
  minBloques = 1,
}: BloquesRutinaEditorProps) {
  // C7: ids únicos para asociar cada etiqueta visible con su campo.
  const idBase = useId();

  const editor = useEditorBloques({ bloques, catalogo, onCambiar, onCrearEjercicio, minBloques });
  const {
    activeDiaIdx,
    setActiveDiaIdx,
    diaActivo,
    catalogoFiltrado,
    hayFiltro,
    totales,
    creacion,
    actualizarCreacion,
    confirmarBorrado,
    setConfirmarBorrado,
  } = editor;

  return (
    <div className="space-y-4">
      {/* Pestañas de días */}
      <PestanasDias
        bloques={bloques}
        indiceActivo={activeDiaIdx}
        onElegirDia={setActiveDiaIdx}
        onAgregarDia={editor.agregarDia}
      />

      {diaActivo && (
        <div className="space-y-4">
          {/* Configuración estructurada del día */}
          <ConfiguracionDia
            bloques={bloques}
            indiceActivo={activeDiaIdx}
            idBase={idBase}
            minBloques={minBloques}
            onCambiar={onCambiar}
            onPedirBorrarDia={() => setConfirmarBorrado({ tipo: 'dia', indice: activeDiaIdx })}
          />

          {/* Ejercicios del día activo */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-foreground block">
              Ejercicios de este día ({diaActivo.ejercicios.length}):
            </span>

            {diaActivo.ejercicios.length === 0 ? (
              <div className="p-4 rounded-xl bg-secondary/15 border border-dashed border-border text-center text-xs text-muted-foreground">
                Aún no has agregado ejercicios a este día. Elige uno de la lista de abajo.
              </div>
            ) : (
              <div className="space-y-2.5">
                {diaActivo.ejercicios.map((ej, ejIdx) => (
                  <TarjetaEjercicio
                    key={ej.id || ejIdx}
                    ejercicio={ej}
                    indice={ejIdx}
                    idBase={idBase}
                    mostrarNotas={mostrarNotas}
                    onActualizarCampo={(campo, valor) =>
                      editor.actualizarCampoEjercicio(ejIdx, campo, valor)
                    }
                    onCambiarSeries={(delta) => editor.handleStepSeries(ejIdx, delta)}
                    onPedirBorrar={() =>
                      setConfirmarBorrado({ tipo: 'ejercicio', indice: ejIdx })
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Picker del catálogo */}
          <PanelCatalogo
            ejercicios={catalogoFiltrado}
            hayFiltro={hayFiltro}
            filtroTexto={editor.filtro}
            grupo={editor.grupo}
            onCambiarGrupo={editor.setGrupo}
            onCambiarFiltro={editor.setFiltro}
            catalogoError={catalogoError}
            onReintentarCatalogo={onReintentarCatalogo}
            puedeCrear={Boolean(onCrearEjercicio)}
            creacion={creacion}
            onCambiarCreacionAbierta={(abierto) => actualizarCreacion({ abierto })}
            onCambiarCreacion={actualizarCreacion}
            onCrear={editor.handleCrearEjercicio}
            onAgregarEjercicio={editor.agregarEjercicio}
          />
        </div>
      )}

      <PieResumen resumen={totales} />

      {/* C4: confirmación antes de borrar un día o un ejercicio */}
      <DialogoConfirmacion
        abierto={confirmarBorrado !== null}
        idTitulo={`${idBase}-confirmar-borrado`}
        titulo={confirmarBorrado?.tipo === 'dia' ? '¿Eliminar este día?' : '¿Eliminar este ejercicio?'}
        detalle={
          confirmarBorrado?.tipo === 'dia'
            ? `Se quitará «${bloques[confirmarBorrado.indice]?.titulo ?? 'este día'}» con todos sus ejercicios.`
            : `Se quitará «${
                diaActivo?.ejercicios[confirmarBorrado?.indice ?? -1]?.nombre ?? 'este ejercicio'
              }» de este día.`
        }
        textoConfirmar="Sí, eliminar"
        variante="peligro"
        onCancelar={() => setConfirmarBorrado(null)}
        onConfirmar={() => {
          if (confirmarBorrado?.tipo === 'dia') editor.removerDia(confirmarBorrado.indice);
          else if (confirmarBorrado?.tipo === 'ejercicio')
            editor.removerEjercicio(confirmarBorrado.indice);
          setConfirmarBorrado(null);
        }}
      />
    </div>
  );
}
