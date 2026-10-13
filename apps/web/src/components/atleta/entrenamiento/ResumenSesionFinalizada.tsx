import { AlertTriangle, Award, MessageSquare, RotateCcw } from 'lucide-react';
import { MotivoOmision, type SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { pluralizar } from '../../../lib/pluralizar';
import { formatearNotasParaAlumno } from '../../../lib/entrenamiento-textos';
import { formatDuracionMinutos } from '../../../lib/date-format';
import type { FeedbackCierre } from './use-cierre-sesion';

export interface ResumenSesionFinalizadaProps {
  sesion: SesionEntrenamientoDetalleDTO;
  omitida: boolean;
  pendienteSync: boolean;
  finishFeedback: FeedbackCierre | null;
  rangoHorario: string | null;
  deshabilitadoRepetir: boolean;
  puedeRepetir: boolean;
  onRepetir: () => void;
}

/** Banner fin/omitida + notas al coach + repetir (ÚNICO: solo esta vista). */
export function ResumenSesionFinalizada({
  sesion,
  omitida,
  pendienteSync,
  finishFeedback,
  rangoHorario,
  deshabilitadoRepetir,
  puedeRepetir,
  onRepetir,
}: ResumenSesionFinalizadaProps) {
  return (
    <div className="space-y-3">
      <div
        className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
          omitida
            ? 'bg-warning/10 border-warning/25 text-warning'
            : 'bg-success/10 border-success/20 text-success'
        }`}
      >
        {omitida ? (
          <AlertTriangle className="h-6 w-6 shrink-0" />
        ) : (
          <Award className="h-6 w-6 shrink-0" />
        )}
        <div>
          <p className="text-xs font-bold">
            {omitida
              ? sesion.motivoOmision === MotivoOmision.DESCANSO
                ? 'Día registrado como descansado'
                : 'Día registrado como incompleto'
              : '¡Sesión de entrenamiento finalizada con éxito!'}
          </p>
          <p className={`text-xs ${omitida ? 'text-warning/90' : 'text-success/80'}`}>
            {omitida
              ? 'No suma racha. Puedes repetir el entrenamiento cuando quieras: el historial de este día se conserva.'
              : pendienteSync
              ? 'Guardamos tu entrenamiento en este teléfono. Se enviará a tu entrenador cuando vuelvas a tener internet.'
              : finishFeedback
              ? finishFeedback.cumpleRacha
                ? `Sumaste un día a tu racha. Racha: ${pluralizar(finishFeedback.nuevaRacha, 'día', 'días')}.`
                : 'Sesión guardada. Completa al menos el 70% del plan para sumar racha.'
              : 'Sesión guardada en tu historial.'}
          </p>
          {(formatDuracionMinutos(sesion.duracionMinutos) || rangoHorario) && (
            <p
              className={`text-xs mt-0.5 font-medium ${
                omitida ? 'text-warning/80' : 'text-success/80'
              }`}
            >
              {formatDuracionMinutos(sesion.duracionMinutos)
                ? `Duración: ${formatDuracionMinutos(sesion.duracionMinutos)}`
                : ''}
              {formatDuracionMinutos(sesion.duracionMinutos) && rangoHorario ? ' · ' : ''}
              {rangoHorario ? `Horario: ${rangoHorario}` : ''}
            </p>
          )}
        </div>
      </div>

      {sesion.notasAlumno && (
        <div className="p-3.5 rounded-2xl bg-secondary/50 border border-border/80 text-xs space-y-1">
          <span className="font-bold text-muted-foreground text-[11px] uppercase tracking-wider flex items-center gap-1.5">
            <MessageSquare className="h-3 w-3 text-primary" />
            Lo que le contaste a tu entrenador:
          </span>
          <p className="text-foreground font-medium">
            {formatearNotasParaAlumno(sesion.notasAlumno)}
          </p>
        </div>
      )}

      <div className="pt-2 flex items-center justify-end">
        <button
          type="button"
          disabled={deshabilitadoRepetir || !puedeRepetir}
          onClick={onRepetir}
          className="min-h-11 text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1.5 py-1.5 px-3.5 rounded-xl bg-secondary/80 hover:bg-secondary border border-border/60 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5 text-primary" />
          <span>Repetir entrenamiento</span>
        </button>
      </div>
    </div>
  );
}
