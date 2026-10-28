/**
 * Pestaña Nutrición del alumno: panel de nutrición dentro de la ficha (RF-002).
 *
 * Presentacional: el panel y sus hooks viven en `PanelNutricionAlumno`. Extraída de
 * `pages/entrenador/AlumnoDetallePage.tsx` con el mismo DOM (mismo contenedor de panel APG).
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import type { PerfilAlumnoDetalleDTO } from '@guachafit/shared';
import type { PropsPanel } from '../../../lib/use-tabs-accesibles';
import { PanelNutricionAlumno } from '../PanelNutricionAlumno';

interface PestanaNutricionAlumnoProps {
  propsPanel: PropsPanel;
  alumno: PerfilAlumnoDetalleDTO;
  isDemoMode: boolean;
}

export function PestanaNutricionAlumno({ propsPanel, alumno, isDemoMode }: PestanaNutricionAlumnoProps) {
  return (
    <div {...propsPanel} className="animate-in fade-in-50 duration-200 slide-in-from-bottom-1">
      {/* El endpoint de check-ins usa `usuarios.id` (alumno.usuarioId), no el id del perfil. */}
      <PanelNutricionAlumno
        alumnoUsuarioId={alumno.usuarioId}
        zonaHoraria={alumno.zonaHoraria}
        isDemoMode={isDemoMode}
      />
    </div>
  );
}
