import { useCallback, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../../lib/acceso-alumno';
import { guardarSemanaCacheada } from '../../../lib/offline-db';
import type { SemanaEntrenamientoProgresoDTO } from '@guachafit/shared';

interface OpcionesSemana {
  isDemoMode: boolean;
  tz: string;
  userId?: string;
  onBloqueo: (bloqueo: BloqueoAlumno) => void;
}

/** `semanaProgreso` + `refreshSemana` (refresco best-effort que no rompe la vista). */
export function useSemanaEntrenamiento({ isDemoMode, tz, userId, onBloqueo }: OpcionesSemana) {
  const [semanaProgreso, setSemanaProgreso] = useState<SemanaEntrenamientoProgresoDTO | null>(null);

  const refreshSemana = useCallback(async () => {
    if (isDemoMode) return;
    try {
      const progreso = await apiClient<SemanaEntrenamientoProgresoDTO>(
        `/alumnos/me/rutina/semana-actual?timezone=${encodeURIComponent(tz)}`
      );
      if (progreso) {
        setSemanaProgreso(progreso);
        if (userId) await guardarSemanaCacheada(userId, progreso).catch(() => {});
      }
    } catch (err) {
      // Refresco best-effort: no rompe la vista actual. Un bloqueo de ciclo de vida sí se muestra.
      const bloqueoDetectado = resolverBloqueoAlumno(err);
      if (bloqueoDetectado) onBloqueo(bloqueoDetectado);
    }
  }, [isDemoMode, tz, userId, onBloqueo]);

  return { semanaProgreso, setSemanaProgreso, refreshSemana };
}
