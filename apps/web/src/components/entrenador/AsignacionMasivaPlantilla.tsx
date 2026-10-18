/**
 * RF-017 RN-03 (A6): asignar una plantilla a varios alumnos a la vez (máximo 50 por envío).
 *
 * Usa el endpoint existente `POST /plantillas/:id/asignar` (acepta `alumnoIds[]` y un único
 * arreglo de `ajustes`) y muestra el resultado por alumno con mensajes humanos: los errores
 * técnicos de `resultados[].error` pasan por la traducción de mensajes-error. Reemplazar la
 * rutina actual pide confirmación.
 *
 * Lote E10: mismo flujo en 3 pasos que la asignación individual — elegir alumnos → revisar y
 * ajustar (ajustes comunes a todos) → confirmar (modo, envío y resultado por alumno).
 *
 * Contenedor orquestador. Los datos viven en los hooks de `asignacion-masiva-plantilla/`
 * (directorio, detalle, pasos y envío; mismo mecanismo: R9) y el JSX en sus piezas
 * presentacionales; el paso de revisión y la barra se comparten con `selector-plantilla-asignacion/`.
 */
import type { PlantillaRutinaResumenDTO } from '@guachafit/shared';
import { useAuth } from '../../context/auth-context';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import {
  MENSAJE_ASIGNACION_INCIERTA,
  textoConfirmacionReemplazo,
} from '../../lib/asignacion-masiva';
import { PASOS_ASIGNACION_MASIVA } from '../../lib/asignacion-pasos';
import { DialogoConfirmacion } from '../common/DialogoConfirmacion';
import { CabeceraAsignacion } from './asignacion-masiva-plantilla/CabeceraAsignacion';
import { ListaAlumnosAsignacion } from './asignacion-masiva-plantilla/ListaAlumnosAsignacion';
import { PasoRevisarAsignacionMasiva } from './asignacion-masiva-plantilla/PasoRevisarAsignacionMasiva';
import { PasoConfirmarAsignacionMasiva } from './asignacion-masiva-plantilla/PasoConfirmarAsignacionMasiva';
import { ResultadoAsignacion } from './asignacion-masiva-plantilla/ResultadoAsignacion';
import { useDirectorioAlumnosAsignacion } from './asignacion-masiva-plantilla/use-directorio-alumnos-asignacion';
import { useDetallePlantillaAsignacion } from './asignacion-masiva-plantilla/use-detalle-plantilla-asignacion';
import { usePasosAsignacionMasiva } from './asignacion-masiva-plantilla/use-pasos-asignacion-masiva';
import { useEnvioAsignacionMasiva } from './asignacion-masiva-plantilla/use-envio-asignacion-masiva';
import { IndicadorPasos } from './selector-plantilla-asignacion/IndicadorPasos';
import { BarraNavegacionPasos } from './selector-plantilla-asignacion/BarraNavegacionPasos';

interface AsignacionMasivaPlantillaProps {
  plantilla: PlantillaRutinaResumenDTO;
  onCerrar: () => void;
}

