/**
 * Hook de ajustes y asignación del módulo `selector-plantilla-asignacion`
 * (prompt 71, lote C).
 *
 * Estado del wizard de 3 pasos (elegir → revisar → confirmar), confirmación de
 * reemplazo y focos accesibles. Los overrides por ejercicio viven en
 * `use-ajustes-plantilla` (compartido con la asignación masiva, lote E10).
 */
import { useEffect, useId, useRef, useState } from 'react';
import {
  ModoAsignacionPlantilla,
  type AsignacionPlantillaResponseDTO,
  type PlantillaRutinaDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { triggerHaptic } from '../../../lib/haptics';
import { traducirMensajeSuelto } from '../../../lib/mensajes-error';
import { PASOS_ASIGNACION, type PasoAsignacion } from '../../../lib/asignacion-pasos';
import { construirResultadoDemoAsignacion } from '../../../lib/selector-plantilla-asignacion-demo';
import { useAjustesPlantilla } from './use-ajustes-plantilla';

export function useAsignacionPlantilla({
  detalle,
  alumnoId,
  isDemoMode,
  onAsignada,
}: {
  detalle: PlantillaRutinaDTO | null;
  alumnoId: string;
  isDemoMode: boolean;
  onAsignada: (resultado: AsignacionPlantillaResponseDTO) => void;
}) {
  const [modo, setModo] = useState<ModoAsignacionPlantilla>(ModoAsignacionPlantilla.REEMPLAZAR);
  const [isAsignando, setIsAsignando] = useState(false);
  const [resultado, setResultado] = useState<AsignacionPlantillaResponseDTO | null>(null);
  const [errorAsignacion, setErrorAsignacion] = useState<string | null>(null);
  // C4: reemplazar la rutina actual del alumno pide confirmación explícita.
  const [confirmandoReemplazo, setConfirmandoReemplazo] = useState(false);
  // Lote E6: el formulario avanza en 3 pasos; en el 2 solo hay un día abierto y los campos
  // de ajuste aparecen al pulsar "Ajustar" en cada ejercicio.
  const [paso, setPaso] = useState<PasoAsignacion>('elegir');
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  const refTituloPaso = useRef<HTMLParagraphElement>(null);
  const refBotonCerrar = useRef<HTMLButtonElement>(null);
  const esPrimerPaso = useRef(true);
  const idBase = useId();

  /** Resetea los ajustes al elegir otra plantilla (lo invoca el contenedor antes de cargar el detalle). */
  const reiniciarAlElegir = () => {
    triggerHaptic('selection');
    ajustesPlantilla.reiniciarAjustes();
    setDiaAbierto(null);
    setResultado(null);
    setErrorAsignacion(null);
  };

  /** Paso 2: al entrar se abre el primer día (o se conserva el que ya estaba abierto). */
  const irARevisar = () => {
    if (!detalle) return;
    setDiaAbierto((actual) =>
      actual && detalle.bloques.some((b) => b.diaId === actual) ? actual : detalle.bloques[0]?.diaId ?? null
    );
    setPaso('revisar');
  };

  // Al cambiar de paso, el foco va a su título (que además se anuncia): el botón pulsado se
  // desmonta y el foco no debe perderse. El paso inicial conserva el foco del buscador.
  useEffect(() => {
    if (esPrimerPaso.current) {
      esPrimerPaso.current = false;
      return;
    }
    refTituloPaso.current?.focus();
  }, [paso]);

  // Ajustes por ejercicio (hook compartido). Se declara tras el efecto del título para que, al
  // volver a revisar con errores, el foco termine en el resumen de errores.
  const ajustesPlantilla = useAjustesPlantilla({
    detalle,
    idBase,
    enRevision: paso === 'revisar',
    abrirDia: setDiaAbierto,
  });
  const {
    overrides,
    erroresAjustes,
    setErroresAjustes,
    ajustando,
    bloquesPreview,
    ajustesPendientes,
    refResumenErrores,
    actualizarOverride,
    limpiarOverride,
    alternarAjuste,
    irAlCampoConError,
  } = ajustesPlantilla;

  const asignacionHecha = Boolean(resultado && resultado.exitosos > 0);
  useEffect(() => {
    if (asignacionHecha) refBotonCerrar.current?.focus();
  }, [asignacionHecha]);

  /** Tras un éxito no se permite re-confirmar: cada asignación crea/fusiona bloques reales. */
  const asignacionCompletada = Boolean(resultado && resultado.exitosos > 0);

  const confirmarAsignacion = async (reemplazoConfirmado = false) => {
    if (!detalle || asignacionCompletada) return;
    const ajustes = ajustesPlantilla.prepararAjustes();
    if (ajustes === null) {
      // Vuelve al paso 2 con el día y los campos del primer ajuste inválido a la vista.
      setPaso('revisar');
      return;
    }
    if (modo === ModoAsignacionPlantilla.REEMPLAZAR && !reemplazoConfirmado) {
      setConfirmandoReemplazo(true);
      return;
    }
    setConfirmandoReemplazo(false);

    // MODO DEMO EXPLÍCITO (isDemoMode): asignación simulada en estado local, sin llamada API.
    if (isDemoMode) {
      const res = construirResultadoDemoAsignacion(detalle, modo, alumnoId);
      setResultado(res);
      triggerHaptic('success');
      return;
    }

    setIsAsignando(true);
    setErrorAsignacion(null);
    setErroresAjustes([]);
    try {
      const res = await apiClient<AsignacionPlantillaResponseDTO>(
        `/plantillas/${detalle.id}/asignar`,
        {
          method: 'POST',
          body: JSON.stringify({
            alumnoIds: [alumnoId],
            modo,
            ...(ajustes.length > 0 ? { ajustes } : {}),
          }),
        }
      );
      setResultado(res);
      triggerHaptic(res.exitosos > 0 ? 'success' : 'warning');
      if (res.exitosos > 0) {
        onAsignada(res);
      }
      if (res.fallidos > 0) {
        // A6/C6: el error crudo de `resultados[].error` se traduce antes de mostrarse.
        setErrorAsignacion(traducirMensajeSuelto(res.resultados.find((r) => !r.exito)?.error));
      }
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : undefined;
      setErrorAsignacion(mensaje || 'No se pudo asignar la plantilla en el servidor.');
      triggerHaptic('warning');
    } finally {
      setIsAsignando(false);
    }
  };

  return {
    idBase,
    overrides,
    modo,
    setModo,
    isAsignando,
    resultado,
    errorAsignacion,
    erroresAjustes,
    confirmandoReemplazo,
    setConfirmandoReemplazo,
    paso,
    setPaso,
    diaAbierto,
    setDiaAbierto,
    ajustando,
    bloquesPreview,
    ajustesPendientes,
    asignacionCompletada,
    indicePaso: PASOS_ASIGNACION.indexOf(paso),
    refResumenErrores,
    refTituloPaso,
    refBotonCerrar,
    reiniciarAlElegir,
    actualizarOverride,
    limpiarOverride,
    alternarAjuste,
    irARevisar,
    irAlCampoConError,
    confirmarAsignacion,
  };
}
