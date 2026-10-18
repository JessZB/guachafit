/**
 * Lote E10 · módulo `asignacion-masiva-plantilla` (hook de estado).
 *
 * Pasos de la asignación masiva (elegir alumnos → revisar y ajustar → confirmar), días abiertos
 * del acordeón y ajustes comunes a todos los alumnos (`use-ajustes-plantilla`, compartido con la
 * asignación individual). Volver atrás conserva la selección y los ajustes.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PlantillaRutinaDTO } from '@guachafit/shared';
import { PASOS_ASIGNACION_MASIVA, type PasoAsignacion } from '../../../lib/asignacion-pasos';
import { useAjustesPlantilla } from '../selector-plantilla-asignacion/use-ajustes-plantilla';

export function usePasosAsignacionMasiva({ detalle }: { detalle: PlantillaRutinaDTO | null }) {
  const [paso, setPaso] = useState<PasoAsignacion>('alumnos');
  // Todos los días empiezan abiertos (se ven todos los ejercicios); se guarda cuáles se cierran.
  const [diasCerrados, setDiasCerrados] = useState<Set<string>>(() => new Set());
  const refTituloPaso = useRef<HTMLParagraphElement>(null);
  const esPrimerPaso = useRef(true);
  const idBase = useId();

  // Al cambiar de paso, el foco va a su título (que además se anuncia): el botón pulsado se
  // desmonta y el foco no debe perderse. El paso inicial conserva el foco del diálogo.
  useEffect(() => {
    if (esPrimerPaso.current) {
      esPrimerPaso.current = false;
      return;
    }
    refTituloPaso.current?.focus();
  }, [paso]);

  const abrirDia = (diaId: string) =>
    setDiasCerrados((previos) => {
      if (!previos.has(diaId)) return previos;
      const siguientes = new Set(previos);
      siguientes.delete(diaId);
      return siguientes;
    });

  const alternarDia = (diaId: string | null) => {
    if (!diaId) return;
    setDiasCerrados((previos) => {
      const siguientes = new Set(previos);
      if (siguientes.has(diaId)) siguientes.delete(diaId);
      else siguientes.add(diaId);
      return siguientes;
    });
  };

  // Se declara tras el efecto del título: al volver a revisar con errores, el foco termina en
  // el resumen de errores.
  const ajustes = useAjustesPlantilla({
    detalle,
    idBase,
    enRevision: paso === 'revisar',
    abrirDia,
  });

  const diasAbiertos = useMemo(
    () =>
      new Set(
        (detalle?.bloques ?? [])
          .map((bloque) => bloque.diaId)
          .filter((diaId) => !diasCerrados.has(diaId))
      ),
    [detalle, diasCerrados]
  );

  const avanzar = () => setPaso(paso === 'alumnos' ? 'revisar' : 'confirmar');
  const retroceder = () => setPaso(paso === 'confirmar' ? 'revisar' : 'alumnos');

  return {
    idBase,
    paso,
    setPaso,
    indicePaso: PASOS_ASIGNACION_MASIVA.indexOf(paso),
    refTituloPaso,
    diasAbiertos,
    alternarDia,
    ajustes,
    avanzar,
    retroceder,
  };
}