export function AsignacionMasivaPlantilla({ plantilla, onCerrar }: AsignacionMasivaPlantillaProps) {
  const { isDemoMode } = useAuth();
  const directorio = useDirectorioAlumnosAsignacion({ isDemoMode });
  const detalle = useDetallePlantillaAsignacion({ plantillaId: plantilla.id, isDemoMode });
  const pasos = usePasosAsignacionMasiva({ detalle: detalle.detalle });
  const envio = useEnvioAsignacionMasiva({
    plantillaId: plantilla.id,
    plantillaNombre: plantilla.nombre,
    seleccion: directorio.seleccion,
    nombresPorId: directorio.nombresPorId,
    isDemoMode,
  });

  const refDialogo = useDialogoAccesible({
    onCerrar: () => {
      if (!envio.isAsignando) onCerrar();
    },
  });

  const { paso, ajustes } = pasos;
  const seleccionados = directorio.seleccion.length;

  // Paso 1: hace falta al menos un alumno. Paso 2: el detalle cargado (o la demo sin vista previa).
  const puedeAvanzar =
    paso === 'alumnos'
      ? seleccionados > 0
      : !detalle.cargando &&
        !detalle.error &&
        (detalle.detalle !== null || detalle.sinVistaPreviaDemo);

  /** Ajustes inválidos → vuelve al paso 2 con su resumen; si no, sigue el flujo de envío. */
  const confirmar = () => {
    if (envio.isAsignando) return;
    const ajustesValidos = ajustes.prepararAjustes();
    if (ajustesValidos === null) {
      pasos.setPaso('revisar');
      return;
    }
    ajustes.setErroresAjustes([]);
    envio.confirmar(ajustesValidos);
  };

  return (
    <div
      onClick={(evento) => {
        if (evento.target === evento.currentTarget && !envio.isAsignando) onCerrar();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="asignacion-masiva-titulo"
        tabIndex={-1}
        className="rounded-3xl bg-card border border-border shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 space-y-3">
          <CabeceraAsignacion
            nombrePlantilla={plantilla.nombre}
            cerrarDeshabilitado={envio.isAsignando}
            onCerrar={onCerrar}
          />
          {!envio.resultados && (
            <IndicadorPasos
              paso={paso}
              pasos={PASOS_ASIGNACION_MASIVA}
              indicePaso={pasos.indicePaso}
              tituloRef={pasos.refTituloPaso}
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4 space-y-4">
          {envio.resultados ? (
            <ResultadoAsignacion
              resultados={envio.resultados}
              exitosos={envio.exitosos}
              onCerrar={onCerrar}
            />
          ) : paso === 'alumnos' ? (
            <ListaAlumnosAsignacion
              alumnos={directorio.alumnos}
              seleccion={directorio.seleccion}
              seleccionadosFueraDeLista={directorio.seleccionadosFueraDeLista}
              avisoLimite={directorio.avisoLimite}
              isLoading={directorio.isLoading}
              isCargandoMas={directorio.isCargandoMas}
              errorCarga={directorio.errorCarga}
              busqueda={directorio.busqueda}
              busquedaAplicada={directorio.busquedaAplicada}
              hayMas={directorio.hayMas}
              onCambiarBusqueda={directorio.setBusqueda}
              onAlternar={directorio.alternar}
              onReintentar={directorio.reintentarCarga}
              onCargarMas={directorio.cargarMas}
            />
          ) : paso === 'revisar' ? (
            <PasoRevisarAsignacionMasiva
              idBase={pasos.idBase}
              detalle={detalle.detalle}
              cargando={detalle.cargando}
              error={detalle.error}
              sinVistaPreviaDemo={detalle.sinVistaPreviaDemo}
              diasAbiertos={pasos.diasAbiertos}
              ajustes={ajustes}
              onAlternarDia={pasos.alternarDia}
              onReintentar={detalle.reintentar}
            />
          ) : (
            <PasoConfirmarAsignacionMasiva
              plantillaNombre={plantilla.nombre}
              cantidad={seleccionados}
              nombreUnico={envio.nombreUnico}
              numeroAjustes={ajustes.ajustesPendientes}
              modo={envio.modo}
              errorAsignacion={envio.errorAsignacion}
              intentoCongelado={envio.intentoCongelado}
              onCambiarModo={envio.setModo}
            />
          )}
        </div>

        {!envio.resultados && (
          <BarraNavegacionPasos
            paso={paso}
            pasos={PASOS_ASIGNACION_MASIVA}
            textoCerrar="Cancelar"
            textoConfirmar={
              envio.isAsignando
                ? 'Asignando…'
                : `Asignar a ${seleccionados} alumno${seleccionados === 1 ? '' : 's'}`
            }
            asignacionCompletada={false}
            isAsignando={envio.isAsignando}
            atrasDeshabilitado={envio.intentoCongelado}
            puedeAvanzar={puedeAvanzar}
            onCerrar={onCerrar}
            onAtras={pasos.retroceder}
            onAvanzar={pasos.avanzar}
            onConfirmar={confirmar}
          />
        )}
      </div>

      <DialogoConfirmacion
        abierto={envio.confirmandoReemplazo}
        idTitulo="asignacion-masiva-confirmar-reemplazo"
        titulo="Reemplazar la rutina actual"
        detalle={textoConfirmacionReemplazo(seleccionados, envio.nombreUnico)}
        textoConfirmar="Sí, reemplazar"
        variante="peligro"
        onCancelar={() => envio.setConfirmandoReemplazo(false)}
        onConfirmar={() => void envio.enviarAsignacion()}
      />

      <DialogoConfirmacion
        abierto={envio.confirmandoReintento}
        idTitulo="asignacion-masiva-confirmar-reintento"
        titulo="¿Volver a intentar la asignación?"
        detalle={MENSAJE_ASIGNACION_INCIERTA}
        textoConfirmar="Sí, volver a intentar"
        variante="peligro"
        onCancelar={() => envio.setConfirmandoReintento(false)}
        onConfirmar={() => void envio.enviarAsignacion()}
      />
    </div>
  );
}
