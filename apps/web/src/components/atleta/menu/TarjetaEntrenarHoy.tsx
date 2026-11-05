import React from 'react';
import { Link } from 'react-router-dom';
import { useTransicionVista } from '../../../lib/use-transicion-vista';
import {
  Dumbbell,
  Zap,
  Calendar,
  ArrowUpRight,
  ChevronRight,
} from 'lucide-react';
import type { SemanaEntrenamientoProgresoDTO } from '@guachafit/shared';
import type { BloqueoAlumno } from '../../../lib/acceso-alumno';
import { formatearProgresoDias, formatearTituloSemana } from '../../../lib/entrenamiento-textos';
import {
  derivarEstadoEntrenamientoHoy,
  type EstadoEntrenamientoHoy,
} from './use-resumen-menu';

export interface TarjetaEntrenarHoyProps {
  semanaProgreso: SemanaEntrenamientoProgresoDTO | null;
  bloqueo: BloqueoAlumno | null;
  cargandoSemana: boolean;
  errorSemana: boolean;
}

const CLASES_TONO_PUNTO: Record<EstadoEntrenamientoHoy['tono'], string> = {
  warning: 'bg-warning',
  info: 'bg-info',
  success: 'bg-success',
  neutral: 'bg-muted-foreground/50',
};

/**
 * MEN-01, MEN-02, MEN-06: Tarjeta principal de acción ("¡A entrenar!").
 * Muestra el estado real del entrenamiento de hoy y barra de progreso semanal accesible.
 */
export function TarjetaEntrenarHoy({
  semanaProgreso,
  bloqueo,
  cargandoSemana,
  errorSemana,
}: TarjetaEntrenarHoyProps) {
  const viewTransition = useTransicionVista();
  const estadoHoy = derivarEstadoEntrenamientoHoy({
    bloqueo,
    cargandoSemana,
    errorSemana,
    semanaProgreso,
  });

  const porcentaje = semanaProgreso
    ? Math.min(100, Math.max(0, Math.round(parseFloat(semanaProgreso.porcentajeCumplimiento) || 0)))
    : 0;

  const puntoColor = CLASES_TONO_PUNTO[estadoHoy.tono];

  return (
    <Link
      viewTransition={viewTransition}
      to="/app/hoy"
      className="sm:col-span-2 group relative block overflow-hidden p-6 rounded-3xl bg-gradient-to-br from-card/90 via-card/60 to-primary/10 border-2 border-primary/40 hover:border-primary/80 transition-all duration-200 shadow-lg hover:shadow-primary/5 cursor-pointer active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl -z-10 group-hover:bg-primary/20 transition-all" />

      <div className="flex items-start justify-between">
        <div className="p-3 rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
          <Dumbbell className="h-7 w-7" aria-hidden="true" />
        </div>
        {semanaProgreso && semanaProgreso.totalBloques > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-primary/20 text-primary border border-primary/30">
            <Zap className="h-3 w-3" aria-hidden="true" />
            <span>
              {formatearProgresoDias(semanaProgreso.bloquesCompletados, semanaProgreso.totalBloques)}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/20 text-primary border border-primary/30">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            Rutina de hoy
          </span>
        )}
      </div>

      <div className="mt-4">
        <h2 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
          ¡A entrenar!
          <ArrowUpRight
            className="h-5 w-5 text-primary opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
            aria-hidden="true"
          />
        </h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          Abre tu entrenamiento de hoy y anota series, pesos y descansos sin interrupciones.
        </p>
      </div>

      {semanaProgreso && semanaProgreso.totalBloques > 0 && (
        <div className="mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center justify-between text-xs font-mono text-muted-foreground mb-1.5">
            <span className="font-semibold text-foreground">
              {formatearTituloSemana(semanaProgreso.inicioSemana, semanaProgreso.finSemana)}
            </span>
            <span className="font-bold text-primary">
              {semanaProgreso.bloquesCompletados === semanaProgreso.totalBloques
                ? '100% completado'
                : formatearProgresoDias(semanaProgreso.bloquesCompletados, semanaProgreso.totalBloques)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Cumplimiento semanal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={porcentaje}
            className="w-full h-1.5 rounded-full bg-secondary overflow-hidden"
          >
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{
                width: `${porcentaje}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between pt-3 border-t border-border/60">
        <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${puntoColor}`} />
          {estadoHoy.texto}
        </span>
        <span className="text-xs font-bold text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
          Empezar ahora <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
