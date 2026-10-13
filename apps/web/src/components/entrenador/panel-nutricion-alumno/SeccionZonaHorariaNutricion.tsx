/**
 * Sección de zona horaria del panel de nutrición del alumno, ADR-019 (Ola 2).
 *
 * Recorte verbatim de `PanelNutricionAlumno.tsx`. Presentacional (R1): recibe
 * la zona ya resuelta y el resto como props, no pide datos.
 */
import { ZonaHorariaPerfil } from '../../common/ZonaHorariaPerfil';
import { HORARIO_VENTANA_CHECKIN } from '../../../lib/nutricion-checkin';
import { horaDeZona } from '../../../lib/zona-horaria';
import { Clock } from 'lucide-react';

export function SeccionZonaHorariaNutricion({
  zonaHorariaAlumno,
  alumnoPerfilId,
  isDemoMode,
  onZonaHorariaGuardada,
}: {
  zonaHorariaAlumno: string;
  alumnoPerfilId?: string;
  isDemoMode: boolean;
  onZonaHorariaGuardada?: (zonaHoraria: string) => void;
}) {
  return (
    <section
      aria-labelledby="titulo-zona-horaria-alumno"
      className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-3"
    >
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-primary" />
        <h3 id="titulo-zona-horaria-alumno" className="font-bold text-sm text-foreground">
          Zona horaria del alumno
        </h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Su reporte se abre de {HORARIO_VENTANA_CHECKIN} en {horaDeZona(zonaHorariaAlumno)}, y las
        horas de registro se muestran en esa zona.
      </p>
      {alumnoPerfilId && (
        <ZonaHorariaPerfil
          id="zona-horaria-alumno"
          zonaActual={zonaHorariaAlumno}
          endpoint={`/alumnos/${alumnoPerfilId}`}
          modoDemo={isDemoMode}
          onGuardada={onZonaHorariaGuardada}
        />
      )}
    </section>
  );
}
