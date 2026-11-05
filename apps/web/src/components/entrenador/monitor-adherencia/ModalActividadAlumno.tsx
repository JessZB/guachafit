/**
 * Módulo `monitor-adherencia` · modal "Actividad de {alumno}" (WU15).
 *
 * Extraído verbatim de `pages/entrenador/MonitorAdherenciaPage.tsx:121-416`
 * (los datos viven en `use-historial-actividad.ts`, R1).
 * Clasificación: ÚNICO (modal de dominio solo de esta vista, R3).
 *
 * Es un componente propio para que cada apertura arranque con estado limpio (fetch + acordeón).
 * En demo lee el fixture local, cero llamadas API; en real consulta el historial con loading,
 * error y reintento. A11y: role dialog, Escape cierra, foco inicial y scroll interno
 * (vía `useDialogoAccesible`: trampa de Tab, foco inicial y restore).
 *
 * R5: conserva idénticos `role="dialog"`, `aria-labelledby "modal-actividad-titulo"`, textos de
 * cabecera/resumen/estados, acordeones (`aria-expanded`/`aria-controls`/`region`) y "Ver más".
 * DEFECTO CONOCIDO PRESERVADO: el botón de cierre usa `p-1.5` (~32px, bajo el mínimo §6.8
 * de 44px) —se mantiene verbatim por R5 y se reporta como WARNING—.
 * CANDIDATOS: `EstadoCarga`/`EstadoError`/`EstadoVacio`/`BotonTactil` de `ui/`.
 *
 * §6: texto ≥ 11px, pesos ≤ 700, tokens con variante claro/oscuro.
 * Presentacional salvo su hook de datos propio: no usa `useQuery` ni `api-client` (R1).
 */

import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Dumbbell,
  ExternalLink,
  Flame,
  History,
  RefreshCw,
  X,
} from 'lucide-react';
import type { MonitorAdherenciaSemanalDTO } from '@guachafit/shared';
import { triggerHaptic } from '../../../lib/haptics';
import { formatFechaCalendario, formatFechaHoraLocal } from '../../../lib/date-format';
import { pluralizar } from '../../../lib/pluralizar';
import { etiquetaEstadoSesion, etiquetaMonitorAdherencia } from '../../../lib/adherencia';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';
import { CLASES_SALIDA_MODAL, useSalidaModal } from '../../../lib/use-salida-modal';
import { DetalleSesionEntrenamiento } from '../DetalleSesionEntrenamiento';
import {
  CLASES_TONO,
  porcentajeSeguro,
} from '../../../lib/monitor-adherencia-presentacion';
import { useHistorialActividad } from './use-historial-actividad';

export interface ModalActividadAlumnoProps {
  alumno: MonitorAdherenciaSemanalDTO;
  isDemoMode: boolean;
  onCerrar: () => void;
}

