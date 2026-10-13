/**
 * M8 plantillas (fase B, prompt 58) · hook de datos del banco de plantillas.
 *
 * Origen: `PlantillasPage.tsx:92-103, 139-181, 368-424, 426-454` (R9: conserva
 * el mecanismo actual `apiClient` + `useState`/`useEffect`, sin TanStack Query).
 * Único de la vista (R3); consolidable en D con `SelectorPlantillaAsignacion`
 * (fila 33 de la consolidación 48, fuera de superficie en B por R6).
 */
import { useEffect, useState } from 'react';
import type {
  EjercicioCatalogoDetalleDTO,
  PlantillaRutinaDTO,
  PlantillaRutinaResumenDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { triggerHaptic } from '../../../lib/haptics';
import {
  CATALOGO_DEMO,
  PLANTILLAS_DEMO,
  generarIdDemo,
  plantillasDemoResumen,
} from '../../../lib/demo-plantillas';
import type { DatosEjercicioNuevo } from '../BloquesRutinaEditor';

export function usePlantillasBanco(isDemoMode: boolean) {
  const [plantillas, setPlantillas] = useState<PlantillaRutinaResumenDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catalogo, setCatalogo] = useState<EjercicioCatalogoDetalleDTO[]>([]);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);

  // MODO DEMO: detalles locales (fixture + altas/ediciones de la sesión) para editar sin API.
  const [detallesDemo, setDetallesDemo] = useState<Record<string, PlantillaRutinaDTO>>(() =>
    Object.fromEntries(PLANTILLAS_DEMO.map((plantilla) => [plantilla.id, plantilla]))
  );

  const [accionError, setAccionError] = useState<string | null>(null);

  // Confirmación inline de desactivación + acción en curso + detalle en curso.
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [ocupadaId, setOcupadaId] = useState<string | null>(null);
  const [cargandoDetalleId, setCargandoDetalleId] = useState<string | null>(null);

  const cargarPlantillas = async () => {
    setIsLoading(true);
    setError(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): banco de ejemplo solo con la bandera activa.
    if (isDemoMode) {
      setDetallesDemo(Object.fromEntries(PLANTILLAS_DEMO.map((plantilla) => [plantilla.id, plantilla])));
      setPlantillas(plantillasDemoResumen());
      setIsLoading(false);
      return;
    }

    try {
      const res = await apiClient<PlantillaRutinaResumenDTO[]>('/plantillas');
      setPlantillas(Array.isArray(res) ? res : []);
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : null;
      setError(mensaje || 'No se pudieron cargar tus plantillas de ejercicios.');
    } finally {
      setIsLoading(false);
    }
  };

  const cargarCatalogo = async () => {
    setCatalogoError(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): catálogo de ejemplo sin llamada API.
    if (isDemoMode) {
      setCatalogo(CATALOGO_DEMO);
      return;
    }

    try {
      const res = await apiClient<EjercicioCatalogoDetalleDTO[]>('/ejercicios/catalogo');
      setCatalogo(Array.isArray(res) ? res : []);
    } catch {
      setCatalogoError('No se pudo cargar el catálogo de ejercicios. Revisa la conexión.');
    }
  };

  useEffect(() => {
    cargarPlantillas();
    cargarCatalogo();
  }, [isDemoMode]);

  /** Obtiene el detalle para edición (demo local o `GET /plantillas/:id`), o `null` si falla. */
  const obtenerDetalle = async (
    resumen: PlantillaRutinaResumenDTO
  ): Promise<PlantillaRutinaDTO | null> => {
    // MODO DEMO EXPLÍCITO (isDemoMode): el detalle sale del estado local, sin llamada API.
    if (isDemoMode) {
      return detallesDemo[resumen.id] ?? null;
    }

    setCargandoDetalleId(resumen.id);
    try {
      return await apiClient<PlantillaRutinaDTO>(`/plantillas/${resumen.id}`);
    } catch {
      return null;
    } finally {
      setCargandoDetalleId(null);
    }
  };

  /** Cambia activa/inactiva en el banco local del modo demo (listado + detalle). */
  const actualizarActivaLocal = (id: string, activa: boolean) => {
    setPlantillas((prev) => prev.map((p) => (p.id === id ? { ...p, activa } : p)));
    setDetallesDemo((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], activa } } : prev));
  };

  const desactivarPlantilla = async (id: string) => {
    setOcupadaId(id);
    setAccionError(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): desactivación local, sin llamada API.
    if (isDemoMode) {
      actualizarActivaLocal(id, false);
      triggerHaptic('success');
      setOcupadaId(null);
      setConfirmandoId(null);
      return;
    }

    try {
      await apiClient<PlantillaRutinaResumenDTO>(`/plantillas/${id}`, { method: 'DELETE' });
      setPlantillas((prev) => prev.map((p) => (p.id === id ? { ...p, activa: false } : p)));
      triggerHaptic('success');
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : null;
      setAccionError(mensaje || 'No se pudo desactivar la plantilla.');
      triggerHaptic('warning');
    } finally {
      setOcupadaId(null);
      setConfirmandoId(null);
    }
  };

  const reactivarPlantilla = async (id: string) => {
    setOcupadaId(id);
    setAccionError(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): reactivación local, sin llamada API.
    if (isDemoMode) {
      actualizarActivaLocal(id, true);
      triggerHaptic('success');
      setOcupadaId(null);
      return;
    }

    try {
      const res = await apiClient<PlantillaRutinaDTO>(`/plantillas/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activa: true }),
      });
      setPlantillas((prev) => prev.map((p) => (p.id === id ? { ...p, activa: res.activa } : p)));
      triggerHaptic('success');
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : null;
      setAccionError(mensaje || 'No se pudo reactivar la plantilla.');
      triggerHaptic('warning');
    } finally {
      setOcupadaId(null);
    }
  };

  const crearEjercicioEnCatalogo = async (
    datos: DatosEjercicioNuevo
  ): Promise<EjercicioCatalogoDetalleDTO | null> => {
    // MODO DEMO EXPLÍCITO (isDemoMode): alta local en el catálogo de ejemplo, sin API.
    if (isDemoMode) {
      const nuevo: EjercicioCatalogoDetalleDTO = {
        id: generarIdDemo(),
        entrenadorId: null,
        nombre: datos.nombre,
        grupoMuscular: datos.grupoMuscular,
        patronMovimiento: datos.patronMovimiento || null,
        activo: true,
        createdAtUtc: new Date().toISOString(),
      };
      setCatalogo((prev) => [nuevo, ...prev]);
      return nuevo;
    }

    try {
      const res = await apiClient<EjercicioCatalogoDetalleDTO>('/ejercicios/catalogo', {
        method: 'POST',
        body: JSON.stringify(datos),
      });
      setCatalogo((prev) => [res, ...prev]);
      return res;
    } catch {
      return null;
    }
  };

  /** Inserta o reemplaza un resumen al inicio del listado (tras guardar en el formulario). */
  const reponerResumen = (resumen: PlantillaRutinaResumenDTO) => {
    setPlantillas((prev) => [resumen, ...prev.filter((p) => p.id !== resumen.id)]);
  };

  /** Guarda el detalle demo en el banco local (tras guardar en modo demo). */
  const reponerDetalleDemo = (detalle: PlantillaRutinaDTO) => {
    setDetallesDemo((prev) => ({ ...prev, [detalle.id]: detalle }));
  };

  return {
    plantillas,
    isLoading,
    error,
    catalogo,
    catalogoError,
    accionError,
    setAccionError,
    confirmandoId,
    setConfirmandoId,
    ocupadaId,
    cargandoDetalleId,
    cargarPlantillas,
    cargarCatalogo,
    obtenerDetalle,
    desactivarPlantilla,
    reactivarPlantilla,
    crearEjercicioEnCatalogo,
    reponerResumen,
    reponerDetalleDemo,
  };
}

export type UsoPlantillasBanco = ReturnType<typeof usePlantillasBanco>;

