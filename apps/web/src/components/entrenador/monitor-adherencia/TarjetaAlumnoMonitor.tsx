/**
 * Módulo `monitor-adherencia` · tarjeta de alumno del monitor semanal.
 *
 * Extraída verbatim de `pages/entrenador/MonitorAdherenciaPage.tsx:742-874`
 * (item del listado en orden de riesgo del endpoint).
 * Clasificación: ÚNICO (tarjeta de dominio solo de esta vista; la tarjeta del
 * directorio `TarjetaAlumnoDirectorio` muestra otra entidad visual, R3).
 *
 * UX-14 (SEG-12, 15, 16, 19): la acción principal es el nombre (`<button>` con enlace
 * extendido `after:`, que cubre la tarjeta). El article no lleva `onClick` ni `title`.
 * El chevrón (enlace a la ficha) y el botón "Ver últimas sesiones en detalle" van por
 * encima (`z-10`); los contenedores no interactivos dejan pasar el clic (`pointer-events-none`).
 * El estado usa `BadgeEstado` y la racha solo aparece con días > 0.
 *
 * §6: áreas táctiles de 44px (`min-h-11`), texto ≥ 11px, pesos ≤ 700, tokens con variante claro/oscuro.
 * Presentacional: solo props y callbacks, sin `useQuery` ni `api-client` (R1).
 */

import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, ChevronRight, Flame, History } from 'lucide-react';
import type { MonitorAdherenciaSemanalDTO } from '@guachafit/shared';
import { triggerHaptic } from '../../../lib/haptics';
import { formatFechaHoraLocal } from '../../../lib/date-format';
import { pluralizar } from '../../../lib/pluralizar';
import { etiquetaMonitorAdherencia, rutaExpedienteMonitor } from '../../../lib/adherencia';
import {
  CLASES_TONO,
  iniciales,
  porcentajeSeguro,
} from '../../../lib/monitor-adherencia-presentacion';
import { BadgeEstado } from '../../ui/BadgeEstado';

export interface TarjetaAlumnoMonitorProps {
  alumno: MonitorAdherenciaSemanalDTO;
  onVerActividad: (alumno: MonitorAdherenciaSemanalDTO) => void;
}

export function TarjetaAlumnoMonitor({ alumno, onVerActividad }: TarjetaAlumnoMonitorProps) {
  const conPlan = alumno.tienePlanActivo;
  const etiqueta = etiquetaMonitorAdherencia(alumno);
  const tono = CLASES_TONO[etiqueta.tono];
  const porcentaje = porcentajeSeguro(alumno.porcentajeCumplimientoSemanal);
  const ultimaSesion = formatFechaHoraLocal(alumno.ultimaSesionUtc);
  const inactivo = conPlan && alumno.diasInactivo > 4;

  return (
    <article className="relative group p-5 rounded-3xl bg-card border border-border/80 shadow-xs hover:border-primary/40 transition-colors space-y-4">
      <div className="pointer-events-none flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 rounded-2xl bg-secondary/80 border border-border/70 flex items-center justify-center text-primary font-bold text-sm shrink-0">
            {iniciales(alumno.nombreCompleto)}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-foreground line-clamp-2 break-words">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onVerActividad(alumno);
                }}
                aria-haspopup="dialog"
                className="pointer-events-auto cursor-pointer text-left max-w-full rounded-md group-hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-primary after:absolute after:inset-0 after:rounded-3xl after:content-['']"
              >
                {alumno.nombreCompleto}
              </button>
            </h3>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <BadgeEstado tono={etiqueta.tono}>
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${tono.punto} ${
                    etiqueta.tono === 'danger' ? 'motion-safe:animate-pulse' : ''
                  }`}
                />
                {etiqueta.texto}
              </BadgeEstado>
              {conPlan && alumno.rachaDiasConsecutivos > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full border border-border/60">
                  <Flame className="h-3 w-3 text-warning" />
                  Racha: {alumno.rachaDiasConsecutivos}{' '}
                  {alumno.rachaDiasConsecutivos === 1 ? 'día' : 'días'}
                </span>
              )}
              {inactivo && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-danger bg-danger/10 px-2 py-0.5 rounded-full border border-danger/30">
                  <AlertTriangle className="h-3 w-3" />
                  {pluralizar(alumno.diasInactivo, 'día sin entrenar', 'días sin entrenar')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <span className="text-[11px] font-mono font-bold text-muted-foreground flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            {ultimaSesion ? `Última sesión: ${ultimaSesion}` : 'Sin sesiones registradas'}
          </span>
          <Link
            to={rutaExpedienteMonitor(alumno.alumnoPerfilId)}
            className="pointer-events-auto relative z-10 min-h-11 min-w-11 flex items-center justify-center p-2 rounded-xl bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/60 transition-colors focus-visible:outline-2 focus-visible:outline-primary"
            title={`Abrir el expediente de ${alumno.nombreCompleto}`}
            aria-label={`Abrir el expediente de ${alumno.nombreCompleto}`}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Sesiones completadas vs prescritas */}
      {conPlan ? (
        alumno.sinPendientesSemana ? (
          <p className="pointer-events-none text-xs text-muted-foreground flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            Al día — sin pendientes esta semana: aún no vence ningún bloque de su plan.
          </p>
        ) : (
          <div className="pointer-events-none space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-foreground">
                {alumno.sesionesCompletadas}/
                {pluralizar(alumno.sesionesPrescritas, 'sesión completada', 'sesiones completadas')}
              </span>
              <span className={`font-mono font-bold ${tono.texto}`}>
                {alumno.porcentajeCumplimientoSemanal}%
              </span>
            </div>
            <div
              className="h-2 rounded-full bg-secondary overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={porcentaje}
              aria-label={`Adherencia semanal de ${alumno.nombreCompleto}`}
            >
              <div
                className={`h-full rounded-full ${tono.barra} transition-all duration-300`}
                style={{ width: `${porcentaje}%` }}
              />
            </div>
          </div>
        )
      ) : (
        <p className="pointer-events-none text-xs text-muted-foreground flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
          Sin rutina activa: asígnale una planificación para calcular su adherencia
          semanal.
        </p>
      )}

      {/* Acceso por teclado y AT al modal de actividad (además del nombre). Va por encima del
          enlace extendido para responder a su propio clic. */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          onVerActividad(alumno);
        }}
        aria-haspopup="dialog"
        className="relative z-10 pointer-events-auto flex min-h-11 w-full items-center gap-1.5 rounded-xl border border-transparent px-2 text-[11px] font-bold text-muted-foreground/90 hover:border-border/60 hover:bg-secondary/40 hover:text-primary transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
      >
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        Ver últimas sesiones en detalle
      </button>
    </article>
  );
}
