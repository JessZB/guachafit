/**
 * Módulo 6 · Nutrición: historial de los últimos 7 días (contexto de la tira semanal).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (SL1, fase B) con el mismo fetch manual (R9).
 * §6: un fallo deja la tira vacía sin ruido (el reporte de hoy tiene su propio aviso honesto).
 */
import { useCallback, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { checkinsNutricionalesDemo } from '../../../lib/demo-nutricion';
import { sumarDiasCalendario } from '../../../lib/date-format';
import type { CheckinNutricionalDetalleDTO } from '@guachafit/shared';

export interface HistorialNutricional {
  historial: CheckinNutricionalDetalleDTO[];
  cargarHistorial: () => Promise<void>;
}

export function useHistorialNutricional(
  isDemoMode: boolean,
  alumnoId: string | undefined,
  hoyLocal: string,
  ahora: Date
): HistorialNutricional {
  // §6: últimos días para reflejar el estado derivado `No reportado` en la propia vista del alumno.
  const [historial, setHistorial] = useState<CheckinNutricionalDetalleDTO[]>([]);

  const cargarHistorial = useCallback(async () => {
    if (!alumnoId) return;
    const desde = sumarDiasCalendario(hoyLocal, -6);
    if (isDemoMode) {
      setHistorial(checkinsNutricionalesDemo(alumnoId, ahora));
      return;
    }
    try {
      const data = await apiClient<CheckinNutricionalDetalleDTO[]>(
        `/nutricion/alumnos/${alumnoId}/checkins?desde=${desde}&hasta=${hoyLocal}`
      );
      setHistorial(Array.isArray(data) ? data : []);
    } catch {
      // El historial es contexto, no el reporte: un fallo deja la tira vacía sin ruido
      // (el reporte de hoy, que es el dato crítico, tiene su propio aviso honesto).
      setHistorial([]);
    }
  }, [isDemoMode, alumnoId, hoyLocal, ahora]);

  return { historial, cargarHistorial };
}
