/**
 * RF-017 RN-03 (A6): asignar una plantilla a varios alumnos a la vez (máximo 50 por envío).
 *
 * Usa el endpoint existente `POST /plantillas/:id/asignar` (acepta `alumnoIds[]`) y muestra el
 * resultado por alumno con mensajes humanos: los errores técnicos de `resultados[].error` pasan
 * por la traducción de mensajes-error. Reemplazar la rutina actual pide confirmación.
 *
 * Ola 3 (prompt 83): contenedor orquestador. Los datos viven en
 * `asignacion-masiva-plantilla/use-directorio-alumnos-asignacion` y
 * `asignacion-masiva-plantilla/use-envio-asignacion-masiva` (mismo mecanismo: R9);
 * el JSX vive en las piezas presentacionales de esa carpeta.
 */
import type { PlantillaRutinaResumenDTO } from '@guachafit/shared';
import { useAuth } from '../../context/auth-context';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import {
  MENSAJE_ASIGNACION_INCIERTA,
  textoConfirmacionReemplazo,
} from '../../lib/asignacion-masiva';
import { DialogoConfirmacion } from '../common/DialogoConfirmacion';
import { CabeceraAsignacion } from './asignacion-masiva-plantilla/CabeceraAsignacion';
import { SelectorModoAsignacion } from './asignacion-masiva-plantilla/SelectorModoAsignacion';
import { ListaAlumnosAsignacion } from './asignacion-masiva-plantilla/ListaAlumnosAsignacion';
import { ResultadoAsignacion } from './asignacion-masiva-plantilla/ResultadoAsignacion';
import { PieAsignacion } from './asignacion-masiva-plantilla/PieAsignacion';
import { useDirectorioAlumnosAsignacion } from './asignacion-masiva-plantilla/use-directorio-alumnos-asignacion';
import { useEnvioAsignacionMasiva } from './asignacion-masiva-plantilla/use-envio-asignacion-masiva';

interface AsignacionMasivaPlantillaProps {
  plantilla: PlantillaRutinaResumenDTO;
  onCerrar: () => void;
}

export function AsignacionMasivaPlantilla({ plantilla, onCerrar }: AsignacionMasivaPlantillaProps) {
  const { isDemoMode } = useAuth();
  const directorio = useDirectorioAlumnosAsignacion({ isDemoMode });
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
        className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <CabeceraAsignacion
          nombrePlantilla={plantilla.nombre}
          cerrarDeshabilitado={envio.isAsignando}
          onCerrar={onCerrar}
        />

        {envio.resultados ? (
          <ResultadoAsignacion
            resultados={envio.resultados}
            exitosos={envio.exitosos}
            onCerrar={onCerrar}
          />
        ) : (
          <>
            <SelectorModoAsignacion modo={envio.modo} onCambiarModo={envio.setModo} />

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

            <PieAsignacion
              errorAsignacion={envio.errorAsignacion}
              seleccionados={directorio.seleccion.length}
              isAsignando={envio.isAsignando}
              onCancelar={onCerrar}
              onConfirmar={envio.confirmar}
            />
          </>
        )}
      </div>

      <DialogoConfirmacion
        abierto={envio.confirmandoReemplazo}
        idTitulo="asignacion-masiva-confirmar-reemplazo"
        titulo="Reemplazar la rutina actual"
        detalle={textoConfirmacionReemplazo(directorio.seleccion.length, envio.nombreUnico)}
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