export function ModalActividadAlumno({ alumno, isDemoMode, onCerrar }: ModalActividadAlumnoProps) {
  const {
    sesiones,
    totalHistorial,
    isLoading,
    isLoadingMas,
    error,
    sesionExpandidaId,
    setSesionExpandidaId,
    cargarHistorial,
    puedeVerMas,
  } = useHistorialActividad({ alumno, isDemoMode });

  // U3b: Escape, trampa de Tab, foco inicial y restore del foco al disparador (antes duplicado aquí).
  const { saliendo, cerrar } = useSalidaModal(onCerrar);
  const refDialogo = useDialogoAccesible({ onCerrar: cerrar });

  const etiquetaAlumno = etiquetaMonitorAdherencia(alumno);
  const tonoAlumno = CLASES_TONO[etiquetaAlumno.tono];
  const porcentajeAlumno = porcentajeSeguro(alumno.porcentajeCumplimientoSemanal);
  const perfilId = (alumno.alumnoPerfilId ?? '').trim();
  // La ficha leerá `?tab=entrenamiento` en otra unidad; aquí solo se genera el enlace.
  const rutaFichaCompleta = perfilId
    ? `/coach/alumnos/${encodeURIComponent(perfilId)}?tab=entrenamiento`
    : null;

  return (
    <div
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) cerrar();
      }}
      data-saliendo={saliendo || undefined}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200 ${CLASES_SALIDA_MODAL}`}
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-actividad-titulo"
        tabIndex={-1}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-card border border-border shadow-2xl"
      >
        {/* Cabecera fija para poder cerrar sin perder el contexto al hacer scroll */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border/80 bg-card/95 backdrop-blur-sm p-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-9 w-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <History className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id="modal-actividad-titulo" className="font-bold text-base text-foreground truncate">
                Actividad de {alumno.nombreCompleto}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Últimas sesiones con series, cargas y tiempos reales.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={cerrar}
            className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
            title="Cerrar"
            aria-label="Cerrar la actividad del alumno"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Resumen del alumno */}
          <div className="p-3.5 rounded-2xl bg-secondary/30 border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide border ${tonoAlumno.chip}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${tonoAlumno.punto}`} />
                {etiquetaAlumno.texto}
              </span>
              {alumno.tienePlanActivo && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full border border-border/60">
                  <Flame className="h-3 w-3 text-warning" />
                  Racha: {alumno.rachaDiasConsecutivos}{' '}
                  {alumno.rachaDiasConsecutivos === 1 ? 'día' : 'días'}
                </span>
              )}
              {alumno.tienePlanActivo && !alumno.sinPendientesSemana && (
                <span
                  className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-secondary/60 border border-border/60 ${tonoAlumno.texto}`}
                >
                  {alumno.sesionesCompletadas}/
                  {pluralizar(alumno.sesionesPrescritas, 'sesión', 'sesiones')} ·{' '}
                  {porcentajeAlumno}%
                </span>
              )}
            </div>
            {rutaFichaCompleta && (
              <Link
                to={rutaFichaCompleta}
                onClick={() => triggerHaptic('light')}
                className="self-start inline-flex items-center gap-2 py-2 px-3 rounded-xl bg-primary text-primary-foreground font-bold text-[11px] shadow-md shadow-primary/20 hover:brightness-110 transition-all active:scale-95 shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir ficha completa
              </Link>
            )}
          </div>

          {/* Estados de carga / error / vacío */}
          {isLoading && (
            <div className="space-y-2" role="status" aria-live="polite">
              <span className="sr-only">Cargando la actividad del alumno…</span>
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-20 rounded-2xl bg-secondary/30 border border-border/60 animate-pulse"
                />
              ))}
            </div>
          )}

          {!isLoading && error && (
            <div className="p-6 rounded-2xl bg-card border border-destructive/30 text-center space-y-2">
              <AlertTriangle className="h-7 w-7 text-destructive mx-auto" />
              <p className="text-xs font-bold text-foreground">No se pudo cargar la actividad</p>
              <p className="text-[11px] text-muted-foreground">{error}</p>
              <button
                type="button"
                onClick={() => void cargarHistorial(0, false)}
                className="inline-flex items-center gap-2 py-2 px-3 rounded-xl bg-primary text-primary-foreground font-bold text-[11px] shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reintentar
              </button>
            </div>
          )}

          {!isLoading && !error && sesiones.length === 0 && (
            <div className="p-8 rounded-2xl bg-card border border-dashed border-border/70 text-center space-y-2">
              <CalendarClock className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
              <p className="text-xs font-bold text-foreground">Sin sesiones registradas</p>
              <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                Cuando el alumno entrene, aquí verás el detalle de sus series, cargas y tiempos.
              </p>
            </div>
          )}

          {!isLoading && !error && sesiones.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Mostrando {sesiones.length} de {pluralizar(totalHistorial, 'sesión', 'sesiones')}
              </p>
              {sesiones.map((sesion) => {
                const expandida = sesionExpandidaId === sesion.id;
                const etiquetaSesion = etiquetaEstadoSesion(sesion.estado, sesion.motivoOmision);
                const fechaSesion =
                  formatFechaHoraLocal(sesion.fechaInicioUtc) ??
                  formatFechaCalendario(sesion.fechaProgramada) ??
                  sesion.fechaProgramada;
                const totalSeries = sesion.ejercicios.reduce(
                  (total, ejercicio) => total + ejercicio.series.length,
                  0
                );

                return (
                  <div key={sesion.id} className="rounded-2xl border border-border/70 bg-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('selection');
                        setSesionExpandidaId(expandida ? null : sesion.id);
                      }}
                      aria-expanded={expandida}
                      aria-controls={`actividad-sesion-${sesion.id}`}
                      className="w-full p-3.5 flex items-center justify-between gap-3 text-left hover:bg-secondary/30 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Dumbbell className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-foreground truncate">{fechaSesion}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {sesion.ejercicios.length}{' '}
                            {sesion.ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'} · {totalSeries}{' '}
                            {totalSeries === 1 ? 'serie' : 'series'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${CLASES_TONO[etiquetaSesion.tono].chip}`}
                        >
                          {etiquetaSesion.texto}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                            expandida ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </button>
                    {expandida && (
                      <div
                        id={`actividad-sesion-${sesion.id}`}
                        role="region"
                        aria-label={`Detalle de la sesión del ${fechaSesion}`}
                        className="px-3.5 pb-3.5 animate-in fade-in-50 slide-in-from-top-2 duration-200"
                      >
                        <DetalleSesionEntrenamiento sesion={sesion} />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* WU25a: "Ver más" avanza por offset y acumula hasta el `total` real del historial */}
              {puedeVerMas && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    void cargarHistorial(sesiones.length, true);
                  }}
                  disabled={isLoadingMas}
                  className="w-full py-2.5 px-4 rounded-2xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs border border-border transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                >
                  {isLoadingMas
                    ? 'Cargando más sesiones…'
                    : `Ver más sesiones (${sesiones.length} de ${totalHistorial})`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
