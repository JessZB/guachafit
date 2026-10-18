/**
 * Hook de ajustes por ejercicio compartido por la asignación individual
 * (`use-asignacion-plantilla`) y la masiva (`AsignacionMasivaPlantilla`, lote E10).
 *
 * Guarda los overrides, los errores de confirmación y qué ejercicios muestran sus campos
 * de ajuste. Qué días están abiertos lo decide cada flujo: aquí solo se pide abrir uno con
 * `abrirDia`. La validación y el mapeo al contrato viven en `lib/plantillas-rutina`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AjusteEjercicioPlantillaDTO,
  BloqueDiaRutinaDTO,
  PlantillaRutinaDTO,
} from '@guachafit/shared';
import { triggerHaptic } from '../../../lib/haptics';
import {
  aplicarOverridesPreview,
  claveOverrideEjercicio,
  construirAjustesPlantilla,
  overrideTieneCambios,
  validarOverrideEjercicio,
  type ErrorAjuste,
  type OverrideAjusteEjercicio,
} from '../../../lib/plantillas-rutina';
import type { CampoAjusteCampo } from './CampoAjuste';

type EjercicioPlantilla = BloqueDiaRutinaDTO['ejercicios'][number];

export function useAjustesPlantilla({
  detalle,
  idBase,
  enRevision,
  abrirDia,
}: {
  detalle: PlantillaRutinaDTO | null;
  idBase: string;
  /** `true` mientras se ve el paso de revisión (el resumen de errores recibe el foco). */
  enRevision: boolean;
  abrirDia: (diaId: string) => void;
}) {
  const [overrides, setOverrides] = useState<Record<string, OverrideAjusteEjercicio>>({});
  const [erroresAjustes, setErroresAjustes] = useState<ErrorAjuste[]>([]);
  const [ajustando, setAjustando] = useState<Set<string>>(() => new Set());
  const refResumenErrores = useRef<HTMLDivElement>(null);

  /** Descarta todos los ajustes (al elegir otra plantilla). */
  const reiniciarAjustes = () => {
    setOverrides({});
    setErroresAjustes([]);
    setAjustando(new Set());
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
      abrirDia(bloque.diaId);
      setAjustando((previos) => new Set(previos).add(clave));
      window.setTimeout(() => document.getElementById(`${idBase}-${bloque.diaId}-${ejIdx}-${campo}`)?.focus(), 0);
      return;
    }
  };

  // Resumen de errores enfocable: al aparecer recibe el foco para que se lea primero.
  useEffect(() => {
    if (enRevision && erroresAjustes.length > 0) refResumenErrores.current?.focus();
  }, [enRevision, erroresAjustes]);

  const ajustesPendientes = useMemo(
    () => Object.values(overrides).filter(overrideTieneCambios).length,
    [overrides]
  );

  /**
   * Valida los ajustes antes de asignar. Si alguno es inválido guarda los errores, abre el día y
   * los campos del primero y devuelve `null` (el flujo vuelve al paso de revisión); si no,
   * devuelve los ajustes listos para el contrato.
   */
  const prepararAjustes = (): AjusteEjercicioPlantillaDTO[] | null => {
    const { ajustes, errores } = construirAjustesPlantilla(overrides);
    if (errores.length === 0) return ajustes;
    setErroresAjustes(errores);
    const primera = errores[0].clave;
    const bloque = detalle?.bloques.find((b) =>
      b.ejercicios.some((ej) => claveOverrideEjercicio(b.diaId, ej.ejercicioId, ej.nombre) === primera)
    );
    if (bloque) abrirDia(bloque.diaId);
    setAjustando((previos) => new Set(previos).add(primera));
    triggerHaptic('warning');
    return null;
  };

  return {
    overrides,
    erroresAjustes,
    setErroresAjustes,
    ajustando,
    bloquesPreview,
    ajustesPendientes,
    refResumenErrores,
    reiniciarAjustes,
    actualizarOverride,
    limpiarOverride,
    alternarAjuste,
    irAlCampoConError,
    prepararAjustes,
  };
}
