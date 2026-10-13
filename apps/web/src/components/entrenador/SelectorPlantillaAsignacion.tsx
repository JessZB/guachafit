/**
 * RF-017 Escenario 2 + RN-03: "Cargar desde plantilla" en el Expediente 360°.
 * Selecciona una plantilla activa del banco, previsualiza días/ejercicios/series,
 * permite ajustar cargas particulares antes de confirmar y exige elegir explícitamente
 * entre Reemplazar y Fusionar la rutina del alumno.
 *
 * Contenedor orquestador (prompt 71): conserva su ruta, su export y su API de
 * props (R11). El estado de datos vive en `use-plantillas-selector` y
 * `use-asignacion-plantilla`; cada paso renderiza en su componente de
 * `selector-plantilla-asignacion/`.
 */
import type { AsignacionPlantillaResponseDTO, PlantillaRutinaResumenDTO } from '@guachafit/shared';
import { useAuth } from '../../context/auth-context';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { textoConfirmacionReemplazo } from '../../lib/asignacion-masiva';
import { DialogoConfirmacion } from '../common/DialogoConfirmacion';
import { CabeceraPasos } from './selector-plantilla-asignacion/CabeceraPasos';
import { PasoElegir } from './selector-plantilla-asignacion/PasoElegir';
import { PasoRevisar } from './selector-plantilla-asignacion/PasoRevisar';
import { PasoConfirmar } from './selector-plantilla-asignacion/PasoConfirmar';
import { BarraNavegacionPasos } from './selector-plantilla-asignacion/BarraNavegacionPasos';
import { usePlantillasSelector } from './selector-plantilla-asignacion/use-plantillas-selector';
import { useAsignacionPlantilla } from './selector-plantilla-asignacion/use-asignacion-plantilla';

interface SelectorPlantillaAsignacionProps {
  /** `perfiles_alumno.id` del expediente abierto. */
  alumnoId: string;
  alumnoNombre: string;
  onCerrar: () => void;
  /** Se invoca tras una asignación con al menos un éxito (refresco del expediente). */
  onAsignada: (resultado: AsignacionPlantillaResponseDTO) => void;
}

export function SelectorPlantillaAsignacion({
  alumnoId,
  alumnoNombre,
  onCerrar,
  onAsignada,
}: SelectorPlantillaAsignacionProps) {
  const { isDemoMode } = useAuth();
  const plantillas = usePlantillasSelector({ isDemoMode });
  const asignacion = useAsignacionPlantilla({
    detalle: plantillas.detalle,
    alumnoId,
    isDemoMode,
    onAsignada,
  });

  // U3b: Escape, trampa de Tab y restore del foco; el foco inicial sigue en el buscador
  // (`autoFocus`), por eso el hook no lo reasigna.
  const refDialogo = useDialogoAccesible({ onCerrar, enfocarAlAbrir: false });

  const seleccionarPlantilla = (resumen: PlantillaRutinaResumenDTO) => {
    if (plantillas.cargandoDetalleId) return;
    asignacion.reiniciarAlElegir();
    void plantillas.seleccionarPlantilla(resumen);
  };

  const { detalle } = plantillas;
  const puedeAvanzar = Boolean(detalle && !plantillas.errorDetalle && !plantillas.cargandoDetalleId);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-plantilla-asignar-title"
        tabIndex={-1}
        className="w-full sm:max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] bg-card sm:rounded-3xl sm:border border-border shadow-2xl flex flex-col"
      >
        {/* Cabecera: título, alumno y paso actual con su barra de progreso */}
        <CabeceraPasos
          alumnoNombre={alumnoNombre}
          paso={asignacion.paso}
          indicePaso={asignacion.indicePaso}
          tituloRef={asignacion.refTituloPaso}
          onCerrar={onCerrar}
        />

        {/* Contenido del paso */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {asignacion.paso === 'elegir' && (
            <PasoElegir
              idBase={asignacion.idBase}
              busqueda={plantillas.busqueda}
              plantillasFiltradas={plantillas.plantillasFiltradas}
              totalPlantillas={plantillas.plantillas.length}
              detalleId={detalle?.id ?? null}
              cargandoDetalleId={plantillas.cargandoDetalleId}
              isLoading={plantillas.isLoading}
              errorCarga={plantillas.errorCarga}
              errorDetalle={plantillas.errorDetalle}
              onCambiarBusqueda={plantillas.setBusqueda}
              onRecargar={() => void plantillas.cargarPlantillas()}
              onSeleccionar={seleccionarPlantilla}
              onNavegarAPlantillas={onCerrar}
            />
          )}

          {asignacion.paso === 'revisar' && detalle && (
            <PasoRevisar
              idBase={asignacion.idBase}
              detalle={detalle}
              bloquesPreview={asignacion.bloquesPreview}
              overrides={asignacion.overrides}
              erroresAjustes={asignacion.erroresAjustes}
              diaAbierto={asignacion.diaAbierto}
              ajustando={asignacion.ajustando}
              asignacionCompletada={asignacion.asignacionCompletada}
              resumenErroresRef={asignacion.refResumenErrores}
              onSeleccionarDia={asignacion.setDiaAbierto}
              onAlternarAjuste={asignacion.alternarAjuste}
              onActualizarCampo={asignacion.actualizarOverride}
              onLimpiar={asignacion.limpiarOverride}
              onIrAlCampoConError={asignacion.irAlCampoConError}
            />
          )}

          {asignacion.paso === 'confirmar' && detalle && (
            <PasoConfirmar
              idBase={asignacion.idBase}
              detalle={detalle}
              alumnoNombre={alumnoNombre}
              modo={asignacion.modo}
              ajustesPendientes={asignacion.ajustesPendientes}
              resultado={asignacion.resultado}
              errorAsignacion={asignacion.errorAsignacion}
              asignacionCompletada={asignacion.asignacionCompletada}
              onCambiarModo={asignacion.setModo}
            />
          )}
        </div>

        {/* Navegación fija abajo */}
        <BarraNavegacionPasos
          paso={asignacion.paso}
          asignacionCompletada={asignacion.asignacionCompletada}
          isAsignando={asignacion.isAsignando}
          puedeAvanzar={puedeAvanzar}
          idDescripcionSiguiente={
            !puedeAvanzar && asignacion.paso === 'elegir'
              ? `${asignacion.idBase}-pista-siguiente`
              : undefined
          }
          botonCerrarRef={asignacion.refBotonCerrar}
          onCerrar={onCerrar}
          onAtras={() =>
            asignacion.setPaso(asignacion.paso === 'confirmar' ? 'revisar' : 'elegir')
          }
          onAvanzar={() =>
            asignacion.paso === 'elegir' ? asignacion.irARevisar() : asignacion.setPaso('confirmar')
          }
          onConfirmar={() => void asignacion.confirmarAsignacion()}
        />
      </div>

      {/* C4: reemplazar la rutina actual es destructivo para el plan vigente: se confirma. */}
      <DialogoConfirmacion
        abierto={asignacion.confirmandoReemplazo}
        idTitulo={`${asignacion.idBase}-confirmar-reemplazo`}
        titulo="Reemplazar la rutina actual"
        detalle={textoConfirmacionReemplazo(1, alumnoNombre)}
        textoConfirmar="Sí, reemplazar"
        variante="peligro"
        procesando={asignacion.isAsignando}
        onCancelar={() => asignacion.setConfirmandoReemplazo(false)}
        onConfirmar={() => void asignacion.confirmarAsignacion(true)}
      />
    </div>
  );
}
