import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient, ApiError } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';
import { triggerHaptic } from '../../lib/haptics';
import {
  obtenerTimezoneDispositivo,
  formatFechaCalendario,
  formatFechaHoraLocal,
} from '../../lib/date-format';
import { crearMonitorAdherenciaDemo } from '../../lib/demo-monitor-adherencia';
import { sesionesDemoAlumno } from '../../lib/demo-sesiones';
import { pluralizar } from '../../lib/pluralizar';
import {
  etiquetaEstadoSesion,
  etiquetaMonitorAdherencia,
  rutaExpedienteMonitor,
  type TonoSemaforo,
} from '../../lib/adherencia';
import {
  aParametroSemaforoMonitor,
  calcularResumenMonitorAdherencia,
  filtrarMonitorAlumnos,
  hayFiltroMonitorActivo,
  type FiltroSemaforoMonitor,
} from '../../lib/monitor-filtros';
import { usePaginacionServidor } from '../../lib/use-paginacion-servidor';
import { useValorDebounced } from '../../lib/use-valor-debounced';
import { rebanarPagina } from '../../lib/paginacion';
import { Paginacion } from '../../components/common/Paginacion';
import {
  MonitorAdherenciaDTO,
  MonitorAdherenciaSemanalDTO,
  HistorialSesionesAlumnoDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { DetalleSesionEntrenamiento } from '../../components/entrenador/DetalleSesionEntrenamiento';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  ExternalLink,
  Flame,
  History,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';

/**
 * WU25a: tamaño de página del historial del modal de actividad. El endpoint acepta `limit` hasta
 * 100 y ahora también `offset` + `total`, así que "Ver más" avanza por offset sin escalones.
 */
const TAMANO_HISTORIAL_ACTIVIDAD = 10;

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

/**
 * WU15: modal "Actividad de {alumno}" con las últimas sesiones del alumno sin salir del monitor.
 *
 * Es un componente propio para que cada apertura arranque con estado limpio (fetch + acordeón).
 * En demo lee el fixture local (`sesionesDemoAlumno`), cero llamadas API; en real consulta
 * `GET /sesiones/alumno/:alumnoId/historial?limit=10` con loading, error y reintento.
 *
 * A11y: role dialog, Escape cierra, foco inicial en el botón de cierre y scroll interno.
 */
function ModalActividadAlumno({
  alumno,
  onCerrar,
}: {
  alumno: MonitorAdherenciaSemanalDTO;
  onCerrar: () => void;
}) {
  const { isDemoMode } = useAuth();
  const [sesiones, setSesiones] = useState<SesionEntrenamientoDetalleDTO[]>([]);
  const [totalHistorial, setTotalHistorial] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMas, setIsLoadingMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sesionExpandidaId, setSesionExpandidaId] = useState<string | null>(null);
  const botonCerrarRef = useRef<HTMLButtonElement | null>(null);

  /**
   * WU25a: el endpoint `historial` devuelve `{ items, total, limit, offset }`. `offset` avanza
   * por bloques de `TAMANO_HISTORIAL_ACTIVIDAD` y "Ver más" ACUMULA en pantalla hasta `total`;
   * en demo se corta el fixture local con la misma aritmética.
   */
  const cargarHistorial = useCallback(
    async (offset: number, acumular: boolean) => {
      if (acumular) {
        setIsLoadingMas(true);
      } else {
        setIsLoading(true);
      }
      setError(null);
      try {
        const pagina = Math.floor(offset / TAMANO_HISTORIAL_ACTIVIDAD) + 1;

        if (isDemoMode) {
          const fixture = sesionesDemoAlumno(alumno.alumnoId);
          const items = rebanarPagina(fixture, pagina, TAMANO_HISTORIAL_ACTIVIDAD);
          setSesiones((prev) => (acumular ? [...prev, ...items] : items));
          setTotalHistorial(fixture.length);
          return;
        }

        // El endpoint resuelve el perfil por `perfiles_alumno.id` o por `usuarioId`; se usa
        // `alumnoId` (usuarioId, siempre presente en el DTO) para no depender del opcional.
        const data = await apiClient<HistorialSesionesAlumnoDTO>(
          `/sesiones/alumno/${encodeURIComponent(alumno.alumnoId)}/historial?limit=${TAMANO_HISTORIAL_ACTIVIDAD}&offset=${offset}`
        );
        const items = Array.isArray(data?.items) ? data.items : [];
        setSesiones((prev) => (acumular ? [...prev, ...items] : items));
        setTotalHistorial(Number(data?.total ?? items.length));
      } catch (err) {
        const detalle =
          err instanceof ApiError
            ? err.problem?.detail || err.message
            : 'No pudimos cargar la actividad del alumno.';
        setError(detalle);
      } finally {
        setIsLoading(false);
        setIsLoadingMas(false);
      }
    },
    [alumno.alumnoId, isDemoMode]
  );

  useEffect(() => {
    void cargarHistorial(0, false);
  }, [cargarHistorial]);

  /** WU25a: hay más historial mientras la lista en pantalla no alcance el total real. */
  const puedeVerMas = sesiones.length < totalHistorial;

  // La sesión más reciente arranca expandida; después el acordeón queda libre.
  useEffect(() => {
    setSesionExpandidaId(sesiones[0]?.id ?? null);
  }, [sesiones]);

  useEffect(() => {
    // Foco inicial en el cierre al abrir; al desmontar se devuelve al disparador (tarjeta/botón).
    const elementoPrevio = document.activeElement as HTMLElement | null;
    botonCerrarRef.current?.focus();
    return () => elementoPrevio?.focus?.();
  }, []);

  useEffect(() => {
    const alPresionarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPresionarTecla);
    return () => document.removeEventListener('keydown', alPresionarTecla);
  }, [onCerrar]);

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
        if (evento.target === evento.currentTarget) onCerrar();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-actividad-titulo"
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-card border border-border shadow-2xl"
      >
        {/* Cabecera fija para poder cerrar sin perder el contexto al hacer scroll */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border/80 bg-card/95 backdrop-blur-sm p-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-9 w-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <History className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id="modal-actividad-titulo" className="font-black text-base text-foreground truncate">
                Actividad de {alumno.nombreCompleto}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Últimas sesiones con series, cargas y tiempos reales.
              </p>
            </div>
          </div>
          <button
            ref={botonCerrarRef}
            type="button"
            onClick={onCerrar}
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
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${tonoAlumno.chip}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${tonoAlumno.punto}`} />
                {etiquetaAlumno.texto}
              </span>
              {alumno.tienePlanActivo && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full border border-border/60">
                  <Flame className="h-3 w-3 text-amber-400" />
                  Racha: {alumno.rachaDiasConsecutivos}{' '}
                  {alumno.rachaDiasConsecutivos === 1 ? 'día' : 'días'}
                </span>
              )}
              {alumno.tienePlanActivo && !alumno.sinPendientesSemana && (
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-secondary/60 border border-border/60 ${tonoAlumno.texto}`}
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
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
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
                          <p className="text-[10px] text-muted-foreground">
                            {sesion.ejercicios.length}{' '}
                            {sesion.ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'} · {totalSeries}{' '}
                            {totalSeries === 1 ? 'serie' : 'series'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${CLASES_TONO[etiquetaSesion.tono].chip}`}
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

export function MonitorAdherenciaPage() {
  const { isDemoMode } = useAuth();
  // WU25a: paginación numerada + filtros server-side (chips del semáforo + búsqueda con debounce).
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [filtroSemaforo, setFiltroSemaforo] = useState<FiltroSemaforoMonitor>('todos');
  const [busqueda, setBusqueda] = useState('');
  const busquedaDebounced = useValorDebounced(busqueda);
  const [alumnoActivo, setAlumnoActivo] = useState<MonitorAdherenciaSemanalDTO | null>(null);

  const timezone = useMemo(() => obtenerTimezoneDispositivo(), []);

  /**
   * WU25a: carga de UNA página del monitor. `q` y `semaforo` viajan al servidor ANTES del slice
   * (el `resumen` de la respuesta sigue describiendo la cartera completa). En modo demo se filtra
   * el fixture local con los mismos helpers puros y se corta con `rebanarPagina`.
   */
  const cargarPagina = useCallback(
    async ({
      pagina: paginaSolicitada,
      tamano: tamanoSolicitado,
      signal,
    }: {
      pagina: number;
      tamano: number;
      signal: AbortSignal;
    }): Promise<MonitorAdherenciaDTO> => {
      const offset = (paginaSolicitada - 1) * tamanoSolicitado;
      const termino = busquedaDebounced.trim();
      const semaforoApi = aParametroSemaforoMonitor(filtroSemaforo);

      if (isDemoMode) {
        const cartera = crearMonitorAdherenciaDemo();
        const filtrados = filtrarMonitorAlumnos(cartera, {
          busqueda: termino,
          filtroSemaforo,
        });
        return {
          items: rebanarPagina(filtrados, paginaSolicitada, tamanoSolicitado),
          total: filtrados.length,
          limit: tamanoSolicitado,
          offset,
          // Los chips demo siempre describen la cartera completa, como el servidor.
          resumen: calcularResumenMonitorAdherencia(cartera),
        };
      }

      const parametros = new URLSearchParams({
        timezone,
        limit: String(tamanoSolicitado),
        offset: String(offset),
      });
      if (termino.length > 0) parametros.set('q', termino);
      if (semaforoApi) parametros.set('semaforo', semaforoApi);

      return apiClient<MonitorAdherenciaDTO>(
        `/entrenador/monitor-adherencia?${parametros.toString()}`,
        { signal }
      );
    },
    [isDemoMode, timezone, busquedaDebounced, filtroSemaforo]
  );

  const paginacion = usePaginacionServidor<MonitorAdherenciaSemanalDTO, MonitorAdherenciaDTO>({
    clave: ['monitor-adherencia', isDemoMode ? 'demo' : 'real', timezone, busquedaDebounced.trim(), filtroSemaforo],
    pagina,
    tamano,
    cargar: cargarPagina,
    onAjustarPagina: setPagina,
  });

  const {
    items: alumnos,
    total,
    cargando,
    error: errorCarga,
    recargar,
    respuesta,
  } = paginacion;
  const resumen = respuesta?.resumen ?? null;
  const totalCartera = resumen?.total ?? 0;
  // Solo la PRIMERA carga muestra esqueletos; el cambio de página conserva la lista anterior.
  const isLoading = cargando && !respuesta;
  const error = errorCarga?.message ?? null;

  // WU25a: búsqueda/filtro/tamaño nuevos vuelven a la página 1 (y el demo reinicia su página).
  useEffect(() => {
    setPagina(1);
  }, [busquedaDebounced, filtroSemaforo, tamano, isDemoMode]);

  const filtroActivo = hayFiltroMonitorActivo({ busqueda, filtroSemaforo });
  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroSemaforo('todos');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Cabecera */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
              <Activity className="h-4 w-4" />
              <span>Cumplimiento semanal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-1">
              Seguimiento de Alumnos
            </h1>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Cumplimiento de la semana por alumno, ordenado por nivel de riesgo.
              Las horas se muestran en tu zona horaria local ({timezone}).
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              recargar();
            }}
            disabled={isLoading}
            className="self-start inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs border border-border transition-all active:scale-95 disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>

        {/* WU25a: chips con el `resumen` GLOBAL del servidor (cartera completa) + búsqueda */}
        {!isLoading && !error && totalCartera > 0 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setFiltroSemaforo('todos');
                }}
                aria-pressed={filtroSemaforo === 'todos'}
                title="Ver todos los alumnos en seguimiento"
                className={`p-3.5 rounded-2xl bg-secondary/30 border text-left transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
                  filtroSemaforo === 'todos'
                    ? 'border-primary/50 ring-1 ring-primary/30 shadow-xs'
                    : 'border-border/60 hover:border-border'
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Todos
                </span>
                <span className="text-2xl font-black font-mono text-foreground">
                  {resumen?.total ?? 0}
                </span>
              </button>

              {[
                {
                  clave: 'rojo' as const,
                  etiqueta: 'En riesgo (Rojo)',
                  valor: resumen?.rojo ?? 0,
                  clase: CLASES_TONO.danger.texto,
                  anillo: 'border-rose-500/50 ring-rose-500/30',
                },
                {
                  clave: 'amarillo' as const,
                  etiqueta: 'En observación (Amarillo)',
                  valor: resumen?.amarillo ?? 0,
                  clase: CLASES_TONO.warning.texto,
                  anillo: 'border-amber-500/50 ring-amber-500/30',
                },
                {
                  clave: 'verde' as const,
                  etiqueta: 'Al día (Verde)',
                  valor: resumen?.verde ?? 0,
                  clase: CLASES_TONO.success.texto,
                  anillo: 'border-emerald-500/50 ring-emerald-500/30',
                },
                {
                  clave: 'sin_plan' as const,
                  etiqueta: 'Sin plan activo',
                  valor: resumen?.sinPlan ?? 0,
                  clase: CLASES_TONO.neutral.texto,
                  anillo: 'border-border ring-border',
                },
              ].map(({ clave, etiqueta, valor, clase, anillo }) => (
                <button
                  key={clave}
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    // Toggle: volver a tocar el chip activo limpia el filtro.
                    setFiltroSemaforo((prev) => (prev === clave ? 'todos' : clave));
                  }}
                  aria-pressed={filtroSemaforo === clave}
                  title={`Filtrar: ${etiqueta}`}
                  className={`p-3.5 rounded-2xl bg-secondary/30 border text-left transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
                    filtroSemaforo === clave
                      ? `${anillo} ring-1 shadow-xs`
                      : 'border-border/60 hover:border-border'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    {etiqueta}
                  </span>
                  <span className={`text-2xl font-black font-mono ${clase}`}>{valor}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="relative w-full sm:max-w-xs">
                <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-2.5" />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar alumno por nombre…"
                  aria-label="Buscar alumno por nombre"
                  className="w-full pl-9 pr-9 py-2 rounded-xl bg-card border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
                />
                {busqueda.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBusqueda('')}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2 top-1.5 p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {filtroActivo && (
                <span className="text-xs font-bold text-muted-foreground" role="status" aria-live="polite">
                  {total} {total === 1 ? 'resultado' : 'resultados'}
                </span>
              )}
            </div>
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
            onClick={() => recargar()}
            className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Reintentar</span>
          </button>
        </div>
      )}

      {!isLoading && !error && totalCartera === 0 && (
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

      {/* WU25a: estado vacío honesto de filtros (cartera con alumnos, filtro sin coincidencias) */}
      {!isLoading && !error && totalCartera > 0 && total === 0 && (
        <div className="p-10 rounded-3xl bg-card border border-dashed border-border/70 text-center space-y-3">
          <Search className="h-10 w-10 text-muted-foreground mx-auto opacity-40" />
          <h2 className="text-base font-bold text-foreground">Sin resultados</h2>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Ningún alumno coincide con la búsqueda o el filtro seleccionado.
          </p>
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              limpiarFiltros();
            }}
            className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span>Limpiar filtros</span>
          </button>
        </div>
      )}

      {/* WU25a: paginación numerada server-side + listado del orden de riesgo del endpoint */}
      {!isLoading && !error && total > 0 && (
        <div className="space-y-3">
          <div className="px-1">
            <Paginacion
              pagina={pagina}
              tamano={tamano}
              total={total}
              onCambiarPagina={setPagina}
              onCambiarTamano={setTamano}
              cargando={cargando}
            />
          </div>

          <div className="space-y-3">
            {alumnos.map((alumno) => {
              const conPlan = alumno.tienePlanActivo;
              const etiqueta = etiquetaMonitorAdherencia(alumno);
              const tono = CLASES_TONO[etiqueta.tono];
              const porcentaje = porcentajeSeguro(alumno.porcentajeCumplimientoSemanal);
              const ultimaSesion = formatFechaHoraLocal(alumno.ultimaSesionUtc);
              const inactivo = conPlan && alumno.diasInactivo > 4;

              return (
                <article
                  key={alumno.alumnoId}
                  onClick={() => {
                    triggerHaptic('light');
                    setAlumnoActivo(alumno);
                  }}
                  title={`Ver la actividad reciente de ${alumno.nombreCompleto}`}
                  className="p-5 rounded-3xl bg-card border border-border/80 shadow-xs hover:border-primary/40 transition-colors space-y-4 cursor-pointer"
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
                              {pluralizar(alumno.diasInactivo, 'día sin entrenar', 'días sin entrenar')}
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
                        onClick={(evento) => evento.stopPropagation()}
                        onKeyDown={(evento) => evento.stopPropagation()}
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
                            {alumno.sesionesCompletadas}/
                            {pluralizar(alumno.sesionesPrescritas, 'sesión completada', 'sesiones completadas')}
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

                  {/* Afordancia del modal: la tarjeta es clicable con puntero y este botón es el
                      acceso real por teclado/AT (el chevron sigue siendo el atajo a la ficha). */}
                  <button
                    type="button"
                    onClick={(evento) => {
                      evento.stopPropagation();
                      triggerHaptic('light');
                      setAlumnoActivo(alumno);
                    }}
                    aria-haspopup="dialog"
                    className="text-[10px] font-bold text-muted-foreground/80 hover:text-primary flex items-center gap-1.5 transition-colors cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <History className="h-3 w-3" />
                    Ver últimas sesiones en detalle
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* WU15: modal de actividad reciente (detalle en sitio sin salir del monitor) */}
      {alumnoActivo && (
        <ModalActividadAlumno
          alumno={alumnoActivo}
          onCerrar={() => setAlumnoActivo(null)}
        />
      )}
    </div>
  );
}
