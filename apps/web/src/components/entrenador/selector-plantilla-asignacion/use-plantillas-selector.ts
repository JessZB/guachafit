/**
 * Hook de datos del módulo `selector-plantilla-asignacion` (prompt 71, lote C).
 *
 * Encapsula el mecanismo vigente (R9): `apiClient` + `useState` + `useEffect`,
 * sin TanStack Query. Carga la lista de plantillas activas y el detalle de la
 * elegida; en modo demo usa los fixtures locales sin red.
 */
import { useEffect, useMemo, useState } from 'react';
import type { PlantillaRutinaDTO, PlantillaRutinaResumenDTO } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { detallePlantillaDemo, plantillasDemoActivas } from '../../../lib/demo-plantillas';

export function usePlantillasSelector({ isDemoMode }: { isDemoMode: boolean }) {
  const [plantillas, setPlantillas] = useState<PlantillaRutinaResumenDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const [detalle, setDetalle] = useState<PlantillaRutinaDTO | null>(null);
  const [cargandoDetalleId, setCargandoDetalleId] = useState<string | null>(null);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);

  const cargarPlantillas = async () => {
    setIsLoading(true);
    setErrorCarga(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): mismas plantillas demo del banco, sin llamada API.
    if (isDemoMode) {
      setPlantillas(plantillasDemoActivas());
      setIsLoading(false);
      return;
    }

    try {
      const res = await apiClient<PlantillaRutinaResumenDTO[]>('/plantillas?activa=true');
      setPlantillas(Array.isArray(res) ? res : []);
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : undefined;
      setErrorCarga(mensaje || 'No se pudieron cargar tus plantillas de ejercicios.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void cargarPlantillas();
  }, [isDemoMode]);

  const plantillasFiltradas = useMemo(
    () =>
      plantillas.filter((p) =>
        !busqueda.trim() ? true : p.nombre.toLowerCase().includes(busqueda.toLowerCase())
      ),
    [plantillas, busqueda]
  );

  const seleccionarPlantilla = async (resumen: PlantillaRutinaResumenDTO) => {
    if (cargandoDetalleId) return;
    setErrorDetalle(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): el detalle sale del fixture local, sin llamada API.
    if (isDemoMode) {
      const demoDetalle = detallePlantillaDemo(resumen.id);
      if (!demoDetalle) {
        setDetalle(null);
        setErrorDetalle('No se pudo cargar el detalle de la plantilla.');
        return;
      }
      setDetalle(demoDetalle);
      return;
    }

    setCargandoDetalleId(resumen.id);
    try {
      const detalleRes = await apiClient<PlantillaRutinaDTO>(`/plantillas/${resumen.id}`);
      setDetalle(detalleRes);
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : undefined;
      setDetalle(null);
      setErrorDetalle(mensaje || 'No se pudo cargar el detalle de la plantilla.');
    } finally {
      setCargandoDetalleId(null);
    }
  };

  return {
    plantillas,
    isLoading,
    errorCarga,
    busqueda,
    setBusqueda,
    detalle,
    cargandoDetalleId,
    errorDetalle,
    plantillasFiltradas,
    cargarPlantillas,
    seleccionarPlantilla,
  };
}
