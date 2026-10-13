/**
 * Alumno routine editor body: thin adapter over the shared `bloques-rutina-editor/`
 * pieces (convergence 76, BLOCKER-51-1).
 *
 * Same observable copy as the original body (spec-pinned texts travel through the
 * copy-variant props: `Añadir Día`, `Número de Bloque / Día`, `Ejercicios
 * Asignados a este Día (N):`, `Buscar en catálogo...`, `Crear y Asignar a este
 * Día`, plain `Añadir` row buttons). Data mechanism untouched (R9): all state
 * and persistence stay in `use-rutina-alumno` (PUT payload, WU5/D4/C4/D7).
 * The modal shell, footer and confirm dialog stay in `ModalRutinaSemanal`.
 *
 * §6: 11px minimum, weights ≤ 700, tokens with dark variant.
 */
import { PestanasDias } from '../bloques-rutina-editor/PestanasDias';
import { ConfiguracionDia } from '../bloques-rutina-editor/ConfiguracionDia';
import { TarjetaEjercicio } from '../bloques-rutina-editor/TarjetaEjercicio';
import { PanelCatalogo } from '../bloques-rutina-editor/PanelCatalogo';
import type { RetornoRutinaAlumno } from './use-rutina-alumno';

interface ContenidoRutinaSemanalProps {
  rutina: RetornoRutinaAlumno;
}

export function ContenidoRutinaSemanal({ rutina }: ContenidoRutinaSemanalProps) {
  const {
    bloquesRutinaEdit,
    setBloquesRutinaEdit,
    activeDiaIdx,
    setActiveDiaIdx,
    setEditingEjNombreIdx,
    setConfirmarBorradoRutina,
    actualizarCampoEjercicio,
    cambiarSeriesEjercicio,
    agregarNuevoDiaRutina,
    catalogoFiltrado,
    hayFiltroCatalogo,
    selectedGrupoMuscular,
    setSelectedGrupoMuscular,
    filtroBusquedaEj,
    setFiltroBusquedaEj,
    isCrearEjRapidoOpen,
    setIsCrearEjRapidoOpen,
    nuevoEjNombre,
    setNuevoEjNombre,
    nuevoEjGrupo,
    setNuevoEjGrupo,
    nuevoEjPatron,
    setNuevoEjPatron,
    isSubmittingEj,
    handleCrearEjercicioRapido,
    agregarEjercicioADia,
  } = rutina;

  const diaActivo = bloquesRutinaEdit[activeDiaIdx];

  return (
    <>
      {/* Pestañas de Días de la Rutina */}
      <PestanasDias
        bloques={bloquesRutinaEdit}
        indiceActivo={activeDiaIdx}
        onElegirDia={(idx) => {
          setActiveDiaIdx(idx);
          setEditingEjNombreIdx(null);
        }}
        onAgregarDia={agregarNuevoDiaRutina}
        addDayLabel="Añadir Día"
      />

      {/* Configuración del Día Activo + Ejercicios */}
      {diaActivo && (
        <div className="space-y-4">
          <ConfiguracionDia
            bloques={bloquesRutinaEdit}
            indiceActivo={activeDiaIdx}
            idBase="rutina"
            minBloques={1}
            onCambiar={setBloquesRutinaEdit}
            onPedirBorrarDia={() =>
              setConfirmarBorradoRutina({ tipo: 'dia', indice: activeDiaIdx })
            }
            dayNumberLabel="Número de Bloque / Día"
            suggestedDayLabel="Día Sugerido (Calendario)"
            annotationLabel="Anotaciones en el Título"
            annotationHint="Se añade al título tras el día seleccionado para evitar errores manuales."
            focusLabel="Enfoque o Indicaciones (Opcional)"
            previewLabel="🏷️ Título generado:"
          />

          {/* Lista de Ejercicios del Día Activo */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-foreground block">
              Ejercicios Asignados a este Día ({diaActivo.ejercicios.length}):
            </span>

            {diaActivo.ejercicios.length === 0 ? (
              <div className="p-4 rounded-xl bg-secondary/15 border border-dashed border-border text-center text-xs text-muted-foreground">
                Aún no has agregado ejercicios a este bloque. Elige uno del catálogo abajo.
              </div>
            ) : (
              <div className="space-y-2.5">
                {diaActivo.ejercicios.map((ej, ejIdx) => (
                  <TarjetaEjercicio
                    key={ej.id || ejIdx}
                    ejercicio={ej}
                    indice={ejIdx}
                    idBase="rutina"
                    mostrarNotas={false}
                    onActualizarCampo={(campo, valor) =>
                      actualizarCampoEjercicio(ejIdx, campo, valor)
                    }
                    onCambiarSeries={(delta) => cambiarSeriesEjercicio(ejIdx, delta)}
                    onPedirBorrar={() =>
                      setConfirmarBorradoRutina({ tipo: 'ejercicio', indice: ejIdx })
                    }
                    editNameTitle="Editar o personalizar nombre del ejercicio"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sección: Añadir Ejercicio desde Catálogo con Filtro & Creación Rápida */}
          <PanelCatalogo
            ejercicios={catalogoFiltrado}
            hayFiltro={hayFiltroCatalogo}
            filtroTexto={filtroBusquedaEj}
            grupo={selectedGrupoMuscular}
            onCambiarGrupo={setSelectedGrupoMuscular}
            onCambiarFiltro={setFiltroBusquedaEj}
            puedeCrear
            creacion={{
              abierto: isCrearEjRapidoOpen,
              nombre: nuevoEjNombre,
              grupo: nuevoEjGrupo,
              patron: nuevoEjPatron,
              enCurso: isSubmittingEj,
              // Creation failures keep surfacing at modal level (rutinaErrorMsg),
              // exactly as before: no local error here.
              error: null,
            }}
            onCambiarCreacionAbierta={setIsCrearEjRapidoOpen}
            onCambiarCreacion={(cambios) => {
              if (cambios.abierto !== undefined) setIsCrearEjRapidoOpen(cambios.abierto);
              if (cambios.nombre !== undefined) setNuevoEjNombre(cambios.nombre);
              if (cambios.grupo !== undefined) setNuevoEjGrupo(cambios.grupo);
              if (cambios.patron !== undefined) setNuevoEjPatron(cambios.patron);
            }}
            onCrear={handleCrearEjercicioRapido}
            onAgregarEjercicio={agregarEjercicioADia}
            sectionTitle="Añadir Ejercicio desde Catálogo"
            createToggleLabel="Crear Ejercicio Nuevo"
            hideCreatorLabel="Ocultar Creador Rápido"
            createFormTitle="Nuevo Ejercicio en Catálogo"
            submitButtonLabel="Crear y Asignar a este Día"
            searchPlaceholder="Buscar en catálogo..."
            emptyCreateLabel="Crear Ejercicio Nuevo"
            addButtonAccessibleName="Añadir"
          />
        </div>
      )}
    </>
  );
}
