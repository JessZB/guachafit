/**
 * Modal de prescripción / edición de la rutina semanal del alumno (contenedor de modal ÚNICO).
 *
 * Shell: overlay, header, aviso de éxito, cuerpo del editor, error, footer de acciones y
 * confirmación de borrado (C4). El cuerpo vive en `ContenidoRutinaSemanal` (adaptador
 * sobre las piezas compartidas de `bloques-rutina-editor/`, convergencia 76,
 * BLOCKER-51-1 RESUELTO): sin copias locales de editor ni de catálogo.
 *
 * Conserva idénticos `Asignar & Editar Rutina Semanal` (`role="dialog"` + `aria-modal`),
 * `Cerrar`, `Guardar planificación activa`, `N días configurados` y los diálogos
 * `¿Eliminar este día?` / `¿Eliminar este ejercicio?` (`Sí, eliminar`) que fijan los specs.
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura, estados honestos.
 */
import { useRef } from 'react';
import { AlertCircle, CheckCircle2, Dumbbell, X } from 'lucide-react';
import { pluralizar } from '../../../lib/pluralizar';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';
import { CLASES_SALIDA_MODAL, useSalidaModal } from '../../../lib/use-salida-modal';
import { DialogoConfirmacion } from '../../common/DialogoConfirmacion';
import { ContenidoRutinaSemanal } from './ContenidoRutinaSemanal';
import type { RetornoRutinaAlumno } from './use-rutina-alumno';

export interface ModalRutinaSemanalProps {
  rutina: RetornoRutinaAlumno;
  alumno: { id: string } | null;
  /** D7: sin conexión no se puede guardar la rutina (se avisa en el botón). */
  hayConexion: boolean;
  demo: boolean;
  onCerrar: () => void;
  onCerrarYLiberarExito: () => void;
}

export function ModalRutinaSemanal({
  rutina,
  alumno,
  hayConexion,
  demo,
  onCerrar,
  onCerrarYLiberarExito,
}: ModalRutinaSemanalProps) {
  const {
    bloquesRutinaEdit,
    activeDiaIdx,
    rutinaSuccessMsg,
    isSavingRutina,
    rutinaErrorMsg,
    confirmarBorradoRutina,
    setConfirmarBorradoRutina,
    removerDiaRutina,
    removerEjercicioDeDia,
    guardarRutinaPrescrita,
  } = rutina;

  // El botón «Cerrar» además libera el aviso de éxito: marca la variante y se resuelve al cerrar.
  const liberarExitoRef = useRef(false);
  const { saliendo, cerrar } = useSalidaModal(() => {
    const liberar = liberarExitoRef.current;
    liberarExitoRef.current = false;
    if (liberar) onCerrarYLiberarExito();
    else onCerrar();
  });
  // Escape y la trampa de foco pasan por `cerrar` (rama ordinaria: `liberarExitoRef` queda en false).
  const refDialogo = useDialogoAccesible({ abierto: true, onCerrar: cerrar });
  const cerrarLiberandoExito = () => {
    liberarExitoRef.current = true;
    cerrar();
  };

  return (
    <>
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) cerrar();
        }}
        data-saliendo={saliendo || undefined}
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200 ${CLASES_SALIDA_MODAL}`}
      >
        <div
          ref={refDialogo}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-rutina-title"
          tabIndex={-1}
          className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-3xl space-y-5 max-h-[90vh] overflow-y-auto"
        >
          {/* Header del modal */}
          <div className="flex items-center justify-between border-b border-border/80 pb-3">
            <div className="flex items-center gap-2">
              <Dumbbell className="h-5 w-5 text-primary" />
              <div>
                <h3 id="modal-rutina-title" className="font-bold text-base text-foreground">
                  Asignar & Editar Rutina Semanal
                </h3>
                <p className="text-xs text-muted-foreground">
                  Estructura los bloques de entrenamiento y asigna ejercicios del catálogo.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar asignación de rutina"
              className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {rutinaSuccessMsg && (
            <div
              role="status"
              aria-live="polite"
              className="p-3 rounded-2xl bg-success/10 border border-success/30 text-success text-xs flex items-start gap-2"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="block font-bold">{rutinaSuccessMsg}</span>
                <span className="block text-[11px] text-success/80">
                  Puedes seguir ajustando el plan o cerrar este panel cuando quieras.
                </span>
              </div>
            </div>
          )}

          {/* Pestañas de Días + Configuración + Ejercicios + Catálogo */}
          <ContenidoRutinaSemanal rutina={rutina} />

          {rutinaErrorMsg && (
            <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{rutinaErrorMsg}</span>
            </div>
          )}

          {/* Footer de Acciones del Modal */}
          <div className="pt-3 border-t border-border/80 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {pluralizar(bloquesRutinaEdit.length, 'día configurado', 'días configurados')}
            </span>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={isSavingRutina}
                onClick={cerrarLiberandoExito}
                className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs cursor-pointer disabled:opacity-50"
              >
                Cerrar
              </button>
              <button
                type="button"
                disabled={isSavingRutina || (!hayConexion && !demo)}
                onClick={() => guardarRutinaPrescrita(alumno)}
                className="min-h-11 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSavingRutina ? (
                  <>
                    <div className="h-3 w-3 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                    <span>Guardando...</span>
                  </>
                ) : !hayConexion && !demo ? (
                  <span>Necesitas internet para guardar</span>
                ) : (
                  <span>Guardar planificación activa</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* C4: confirmación antes de borrar un día o un ejercicio de la rutina en edición */}
      <DialogoConfirmacion
        abierto={confirmarBorradoRutina !== null}
        idTitulo="rutina-confirmar-borrado"
        titulo={
          confirmarBorradoRutina?.tipo === 'dia' ? '¿Eliminar este día?' : '¿Eliminar este ejercicio?'
        }
        detalle={
          confirmarBorradoRutina?.tipo === 'dia'
            ? 'Se quitará este día con todos sus ejercicios de la rutina que estás editando.'
            : `Se quitará «${
                bloquesRutinaEdit[activeDiaIdx]?.ejercicios?.[confirmarBorradoRutina?.indice ?? -1]
                  ?.nombre ?? 'este ejercicio'
              }» de este día.`
        }
        textoConfirmar="Sí, eliminar"
        variante="peligro"
        onCancelar={() => setConfirmarBorradoRutina(null)}
        onConfirmar={() => {
          if (confirmarBorradoRutina?.tipo === 'dia') removerDiaRutina(confirmarBorradoRutina.indice);
          else if (confirmarBorradoRutina?.tipo === 'ejercicio') {
            removerEjercicioDeDia(confirmarBorradoRutina.indice);
          }
          setConfirmarBorradoRutina(null);
        }}
      />
    </>
  );
}
