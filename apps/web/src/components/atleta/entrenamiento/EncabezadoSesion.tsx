import { MotivoOmision, type SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { formatFechaCalendario } from '../../../lib/date-format';

export interface EncabezadoSesionProps {
  sesion: SesionEntrenamientoDetalleDTO;
  rangoHorario: string | null;
  completada: boolean;
  enProgreso: boolean;
  omitida: boolean;
}

/** Encabezado de sesión: badge de estado + fecha + h1 (ÚNICO, ancla de specs). */
export function EncabezadoSesion({
  sesion,
  rangoHorario,
  completada,
  enProgreso,
  omitida,
}: EncabezadoSesionProps) {
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
            completada
              ? 'bg-success/15 text-success border border-success/20'
              : enProgreso
              ? 'bg-primary/15 text-primary border border-primary/20'
              : omitida
              ? 'bg-warning/15 text-warning border border-warning/25'
              : 'bg-secondary text-muted-foreground border border-border'
          }`}
        >
          {completada
            ? 'Completada'
            : enProgreso
            ? 'En progreso'
            : omitida
            ? sesion.motivoOmision === MotivoOmision.DESCANSO
              ? 'Descansado'
              : 'Incompleto'
            : 'Planificada'}
        </span>
        <span className="text-xs text-muted-foreground font-mono">
          {formatFechaCalendario(sesion.fechaProgramada) ?? sesion.fechaProgramada}
        </span>
        {rangoHorario && (
          <span className="text-xs text-muted-foreground">· {rangoHorario}</span>
        )}
        {sesion.esDiaDescansoOriginal && (
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/25 flex items-center gap-1">
            Hecho en tu día de descanso
          </span>
        )}
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
        Tu entrenamiento de hoy
      </h1>
    </div>
  );
}
