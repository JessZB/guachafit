import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient, ApiError } from '../../lib/api-client';
import { triggerHaptic } from '../../lib/haptics';
import { obtenerTimezoneDispositivo, formatFechaHoraLocal } from '../../lib/date-format';
import {
  etiquetaMonitorAdherencia,
  pesoOrdenRiesgoMonitor,
  rutaExpedienteMonitor,
  type TonoSemaforo,
} from '../../lib/adherencia';
import { MonitorAdherenciaSemanalDTO } from '@guachafit/shared';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ChevronRight,
  Flame,
  RefreshCw,
  Users,
} from 'lucide-react';

type OrdenMonitor = 'riesgo' | 'nombre';

const CLASES_TONO: Record<
  TonoSemaforo,
  { chip: string; punto: string; barra: string; texto: string }
> = {
  success: {
    chip: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    punto: 'bg-emerald-400',
    barra: 'bg-emerald-400',
    texto: 'text-emerald-400',
  },
  warning: {
    chip: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    punto: 'bg-amber-400',
    barra: 'bg-amber-400',
    texto: 'text-amber-400',
  },
  danger: {
    chip: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    punto: 'bg-rose-400',
    barra: 'bg-rose-400',
    texto: 'text-rose-400',
  },
  info: {
    chip: 'bg-primary/15 text-primary border-primary/30',
    punto: 'bg-primary',
    barra: 'bg-primary',
    texto: 'text-primary',
  },
  neutral: {
    chip: 'bg-secondary text-muted-foreground border-border',
    punto: 'bg-muted-foreground',
    barra: 'bg-muted-foreground',
    texto: 'text-muted-foreground',
  },
};

