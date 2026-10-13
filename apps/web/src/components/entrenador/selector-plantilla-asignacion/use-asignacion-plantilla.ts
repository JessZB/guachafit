/**
 * Hook de ajustes y asignación del módulo `selector-plantilla-asignacion`
 * (prompt 71, lote C).
 *
 * Estado del wizard de 3 pasos (elegir → revisar → confirmar), overrides por
 * ejercicio, confirmación de reemplazo y focos accesibles. La validación y el
 * mapeo al contrato viven en `lib/plantillas-rutina` (lógica pura).
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ModoAsignacionPlantilla,
  type AsignacionPlantillaResponseDTO,
  type BloqueDiaRutinaDTO,
  type PlantillaRutinaDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { triggerHaptic } from '../../../lib/haptics';
import { traducirMensajeSuelto } from '../../../lib/mensajes-error';
import {
  aplicarOverridesPreview,
  claveOverrideEjercicio,
  construirAjustesPlantilla,
  overrideTieneCambios,
  validarOverrideEjercicio,
  type ErrorAjuste,
  type OverrideAjusteEjercicio,
} from '../../../lib/plantillas-rutina';
import { PASOS_ASIGNACION, type PasoAsignacion } from '../../../lib/asignacion-pasos';
import { construirResultadoDemoAsignacion } from '../../../lib/selector-plantilla-asignacion-demo';
import type { CampoAjusteCampo } from './CampoAjuste';

type EjercicioPlantilla = BloqueDiaRutinaDTO['ejercicios'][number];

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
  const [overrides, setOverrides] = useState<Record<string, OverrideAjusteEjercicio>>({});
  const [modo, setModo] = useState<ModoAsignacionPlantilla>(ModoAsignacionPlantilla.REEMPLAZAR);
  const [isAsignando, setIsAsignando] = useState(false);
  const [resultado, setResultado] = useState<AsignacionPlantillaResponseDTO | null>(null);
  const [errorAsignacion, setErrorAsignacion] = useState<string | null>(null);
  const [erroresAjustes, setErroresAjustes] = useState<ErrorAjuste[]>([]);
  // C4: reemplazar la rutina actual del alumno pide confirmación explícita.
  const [confirmandoReemplazo, setConfirmandoReemplazo] = useState(false);
  // Lote E6: el formulario avanza en 3 pasos; en el 2 solo hay un día abierto y los campos
  // de ajuste aparecen al pulsar "Ajustar" en cada ejercicio.
  const [paso, setPaso] = useState<PasoAsignacion>('elegir');
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  const [ajustando, setAjustando] = useState<Set<string>>(() => new Set());
  const refResumenErrores = useRef<HTMLDivElement>(null);
  const refTituloPaso = useRef<HTMLParagraphElement>(null);
  const refBotonCerrar = useRef<HTMLButtonElement>(null);
  const esPrimerPaso = useRef(true);
  const idBase = useId();

  /** Resetea los ajustes al elegir otra plantilla (lo invoca el contenedor antes de cargar el detalle). */
  const reiniciarAlElegir = () => {
    triggerHaptic('selection');
    setOverrides({});
    setErroresAjustes([]);
    setAjustando(new Set());
    setDiaAbierto(null);
    setResultado(null);
    setErrorAsignacion(null);
  };

  const actualizarOverride = (
    bloque: BloqueDiaRutinaDTO,
    ejercicio: EjercicioPlantilla,
    campo: CampoAjusteCampo,
    valor: string
  ) => {
    const clave = claveOverrideEjercicio(bloque.diaId, ejercicio.ejercicioId, ejercicio.nombre);
    // Al corregir un campo se descarta su error de confirmación anterior.
    setErroresAjustes((prev) => prev.filter((e) => e.clave !== clave));
    setOverrides((prev) => {
      const actual: OverrideAjusteEjercicio = prev[clave] ?? {
        diaId: bloque.diaId,
        ejercicioId: ejercicio.ejercicioId,
        nombreEjercicio: ejercicio.nombre,
        peso: '',
        series: '',
        reps: '',
      };
      const actualizado = { ...actual, [campo]: valor };
      const siguiente = { ...prev };
      if (overrideTieneCambios(actualizado)) {
        siguiente[clave] = actualizado;
      } else {
        delete siguiente[clave];
      }
      return siguiente;
    });
  };

  const limpiarOverride = (clave: string) => {
    triggerHaptic('selection');
    setOverrides((prev) => {
      const siguiente = { ...prev };
      delete siguiente[clave];
      return siguiente;
    });
    setErroresAjustes((prev) => prev.filter((e) => e.clave !== clave));
  };

  const bloquesPreview = useMemo(
    () => (detalle ? aplicarOverridesPreview(detalle.bloques, overrides) : []),
    [detalle, overrides]
  );

  const alternarAjuste = (clave: string) =>
    setAjustando((previos) => {
      const siguientes = new Set(previos);
      if (siguientes.has(clave)) siguientes.delete(clave);
      else siguientes.add(clave);
      return siguientes;
    });

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

  /** Del resumen de errores al primer campo inválido de ese ejercicio (abre su día). */
  const irAlCampoConError = (clave: string) => {
    if (!detalle) return;
    for (const bloque of detalle.bloques) {
      const ejIdx = bloque.ejercicios.findIndex(
        (ej) => claveOverrideEjercicio(bloque.diaId, ej.ejercicioId, ej.nombre) === clave
      );
      if (ejIdx < 0) continue;
      const override = overrides[clave];
      const errores = override ? validarOverrideEjercicio(override) : {};
      const campo = errores.peso ? 'peso' : errores.series ? 'series' : 'reps';
      setDiaAbierto(bloque.diaId);
      setAjustando((previos) => new Set(previos).add(clave));
      window.setTimeout(() => document.getElementById(`${idBase}-${bloque.diaId}-${ejIdx}-${campo}`)?.focus(), 0);
      return;
    }
  };

  // Resumen de errores enfocable: al aparecer recibe el foco para que se lea primero.
  useEffect(() => {
    if (paso === 'revisar' && erroresAjustes.length > 0) refResumenErrores.current?.focus();
  }, [paso, erroresAjustes]);

  const asignacionHecha = Boolean(resultado && resultado.exitosos > 0);
  useEffect(() => {
    if (asignacionHecha) refBotonCerrar.current?.focus();
  }, [asignacionHecha]);

  const ajustesPendientes = useMemo(
    () => Object.values(overrides).filter(overrideTieneCambios).length,
    [overrides]
  );

  /** Tras un éxito no se permite re-confirmar: cada asignación crea/fusiona bloques reales. */
  const asignacionCompletada = Boolean(resultado && resultado.exitosos > 0);

  const confirmarAsignacion = async (reemplazoConfirmado = false) => {
    if (!detalle || asignacionCompletada) return;
    const { ajustes, errores } = construirAjustesPlantilla(overrides);
    if (errores.length > 0) {
      // Vuelve al paso 2 con el día y los campos del primer ajuste inválido a la vista.
      setErroresAjustes(errores);
      const primera = errores[0].clave;
      const bloque = detalle.bloques.find((b) =>
        b.ejercicios.some((ej) => claveOverrideEjercicio(b.diaId, ej.ejercicioId, ej.nombre) === primera)
      );
      if (bloque) setDiaAbierto(bloque.diaId);
      setAjustando((previos) => new Set(previos).add(primera));
      setPaso('revisar');
      triggerHaptic('warning');
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
