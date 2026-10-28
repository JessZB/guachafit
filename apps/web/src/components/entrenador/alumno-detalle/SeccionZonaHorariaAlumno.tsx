/**
 * Sección de zona horaria del alumno en la pestaña Perfil, ADR-019.
 *
 * Movida desde el panel de nutrición (ya no vive allí): la zona la edita el entrenador en Perfil
 * y las fechas de cuotas y reportes de nutrición se calculan con ella. Las mediciones antropométricas
 * usan `usuarios.timezone` en el servidor, no esta zona. Presentacional (R1): recibe la zona ya
 * resuelta y el resto como props, no pide datos.
 */
import { Clock } from 'lucide-react';
import { ZonaHorariaPerfil } from '../../common/ZonaHorariaPerfil';

export function SeccionZonaHorariaAlumno({
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
        Las fechas de sus cuotas y reportes de nutrición se calculan en esta zona.
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
