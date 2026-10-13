/**
 * Módulo 6 · Nutrición: metas RN-01 del coach (carga con el mismo fetch manual, R9).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (SL1, fase B). §6: estados honestos
 * (carga / error con reintento / vacío "sin metas configuradas", que rinde el componente).
 */
import { useCallback, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { crearMetasNutricionalesDemo } from '../../../lib/demo-nutricion';
import type { MetasNutricionalesDetalleDTO } from '@guachafit/shared';

export interface MetasNutricionales {
  metas: MetasNutricionalesDetalleDTO | null;
  isCargandoMetas: boolean;
  metasError: string | null;
  cargarMetas: () => Promise<void>;
}

export function useMetasNutricionales(
  isDemoMode: boolean,
  alumnoId: string | undefined,
  ahora: Date
): MetasNutricionales {
  // RN-01: metas del coach para mostrar objetivos y evaluar la tolerancia del día.
  const [metas, setMetas] = useState<MetasNutricionalesDetalleDTO | null>(null);
  const [isCargandoMetas, setIsCargandoMetas] = useState(false);
  const [metasError, setMetasError] = useState<string | null>(null);

  const cargarMetas = useCallback(async () => {
    // Modo demo explícito: metas de ejemplo solo con la bandera activa.
    if (isDemoMode) {
      setMetas(crearMetasNutricionalesDemo(alumnoId || 'demo-alumno', ahora));
      setMetasError(null);
      return;
    }
    setIsCargandoMetas(true);
    setMetasError(null);
    try {
      // 204 (sin metas) llega como null: estado honesto "sin metas configuradas".
      const data = await apiClient<MetasNutricionalesDetalleDTO | null>('/nutricion/metas');
      setMetas(data ?? null);
    } catch (err: unknown) {
      setMetas(null);
      const mensaje = err instanceof Error ? err.message : null;
      setMetasError(
        mensaje || 'No se pudieron cargar tus metas. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setIsCargandoMetas(false);
    }
  }, [isDemoMode, alumnoId, ahora]);

  return { metas, isCargandoMetas, metasError, cargarMetas };
}