function iniciales(nombreCompleto: string): string {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

/** Porcentaje numérico seguro para la barra de progreso (nunca NaN ni > 100). */
function porcentajeSeguro(valor: string): number {
  const numerico = Number(valor);
  if (!Number.isFinite(numerico)) return 0;
  return Math.max(0, Math.min(100, numerico));
}

export function MonitorAdherenciaPage() {
  const [alumnos, setAlumnos] = useState<MonitorAdherenciaSemanalDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orden, setOrden] = useState<OrdenMonitor>('riesgo');

  const timezone = useMemo(() => obtenerTimezoneDispositivo(), []);

  const cargarMonitor = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient<MonitorAdherenciaSemanalDTO[]>(
        `/entrenador/monitor-adherencia?timezone=${encodeURIComponent(timezone)}`
      );
      setAlumnos(Array.isArray(data) ? data : []);
    } catch (err) {
      const detalle =
        err instanceof ApiError
          ? err.problem?.detail || err.message
          : 'No pudimos cargar el monitor de adherencia.';
      setError(detalle);
    } finally {
      setIsLoading(false);
    }
  }, [timezone]);

  useEffect(() => {
    cargarMonitor();
  }, [cargarMonitor]);

  const resumen = useMemo(() => {
    const conPlan = alumnos.filter((a) => a.tienePlanActivo);
    return {
      // D6: los 0/0 sin bloques vencidos no cuentan como "en riesgo".
      rojo: conPlan.filter(
        (a) => !a.sinPendientesSemana && a.semaforoAdherencia === 'rojo'
      ).length,
      amarillo: conPlan.filter((a) => a.semaforoAdherencia === 'amarillo').length,
      verde: conPlan.filter((a) => a.semaforoAdherencia === 'verde').length,
      sinPlan: alumnos.length - conPlan.length,
      total: alumnos.length,
    };
  }, [alumnos]);

  const ordenados = useMemo(() => {
    const copia = [...alumnos];
    if (orden === 'nombre') {
      return copia.sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, 'es'));
    }
    // Riesgo: ROJO → AMARILLO → VERDE → Sin plan (el backend ya llega ordenado; se reafirma
    // el orden y se evita que un 0/0 "sin plan" aparezca como ROJO al tope).
    return copia.sort(
      (a, b) =>
        pesoOrdenRiesgoMonitor(b) - pesoOrdenRiesgoMonitor(a) ||
        a.nombreCompleto.localeCompare(b.nombreCompleto, 'es')
    );
  }, [alumnos, orden]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Cabecera */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
              <Activity className="h-4 w-4" />
              <span>Semáforo semanal · RF-001 RN-03</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-1">
              Monitor de Alumnos
            </h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Adherencia de la semana en curso por alumno, ordenada por nivel de riesgo.
              Las horas se muestran en tu zona horaria local ({timezone}).
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              cargarMonitor();
            }}
            disabled={isLoading}
            className="self-start inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs border border-border transition-all active:scale-95 disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>

        {/* Resumen del semáforo */}
        {!isLoading && !error && alumnos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="status" aria-live="polite">
            {[
              { etiqueta: 'En riesgo (Rojo)', valor: resumen.rojo, clase: CLASES_TONO.danger.texto },
              { etiqueta: 'En observación (Amarillo)', valor: resumen.amarillo, clase: CLASES_TONO.warning.texto },
              { etiqueta: 'Al día (Verde)', valor: resumen.verde, clase: CLASES_TONO.success.texto },
              { etiqueta: 'Sin plan activo', valor: resumen.sinPlan, clase: CLASES_TONO.neutral.texto },
            ].map(({ etiqueta, valor, clase }) => (
              <div key={etiqueta} className="p-3.5 rounded-2xl bg-secondary/30 border border-border/60">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  {etiqueta}
                </span>
                <span className={`text-2xl font-black font-mono ${clase}`}>{valor}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Estados de carga / error / vacío */}
      {isLoading && (
        <div className="space-y-3" role="status" aria-live="polite">
          <span className="sr-only">Cargando monitor de adherencia…</span>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="p-5 rounded-3xl bg-card border border-border/80 animate-pulse h-28"
            />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="p-8 rounded-3xl bg-card border border-destructive/30 text-center space-y-3 max-w-lg mx-auto">
          <AlertTriangle className="h-9 w-9 text-destructive mx-auto" />
          <h2 className="text-base font-bold text-foreground">No se pudo cargar el monitor</h2>
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => cargarMonitor()}
            className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Reintentar</span>
          </button>
        </div>
      )}

      {!isLoading && !error && alumnos.length === 0 && (
        <div className="p-10 rounded-3xl bg-card border border-dashed border-border/70 text-center space-y-3">
          <Users className="h-10 w-10 text-muted-foreground mx-auto opacity-40" />
          <h2 className="text-base font-bold text-foreground">Todavía no tienes alumnos activos</h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Cuando registres alumnos y les asignes una rutina semanal, aquí verás su semáforo de
            adherencia de la semana en curso.
          </p>
          <Link
            to="/coach/alumnos"
            className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 transition-all"
          >
            <span>Ir al directorio de alumnos</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Controles + listado */}
      {!isLoading && !error && alumnos.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-bold text-muted-foreground">
              {alumnos.length} {alumnos.length === 1 ? 'alumno' : 'alumnos'} en seguimiento
            </span>
            <div className="flex items-center gap-2">
              <label htmlFor="orden-monitor" className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Ordenar por
              </label>
              <select
                id="orden-monitor"
                value={orden}
                onChange={(e) => {
                  triggerHaptic('selection');
                  setOrden(e.target.value as OrdenMonitor);
                }}
                className="px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary cursor-pointer"
              >
                <option value="riesgo">Riesgo (mayor primero)</option>
                <option value="nombre">Nombre (A–Z)</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {ordenados.map((alumno) => {
              const conPlan = alumno.tienePlanActivo;
              const etiqueta = etiquetaMonitorAdherencia(alumno);
              const tono = CLASES_TONO[etiqueta.tono];
              const porcentaje = porcentajeSeguro(alumno.porcentajeCumplimientoSemanal);
              const ultimaSesion = formatFechaHoraLocal(alumno.ultimaSesionUtc);
              const inactivo = conPlan && alumno.diasInactivo > 4;

              return (
                <article
                  key={alumno.alumnoId}
                  className="p-5 rounded-3xl bg-card border border-border/80 shadow-xs hover:border-primary/40 transition-colors space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-11 w-11 rounded-2xl bg-secondary/80 border border-border/70 flex items-center justify-center text-primary font-black text-sm shrink-0">
                        {iniciales(alumno.nombreCompleto)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-black text-sm text-foreground truncate">
                          {alumno.nombreCompleto}
                        </h3>
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${tono.chip}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${tono.punto} ${
                                etiqueta.tono === 'danger' ? 'animate-pulse' : ''
                              }`}
                            />
                            {etiqueta.texto}
                          </span>
                          {conPlan && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full border border-border/60">
                              <Flame className="h-3 w-3 text-amber-400" />
                              Racha: {alumno.rachaDiasConsecutivos}{' '}
                              {alumno.rachaDiasConsecutivos === 1 ? 'día' : 'días'}
                            </span>
                          )}
                          {inactivo && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/30">
                              <AlertTriangle className="h-3 w-3" />
                              {alumno.diasInactivo} días sin entrenar
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <span className="text-[11px] font-mono font-bold text-muted-foreground flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {ultimaSesion ? `Últ. sesión: ${ultimaSesion}` : 'Sin sesiones registradas'}
                      </span>
                      <Link
                        to={rutaExpedienteMonitor(alumno.alumnoPerfilId)}
                        className="p-2 rounded-xl bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/60 transition-colors focus-visible:outline-2 focus-visible:outline-primary"
                        title={`Abrir el expediente de ${alumno.nombreCompleto}`}
                        aria-label={`Abrir el expediente de ${alumno.nombreCompleto}`}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>

                  {/* Sesiones completadas vs prescritas */}
                  {conPlan ? (
                    alumno.sinPendientesSemana ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        Al día — sin pendientes esta semana: aún no vence ningún bloque de su plan.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-foreground">
                            {alumno.sesionesCompletadas}/{alumno.sesionesPrescritas} sesiones
                            completadas
                          </span>
                          <span className={`font-mono font-black ${tono.texto}`}>
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
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      Sin rutina activa: asígnale una planificación para calcular su adherencia
                      semanal.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
