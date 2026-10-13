/**
 * Calendario de check-in antropométrico del alumno (organismo ÚNICO candidato).
 *
 * Presentacional: periodicidad, ancla, lectura de ventana y callbacks por props (R1).
 * Extraído de `pages/entrenador/AlumnoDetallePage.tsx` (SL-5). La ventana de check-in se
 * muestra también en `ProgresoPage.tsx:517-536` con markup distinto (la lógica ya es
 * compartida en `lib/antropometria-ventana`); ante la duda, único.
 *
 * §6: `min-h-11` en los campos, 11px mínimo, pesos ≤ 700, tokens con variante oscura,
 * error honesto (`role="alert"`).
 */
import type React from 'react';
import { AlertCircle, CalendarClock, CheckCircle2 } from 'lucide-react';
import { PeriodicidadAntropometria, type PerfilAlumnoDetalleDTO } from '@guachafit/shared';
import { formatFechaCalendario, fechaCalendarioLocal } from '../../../lib/date-format';
import { calcularEstadoVentanaCheckinAntropometrico } from '../../../lib/antropometria-ventana';
import type { RetornoCalendarioAntropometrico } from './use-calendario-antropometrico';

export interface CalendarioCheckinAntropometricoProps {
  /** Perfil guardado (la ventana se lee de lo GUARDADO, nunca del formulario sin guardar). */
  alumno: PerfilAlumnoDetalleDTO | null;
  periodicidad: PeriodicidadAntropometria | '';
  inicio: string;
  onCambiarPeriodicidad: (valor: PeriodicidadAntropometria | '') => void;
  onCambiarInicio: (valor: string) => void;
  calendario: RetornoCalendarioAntropometrico;
}

export function CalendarioCheckinAntropometrico({
  alumno,
  periodicidad,
  inicio,
  onCambiarPeriodicidad,
  onCambiarInicio,
  calendario,
}: CalendarioCheckinAntropometricoProps) {
  // RF-003 RN-01 (WU RF-003b): lectura del calendario GUARDADO del alumno (no del formulario sin
  // guardar) para mostrar próxima fecha y estado de ventana sin afirmar nada que no esté en BD.
  const estadoVentana = calcularEstadoVentanaCheckinAntropometrico({
    periodicidad: alumno?.periodicidadAntropometria ?? null,
    antropometriaInicio: alumno?.antropometriaInicio ?? null,
    hoyLocal: fechaCalendarioLocal(),
  });
  const { calendarioError: error, calendarioSuccess: exito, isGuardandoCalendario: guardando } =
    calendario;
  const onGuardar = calendario.guardarCalendario;
  return (
    <form
      onSubmit={onGuardar}
      className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <div>
            <h3 className="font-bold text-sm text-foreground">
              Calendario de Check-in Antropométrico
            </h3>
            <p className="text-xs text-muted-foreground">
              Fija cada cuánto toca control y desde qué fecha se cuenta el calendario.
            </p>
          </div>
        </div>
        {estadoVentana.aplica && (
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full border uppercase shrink-0 ${
              estadoVentana.estado === 'abierta'
                ? 'bg-success/15 text-success border-success/20'
                : estadoVentana.estado === 'cerrada'
                  ? 'bg-warning/15 text-warning border-warning/20'
                  : 'bg-info/15 text-info border-info/20'
            }`}
          >
            {estadoVentana.estado === 'abierta'
              ? 'Ventana abierta hoy'
              : estadoVentana.estado === 'cerrada'
                ? 'Ventana cerrada'
                : 'Aún no abre'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            className="text-xs font-semibold text-muted-foreground"
            htmlFor="periodicidad-antropometria"
          >
            Periodicidad
          </label>
          <select
            id="periodicidad-antropometria"
            value={periodicidad}
            onChange={(e) =>
              onCambiarPeriodicidad(e.target.value as PeriodicidadAntropometria | '')
            }
            className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary cursor-pointer"
          >
            <option value="">Sin calendario</option>
            <option value={PeriodicidadAntropometria.SEMANAL}>Semanal</option>
            <option value={PeriodicidadAntropometria.QUINCENAL}>Quincenal</option>
            <option value={PeriodicidadAntropometria.MENSUAL}>Mensual</option>
          </select>
          <p className="text-[11px] text-muted-foreground">
            Sin calendario, el alumno remoto conserva el registro libre (sin ventana).
          </p>
        </div>
        <div className="space-y-1">
          <label
            className="text-xs font-semibold text-muted-foreground"
            htmlFor="antropometria-inicio"
          >
            Fecha de inicio del calendario
          </label>
          <input
            id="antropometria-inicio"
            type="date"
            value={inicio}
            onChange={(e) => onCambiarInicio(e.target.value)}
            className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
          />
          <p className="text-[11px] text-muted-foreground">
            Día local del alumno desde el que se cuentan las fechas programadas.
          </p>
        </div>
      </div>

      {/* Lectura del calendario GUARDADO: próxima fecha y ventana vigente/próxima. */}
      {estadoVentana.aplica ? (
        <div className="p-3.5 rounded-2xl bg-secondary/30 border border-border/70 text-xs space-y-1">
          <p className="text-muted-foreground">
            Próxima fecha programada:{' '}
            <span className="font-mono font-bold text-foreground">
              {estadoVentana.proximaFechaProgramada
                ? formatFechaCalendario(estadoVentana.proximaFechaProgramada) ??
                  estadoVentana.proximaFechaProgramada
                : '—'}
            </span>
          </p>
          {estadoVentana.estado === 'abierta' &&
            estadoVentana.ventanaVigente && (
              <p className="text-success font-semibold">
                Ventana abierta hasta el{' '}
                {formatFechaCalendario(estadoVentana.ventanaVigente.hasta) ??
                  estadoVentana.ventanaVigente.hasta}{' '}
                (fechas locales).
              </p>
            )}
          {estadoVentana.proximaVentana && (
            <p className="text-muted-foreground">
              Próxima ventana:{' '}
              <span className="font-semibold text-foreground">
                del{' '}
                {formatFechaCalendario(estadoVentana.proximaVentana.desde) ??
                  estadoVentana.proximaVentana.desde}{' '}
                al{' '}
                {formatFechaCalendario(estadoVentana.proximaVentana.hasta) ??
                  estadoVentana.proximaVentana.hasta}
              </span>{' '}
              (fechas locales).
            </p>
          )}
          {estadoVentana.ultimaVentanaVencida && (
            <p className="text-muted-foreground">
              Última ventana:{' '}
              <span className="font-semibold text-foreground">
                del{' '}
                {formatFechaCalendario(estadoVentana.ultimaVentanaVencida.desde) ??
                  estadoVentana.ultimaVentanaVencida.desde}{' '}
                al{' '}
                {formatFechaCalendario(estadoVentana.ultimaVentanaVencida.hasta) ??
                  estadoVentana.ultimaVentanaVencida.hasta}
              </span>
              .
            </p>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Sin calendario configurado: el alumno remoto no tiene ventana de check-in ni
          recordatorio de las 06:00.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="text-xs font-bold text-destructive flex items-start gap-1.5"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </p>
      )}
      {exito && (
        <p className="text-xs font-bold text-success flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" />
          {exito}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={guardando}
          className="min-h-11 py-2.5 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
        >
          {guardando ? 'Guardando calendario...' : 'Guardar Calendario'}
        </button>
      </div>
    </form>
  );
}
