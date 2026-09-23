import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';
import {
  ControlAntropometricoDetalleDTO,
  ColaPendientesAntropometricosDTO,
} from '@guachafit/shared';
import {
  etiquetaAlumnoPendiente,
  filtrarPendientesAntropometria,
  hayBusquedaAntropometriaActiva,
} from '../../lib/antropometria-filtros';
import { crearPendientesDemoAntropometria } from '../../lib/demo-antropometria';
import { pluralizar } from '../../lib/pluralizar';
import { formatFechaCalendario } from '../../lib/date-format';
import { rebanarPagina } from '../../lib/paginacion';
import { usePaginacionServidor } from '../../lib/use-paginacion-servidor';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { Paginacion } from '../../components/common/Paginacion';
import { VisorFoto } from '../../components/common/VisorFoto';
import { ComparadorAntropometrico } from '../../components/entrenador/ComparadorAntropometrico';
import { etiquetaAngulo } from '../../lib/comparador-fotos';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RotateCcw,
  Search,
  SearchX,
  Eye,
  ImageOff,
  X,
} from 'lucide-react';

export function AntropometriaPage() {
  const { isDemoMode } = useAuth();
  // WU25b: paginación numerada server-side (envelope `{ items, total, limit, offset }`).
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  // En demo la cola es local: los ids ya conciliados se excluyen del slice del fixture.
  const [idsResueltosDemo, setIdsResueltosDemo] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'pendientes' | 'comparador'>('pendientes');
  // D5: fallo de conciliación visible; la tarjeta no desaparece si el server no confirmó.
  const [actionError, setActionError] = useState<string | null>(null);
  // WU20: búsqueda client-side por nombre. WU25b: con paginación server-side se aplica sobre la
  // PÁGINA cargada (el endpoint no acepta búsqueda); la UI muestra el conteo "en esta página".
  const [busqueda, setBusqueda] = useState('');

  // Comparator State
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // RF-003 RN-04 (WU RF-003b): auditoría de fotos con visor accesible y rechazo con motivo libre.
  const [fotoVisor, setFotoVisor] = useState<{
    foto: ControlAntropometricoDetalleDTO['fotos'][number];
    fecha: string;
  } | null>(null);
  const [fotosConError, setFotosConError] = useState<string[]>([]);
  const [controlARechazar, setControlARechazar] = useState<ControlAntropometricoDetalleDTO | null>(
    null
  );
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [isRechazando, setIsRechazando] = useState(false);

  const refModalRechazo = useDialogoAccesible({
    abierto: controlARechazar !== null,
    onCerrar: () => cerrarModalRechazo(),
  });

  const cerrarModalRechazo = () => {
    setControlARechazar(null);
    setMotivoRechazo('');
    setErrorMotivo(null);
  };

  /**
   * WU25b: carga de UNA página de la cola de pendientes. En demo se filtra la cola local (ids
   * ya conciliados) y se corta con `rebanarPagina`; en real se consulta el envelope del servidor.
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
    }): Promise<ColaPendientesAntropometricosDTO> => {
      const offset = (paginaSolicitada - 1) * tamanoSolicitado;
      if (isDemoMode) {
        const cola = crearPendientesDemoAntropometria().filter(
          (ctrl) => !idsResueltosDemo.includes(ctrl.id)
        );
        return {
          items: rebanarPagina(cola, paginaSolicitada, tamanoSolicitado),
          total: cola.length,
          limit: tamanoSolicitado,
          offset,
        };
      }
      return apiClient<ColaPendientesAntropometricosDTO>(
        `/antropometria/pendientes?limit=${tamanoSolicitado}&offset=${offset}`,
        { signal }
      );
    },
    [isDemoMode, idsResueltosDemo]
  );

  const paginacion = usePaginacionServidor<
    ControlAntropometricoDetalleDTO,
    ColaPendientesAntropometricosDTO
  >({
    clave: ['antropometria-pendientes', isDemoMode ? `demo-${idsResueltosDemo.length}` : 'real'],
    pagina,
    tamano,
    cargar: cargarPagina,
    onAjustarPagina: setPagina,
  });

  const {
    items: pendientes,
    total,
    cargando,
    error: errorConsulta,
    recargar,
    respuesta,
  } = paginacion;
  // Solo la PRIMERA carga muestra el estado de carga; el cambio de página conserva la lista.
  const isLoading = cargando && !respuesta;
  const error = errorConsulta?.message ?? null;

  // WU25b: cambiar el tamaño de página (o entrar/salir del modo demo) vuelve a la página 1.
  useEffect(() => {
    setPagina(1);
  }, [tamano, isDemoMode]);

  const visibles = useMemo(
    () => filtrarPendientesAntropometria(pendientes, busqueda),
    [pendientes, busqueda]
  );

  const hayBusquedaActiva = hayBusquedaAntropometriaActiva(busqueda);

  const limpiarBusqueda = () => setBusqueda('');

  /**
   * RN-04: concilia un control pendiente.
   * - `aprobar`: consolida sin observación prefabricada (la observación es opcional del coach).
   * - `rechazar`: exige el motivo libre que verá/recibirá el alumno (validado antes de enviar).
   * Solo se declara éxito con 2xx (o el cambio local en modo demo); si falla, la tarjeta sigue.
   */
  const handleConciliar = async (id: string, accion: 'aprobar' | 'rechazar', motivo?: string) => {
    setActionError(null);

    const cuerpo =
      accion === 'aprobar'
        ? { accion }
        : { accion, motivoRechazo: (motivo ?? '').trim() };

    if (accion === 'rechazar' && !cuerpo.motivoRechazo) {
      setErrorMotivo('Escribe el motivo del rechazo: el alumno lo recibirá como retroalimentación.');
      return;
    }

    // MODO DEMO EXPLÍCITO: la conciliación vive en estado local, sin llamadas reales (el banner
    // demo visible lo declara). Nunca se declara éxito de un servidor que no respondió.
    if (!isDemoMode) {
      setIsRechazando(accion === 'rechazar');
      try {
        await apiClient(`/antropometria/${id}/conciliar`, {
          method: 'PATCH',
          body: JSON.stringify(cuerpo),
        });
      } catch (err: any) {
        // D5: sin éxito falso ni desaparición optimista; la evaluación sigue pendiente.
        const mensaje =
          err?.message || 'No se pudo conciliar la evaluación. Revisa tu conexión e inténtalo de nuevo.';
        if (accion === 'rechazar') setErrorMotivo(mensaje);
        else setActionError(mensaje);
        return;
      } finally {
        setIsRechazando(false);
      }
    }

    // WU25b: el servidor manda; se recarga la página actual (el hook ajusta si el total encogió).
    // En demo se registra el id resuelto y el slice local se recalcula.
    if (isDemoMode) setIdsResueltosDemo((prev) => [...prev, id]);
    else recargar();
    if (accion === 'rechazar') cerrarModalRechazo();
    setActionSuccess(
      accion === 'aprobar'
        ? 'Evaluación aprobada y consolidada en las curvas del alumno.'
        : 'Evaluación rechazada: el motivo quedó registrado en el control.'
    );
    setTimeout(() => setActionSuccess(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
              <Camera className="h-4 w-4" />
              <span>Medidas y Fotos</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-1">
              Evaluaciones Físicas
            </h1>
            <p className="text-xs text-muted-foreground">
              Revisa las medidas y fotos de progreso que subieron tus alumnos.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-secondary/60 p-1 rounded-2xl border border-border">
            <button
              onClick={() => setActiveTab('pendientes')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'pendientes'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Por revisar ({total})
            </button>
            <button
              onClick={() => setActiveTab('comparador')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'comparador'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Comparador Antes / Después
            </button>
          </div>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-success/15 border border-success/30 text-success text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {!isLoading && error ? (
        <div className="p-8 rounded-3xl bg-card border border-destructive/30 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => recargar()}
            className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      ) : activeTab === 'pendientes' ? (
        /* Review Queue */
        <div className="space-y-4">
          {/* WU25b: paginación numerada server-side (cola FIFO del endpoint) */}
          {total > 0 && (
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
          )}

          {total > 0 && (
            <div className="p-4 rounded-3xl bg-card border border-border/80 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por alumno..."
                  aria-label="Buscar evaluación pendiente por alumno"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-background border border-border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary transition-colors"
                />
              </div>
              <p className="text-[11px] text-muted-foreground font-mono">
                Mostrando {visibles.length} de {pendientes.length} en esta página ·{' '}
                {pluralizar(total, 'evaluación pendiente', 'evaluaciones pendientes')}
              </p>
            </div>
          )}

          {total === 0 ? (
            <div className="p-12 text-center space-y-3 bg-card rounded-3xl border border-border">
              <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
              <h3 className="font-bold text-base text-foreground">Sin Evaluaciones Pendientes</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Todos los check-ins antropométricos remotos han sido validados.
              </p>
            </div>
          ) : visibles.length === 0 ? (
            <div className="p-10 rounded-3xl bg-card border border-dashed border-border text-center space-y-3">
              <SearchX className="h-9 w-9 text-muted-foreground mx-auto opacity-50" />
              <h3 className="text-sm font-black text-foreground">Sin resultados</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Ninguna evaluación pendiente coincide con la búsqueda.
              </p>
              <button
                type="button"
                onClick={limpiarBusqueda}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Limpiar búsqueda</span>
              </button>
            </div>
          ) : (
            visibles.map((ctrl) => (
              <div
                key={ctrl.id}
                className="p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-4"
              >
                <div className="flex items-center justify-between border-b border-border/50 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-foreground">
                      Fecha de Toma:{' '}
                      {formatFechaCalendario(ctrl.fechaEvaluacion) ?? ctrl.fechaEvaluacion}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/20 uppercase">
                      Pendiente Aprobación
                    </span>
                  </div>
                  <span className="text-xs font-bold text-foreground">
                    {etiquetaAlumnoPendiente(ctrl)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-2xl bg-secondary/30">
                    <span className="text-[11px] text-muted-foreground uppercase font-semibold">
                      Peso
                    </span>
                    <p className="font-mono font-bold text-base text-foreground">{ctrl.pesoKg} kg</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-secondary/30">
                    <span className="text-[11px] text-muted-foreground uppercase font-semibold">
                      % Grasa
                    </span>
                    <p className="font-mono font-bold text-base text-foreground">
                      {ctrl.porcentajeGrasa ? `${ctrl.porcentajeGrasa}%` : '—'}
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-secondary/30">
                    <span className="text-[11px] text-muted-foreground uppercase font-semibold">
                      Cintura
                    </span>
                    <p className="font-mono font-bold text-base text-foreground">
                      {ctrl.perimetros?.cinturaCm ? `${ctrl.perimetros.cinturaCm} cm` : '—'}
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-secondary/30">
                    <span className="text-[11px] text-muted-foreground uppercase font-semibold">
                      Fotos Adjuntas
                    </span>
                    <p className="font-mono font-bold text-base text-foreground">
                      {pluralizar(ctrl.fotos.length, 'foto', 'fotos')}
                    </p>
                  </div>
                </div>

                {/* RN-02 (WU RF-003b): modelo ampliado para auditar antes de aprobar. */}
                {(ctrl.perimetros?.brazoRelajadoCm ||
                  ctrl.perimetros?.brazoContraidoCm ||
                  ctrl.perimetros?.musloMedioCm ||
                  ctrl.pliegues) && (
                  <div className="p-3.5 rounded-2xl bg-secondary/20 border border-border/60 space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Modelo ampliado (RN-02)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Brazo relajado</span>
                        <span className="font-mono font-bold text-foreground">
                          {ctrl.perimetros?.brazoRelajadoCm ?? ctrl.perimetros?.brazoCm
                            ? `${ctrl.perimetros?.brazoRelajadoCm ?? ctrl.perimetros?.brazoCm} cm`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Brazo contraído</span>
                        <span className="font-mono font-bold text-foreground">
                          {ctrl.perimetros?.brazoContraidoCm
                            ? `${ctrl.perimetros.brazoContraidoCm} cm`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Muslo medio</span>
                        <span className="font-mono font-bold text-foreground">
                          {ctrl.perimetros?.musloMedioCm ?? ctrl.perimetros?.musloCm
                            ? `${ctrl.perimetros?.musloMedioCm ?? ctrl.perimetros?.musloCm} cm`
                            : '—'}
                        </span>
                      </div>
                      {ctrl.pliegues && (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Pliegue tríceps</span>
                            <span className="font-mono font-bold text-foreground">
                              {ctrl.pliegues.tricepsMm ? `${ctrl.pliegues.tricepsMm} mm` : '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Pliegue subescapular</span>
                            <span className="font-mono font-bold text-foreground">
                              {ctrl.pliegues.subescapularMm
                                ? `${ctrl.pliegues.subescapularMm} mm`
                                : '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Pliegue suprailíaco</span>
                            <span className="font-mono font-bold text-foreground">
                              {ctrl.pliegues.suprailiacoMm ? `${ctrl.pliegues.suprailiacoMm} mm` : '—'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">Pliegue abdominal</span>
                            <span className="font-mono font-bold text-foreground">
                              {ctrl.pliegues.abdominalMm ? `${ctrl.pliegues.abdominalMm} mm` : '—'}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* RN-04: fotos del control pendiente para poder auditarlas (visor accesible). */}
                {ctrl.fotos.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Fotos de la toma
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {ctrl.fotos.map((foto) => {
                        const fallo = fotosConError.includes(foto.id);
                        const fechaCorta =
                          formatFechaCalendario(ctrl.fechaEvaluacion) ?? ctrl.fechaEvaluacion;
                        return (
                          <button
                            key={foto.id}
                            type="button"
                            onClick={() => setFotoVisor({ foto, fecha: ctrl.fechaEvaluacion })}
                            aria-label={`Ver foto ${etiquetaAngulo(foto.angulo)} de ${etiquetaAlumnoPendiente(ctrl)} del ${fechaCorta}`}
                            className="relative w-20 sm:w-24 aspect-3/4 rounded-2xl overflow-hidden border border-border bg-secondary/40 hover:border-primary/60 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            {foto.presignedGetUrl && !fallo ? (
                              <img
                                src={foto.presignedGetUrl}
                                alt=""
                                loading="lazy"
                                onError={() =>
                                  setFotosConError((prev) =>
                                    prev.includes(foto.id) ? prev : [...prev, foto.id]
                                  )
                                }
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                            ) : (
                              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                                <ImageOff className="h-4 w-4" />
                                <span className="text-[11px] font-semibold">Sin imagen</span>
                              </span>
                            )}
                            <span className="absolute bottom-0 inset-x-0 bg-background/80 backdrop-blur px-1.5 py-1 text-[11px] font-bold text-foreground flex items-center justify-center gap-1">
                              <Eye className="h-3 w-3" />
                              {etiquetaAngulo(foto.angulo)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span>Fotos protegidas: se muestran con un enlace temporal seguro.</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setActionError(null);
                        setErrorMotivo(null);
                        setMotivoRechazo('');
                        setControlARechazar(ctrl);
                      }}
                      className="py-2 px-4 rounded-xl border border-destructive/40 text-destructive hover:bg-destructive/10 font-bold text-xs transition-colors"
                    >
                      Rechazar
                    </button>
                    <button
                      onClick={() => handleConciliar(ctrl.id, 'aprobar')}
                      className="py-2 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md hover:brightness-110 active:scale-95 transition-all"
                    >
                      Aprobar y Consolidar
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* RF-004: comparador real A/B contra el endpoint (demo conservada vía fixture local). */
        <ComparadorAntropometrico />
      )}

      {/* RN-04 (WU RF-003b): rechazo con motivo libre (antes: textos fijos prefabricados). */}
      {controlARechazar && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isRechazando) cerrarModalRechazo();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            ref={refModalRechazo}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-rechazo-antro-title"
            tabIndex={-1}
            className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <h3 id="modal-rechazo-antro-title" className="font-bold text-base text-foreground">
                  Rechazar evaluación
                </h3>
              </div>
              <button
                type="button"
                onClick={cerrarModalRechazo}
                disabled={isRechazando}
                aria-label="Cerrar rechazo"
                className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Escribe el motivo del rechazo para{' '}
              <span className="font-bold text-foreground">
                {etiquetaAlumnoPendiente(controlARechazar)}
              </span>
              . Quedará registrado en el control como retroalimentación (RN-04).
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground" htmlFor="motivo-rechazo-antro">
                Motivo del rechazo
              </label>
              <textarea
                id="motivo-rechazo-antro"
                rows={4}
                value={motivoRechazo}
                onChange={(e) => {
                  setMotivoRechazo(e.target.value);
                  if (errorMotivo) setErrorMotivo(null);
                }}
                placeholder="Ej. Las fotos salieron borrosas y no permiten validar la postura; repite la toma con mejor luz."
                aria-invalid={Boolean(errorMotivo)}
                className={`w-full px-3 py-2 rounded-xl bg-background border text-sm text-foreground focus:outline-hidden focus:border-primary resize-none ${
                  errorMotivo ? 'border-destructive' : 'border-border'
                }`}
              />
              {errorMotivo && (
                <p role="alert" className="text-[11px] font-semibold text-destructive">
                  {errorMotivo}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cerrarModalRechazo}
                disabled={isRechazando}
                className="min-h-11 py-2.5 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleConciliar(controlARechazar.id, 'rechazar', motivoRechazo)}
                disabled={isRechazando || motivoRechazo.trim().length === 0}
                className="min-h-11 py-2.5 px-4 rounded-xl bg-destructive text-destructive-foreground font-bold text-xs shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRechazando ? 'Rechazando...' : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visor accesible de la foto auditada (Escape, trampa de foco y enlace temporal). */}
      {fotoVisor && (
        <VisorFoto
          foto={fotoVisor.foto}
          fecha={fotoVisor.fecha}
          onCerrar={() => setFotoVisor(null)}
        />
      )}
    </div>
  );
}
