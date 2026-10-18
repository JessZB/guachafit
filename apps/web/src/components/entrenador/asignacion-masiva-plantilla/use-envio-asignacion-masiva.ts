/**
 * Ola 3 · módulo `asignacion-masiva-plantilla` (lote C, hook de datos).
 *
 * Envío de la asignación masiva con idempotencia y fallo ambiguo. Recorte verbatim de
 * `AsignacionMasivaPlantilla.tsx:67-79,179-247` (mismo mecanismo: `apiClient` directo + demo local).
 *
 * Lote E10: `confirmar` recibe los ajustes comunes ya validados; viajan en el cuerpo (solo si
 * hay alguno) y forman parte de la huella de la clave de idempotencia. El modo demo los ignora.
 */
import { useRef, useState } from 'react';
import {
  ModoAsignacionPlantilla,
  type AjusteEjercicioPlantillaDTO,
  type AsignacionPlantillaResponseDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { triggerHaptic } from '../../../lib/haptics';
import {
  MENSAJE_ASIGNACION_INCIERTA,
  describirResultadosAsignacion,
  esFalloAmbiguoAsignacion,
  ordenarAjustesCanonico,
  requiereConfirmacionReintento,
  resolverClaveAsignacion,
  type FilaResultadoAsignacion,
  type IntentoAsignacion,
} from '../../../lib/asignacion-masiva';

export function useEnvioAsignacionMasiva({
  plantillaId,
  plantillaNombre,
  seleccion,
  nombresPorId,
  isDemoMode,
}: {
  plantillaId: string;
  plantillaNombre: string;
  seleccion: string[];
  nombresPorId: Record<string, string>;
  isDemoMode: boolean;
}) {
  const [modo, setModo] = useState<ModoAsignacionPlantilla>(ModoAsignacionPlantilla.FUSIONAR);
  const [confirmandoReemplazo, setConfirmandoReemplazo] = useState(false);
  const [isAsignando, setIsAsignando] = useState(false);
  const [errorAsignacion, setErrorAsignacion] = useState<string | null>(null);
  const [resultados, setResultados] = useState<FilaResultadoAsignacion[] | null>(null);
  // La asignación acepta `X-Idempotency-Key`: los reintentos de la misma selección y modo
  // reutilizan la clave. El servidor la recuerda solo en memoria, así que tras un fallo ambiguo
  // en modo Añadir se pide además confirmación explícita antes de reintentar.
  const [falloAmbiguo, setFalloAmbiguo] = useState(false);
  const [confirmandoReintento, setConfirmandoReintento] = useState(false);
  const intentoAsignacion = useRef<IntentoAsignacion | null>(null);
  // Ajustes del intento en curso: los fija `confirmar` y los usan los diálogos al reenviar.
  const ajustesIntento = useRef<AjusteEjercicioPlantillaDTO[]>([]);

  const enviarAsignacion = async () => {
    setConfirmandoReemplazo(false);
    setConfirmandoReintento(false);
    setErrorAsignacion(null);

    if (isDemoMode) {
      setResultados(
        describirResultadosAsignacion(
          seleccion.map((alumnoId) => ({ alumnoId, exito: true, rutinaNombre: plantillaNombre })),
          nombresPorId
        )
      );
      triggerHaptic('success');
      return;
    }

    // Orden canónico: la huella de la clave y el cuerpo salen del mismo arreglo (lote E10, B-1).
    const ajustes = ordenarAjustesCanonico(ajustesIntento.current);
    const intento = resolverClaveAsignacion(
      intentoAsignacion.current,
      seleccion,
      modo,
      undefined,
      ajustes
    );
    intentoAsignacion.current = intento;

    setIsAsignando(true);
    try {
      const res = await apiClient<AsignacionPlantillaResponseDTO>(
        `/plantillas/${plantillaId}/asignar`,
        {
          method: 'POST',
          body: JSON.stringify({
            alumnoIds: seleccion,
            modo,
            ...(ajustes.length > 0 ? { ajustes } : {}),
          }),
          idempotent: true,
          idempotencyKey: intento.clave,
        }
      );
      // Asignación confirmada: la próxima es otra asignación (clave nueva).
      intentoAsignacion.current = null;
      setFalloAmbiguo(false);
      setResultados(describirResultadosAsignacion(res.resultados ?? [], nombresPorId));
      triggerHaptic(res.exitosos > 0 ? 'success' : 'warning');
    } catch (err) {
      if (esFalloAmbiguoAsignacion(err)) {
        // Sin respuesta clara la asignación pudo aplicarse: el reintento reutiliza la clave, pero
        // en modo Añadir se pedirá confirmación antes de volver a enviar.
        setFalloAmbiguo(true);
        setErrorAsignacion(MENSAJE_ASIGNACION_INCIERTA);
      } else {
        setErrorAsignacion(
          err instanceof Error && err.message
            ? err.message
            : 'No pudimos asignar la plantilla. Inténtalo de nuevo.'
        );
      }
      triggerHaptic('warning');
    } finally {
      setIsAsignando(false);
    }
  };

  const confirmar = (ajustes: AjusteEjercicioPlantillaDTO[] = []) => {
    if (seleccion.length === 0 || isAsignando) return;
    ajustesIntento.current = ajustes;
    if (modo === ModoAsignacionPlantilla.REEMPLAZAR) {
      setConfirmandoReemplazo(true);
      return;
    }
    if (requiereConfirmacionReintento(falloAmbiguo, modo)) {
      setConfirmandoReintento(true);
      return;
    }
    void enviarAsignacion();
  };

  const exitosos = resultados?.filter((fila) => fila.exito).length ?? 0;
  const nombreUnico = seleccion.length === 1 ? nombresPorId[seleccion[0]] : undefined;

  return {
    modo,
    setModo,
    confirmandoReemplazo,
    setConfirmandoReemplazo,
    isAsignando,
    errorAsignacion,
    // Tras un fallo ambiguo el intento queda congelado hasta confirmarse o cerrar el diálogo: no
    // cambian alumnos, ajustes ni modo; solo se puede reintentar con la misma clave.
    intentoCongelado: falloAmbiguo,
    resultados,
    confirmandoReintento,
    setConfirmandoReintento,
    exitosos,
    nombreUnico,
    enviarAsignacion,
    confirmar,
  };
}

