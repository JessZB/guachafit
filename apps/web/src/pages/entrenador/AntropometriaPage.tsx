import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';
import {
  ControlAntropometricoDetalleDTO,
  ColaPendientesAntropometricosDTO,
  AnguloFoto,
  ComparativaAngularDTO,
} from '@guachafit/shared';
import {
  etiquetaAlumnoPendiente,
  filtrarPendientesAntropometria,
  hayBusquedaAntropometriaActiva,
} from '../../lib/antropometria-filtros';
import { pluralizar } from '../../lib/pluralizar';
import { rebanarPagina } from '../../lib/paginacion';
import { usePaginacionServidor } from '../../lib/use-paginacion-servidor';
import { Paginacion } from '../../components/common/Paginacion';
import {
  Camera,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Sliders,
  Calendar,
  AlertCircle,
  Eye,
  ShieldCheck,
  Scale,
  RotateCcw,
  Search,
  SearchX,
} from 'lucide-react';

/**
 * WU25b: cola demo de evaluaciones pendientes (mismo fixture de WU20). Solo se usa con
 * `isDemoMode` activo; el slice de página se corta localmente con la misma aritmética del API.
 */
function crearPendientesDemo(): ControlAntropometricoDetalleDTO[] {
  return [
    {
      id: 'ctrl-p1',
      alumnoId: 'al-002',
      alumnoNombre: 'Mariana Pérez Gómez',
      fechaEvaluacion: '2026-09-06',
      pesoKg: '68.20',
      alturaCm: '165.00',
      porcentajeGrasa: '21.50',
      perimetros: { cinturaCm: '72.00', caderaCm: '98.00', musloCm: '55.00' },
      modalidad: 'remoto' as any,
      origen: 'remoto_autoreporte' as any,
      registradoPor: 'al-002',
      estado: 'pendiente_aprobacion' as any,
      fotos: [
        {
          id: 'fp-1',
          controlId: 'ctrl-p1',
          angulo: AnguloFoto.FRONTAL,
          storageKey: 'antropometria/demo/2026/frontal.webp',
          createdAtUtc: new Date().toISOString(),
        },
      ],
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
    },
  ];
}

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
  const [angulo, setAngulo] = useState<AnguloFoto>(AnguloFoto.FRONTAL);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

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
        const cola = crearPendientesDemo().filter((ctrl) => !idsResueltosDemo.includes(ctrl.id));
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

  const handleConciliar = async (id: string, accion: 'aprobar' | 'rechazar') => {
    setActionError(null);

    try {
      await apiClient(`/antropometria/${id}/conciliar`, {
        method: 'PATCH',
        body: JSON.stringify({
          accion,
          observacionesCoach: accion === 'aprobar' ? 'Progreso validado por coach' : 'Fotos borrosas',
          motivoRechazo: accion === 'rechazar' ? 'Por favor repetir fotos con mejor luz' : undefined,
        }),
      });
    } catch (err: any) {
      // D5: sin éxito falso ni desaparición optimista; la evaluación sigue pendiente.
      setActionError(
        err?.message || 'No se pudo conciliar la evaluación. Revisa tu conexión e inténtalo de nuevo.'
      );
      return;
    }

    // WU25b: el servidor manda; se recarga la página actual (el hook ajusta si el total encogió).
    // En demo se registra el id resuelto y el slice local se recalcula.
    if (isDemoMode) setIdsResueltosDemo((prev) => [...prev, id]);
    else recargar();
    setActionSuccess(
      accion === 'aprobar'
        ? 'Evaluación aprobada y consolidada en las curvas del alumno.'
        : 'Evaluación rechazada.'
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
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2">
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
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
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
                      Fecha de Toma: {ctrl.fechaEvaluacion}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 uppercase">
                      Pendiente Aprobación
                    </span>
                  </div>
                  <span className="text-xs font-bold text-foreground">
                    {etiquetaAlumnoPendiente(ctrl)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-2xl bg-secondary/30">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Peso
                    </span>
                    <p className="font-mono font-bold text-base text-foreground">{ctrl.pesoKg} kg</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-secondary/30">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      % Grasa
                    </span>
                    <p className="font-mono font-bold text-base text-foreground">
                      {ctrl.porcentajeGrasa ? `${ctrl.porcentajeGrasa}%` : 'N/D'}
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-secondary/30">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Cintura
                    </span>
                    <p className="font-mono font-bold text-base text-foreground">
                      {ctrl.perimetros?.cinturaCm ? `${ctrl.perimetros.cinturaCm} cm` : 'N/D'}
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-secondary/30">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Fotos Adjuntas
                    </span>
                    <p className="font-mono font-bold text-base text-foreground">
                      {ctrl.fotos.length === 1 ? '1 foto' : `${ctrl.fotos.length} fotos`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span>Fotos protegidas: se muestran con un enlace temporal seguro.</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleConciliar(ctrl.id, 'rechazar')}
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
      ) : isDemoMode ? (
        /* Photo Comparator (solo demo: las cifras de ejemplo viven tras isDemoMode) */
        <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div>
              <h2 className="font-black text-lg text-foreground">
                Comparativa Visual Lado a Lado
              </h2>
              <p className="text-xs text-muted-foreground">
                Analiza la recomposición corporal entre dos fechas de control.
              </p>
            </div>

            {/* Angle Selector */}
            <div className="flex items-center gap-1.5 bg-secondary/60 p-1 rounded-2xl border border-border">
              {[AnguloFoto.FRONTAL, AnguloFoto.LATERAL, AnguloFoto.POSTERIOR].map((a) => (
                <button
                  key={a}
                  onClick={() => setAngulo(a)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${
                    angulo === a
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Comparison Stage */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Control A (Before) */}
            <div className="p-5 rounded-3xl bg-secondary/30 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase">
                  Toma A (01 Julio 2026)
                </span>
                <span className="font-mono font-bold text-xs text-foreground">77.70 kg</span>
              </div>
              <div className="aspect-3/4 rounded-2xl bg-background/60 border border-border flex flex-col items-center justify-center text-muted-foreground space-y-2 p-6 text-center">
                <Camera className="h-10 w-10 text-primary/60" />
                <span className="text-xs font-semibold">Perspectiva {angulo}</span>
                <span className="text-[10px] text-muted-foreground">
                  Grasa: 17.20% • Cintura: 85 cm
                </span>
              </div>
            </div>

            {/* Control B (After) */}
            <div className="p-5 rounded-3xl bg-primary/5 border border-primary/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary uppercase">
                  Toma B (01 Septiembre 2026)
                </span>
                <span className="font-mono font-bold text-xs text-foreground">74.50 kg</span>
              </div>
              <div className="aspect-3/4 rounded-2xl bg-background/60 border border-border flex flex-col items-center justify-center text-muted-foreground space-y-2 p-6 text-center">
                <Camera className="h-10 w-10 text-primary" />
                <span className="text-xs font-semibold text-foreground">Perspectiva {angulo}</span>
                <span className="text-[10px] text-emerald-400 font-bold">
                  Grasa: 14.80% (-2.40%) • Cintura: 81 cm (-4 cm)
                </span>
              </div>
            </div>
          </div>

          {/* Delta Summary Pill */}
          <div className="p-4 rounded-2xl bg-secondary/50 border border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              <span className="text-xs font-bold text-foreground">
                Cambio Neto Total en el Periodo:
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono font-bold">
              <span className="text-emerald-400">Variación de peso: -3.20 kg</span>
              <span className="text-emerald-400">Variación de grasa: -2.40%</span>
            </div>
          </div>
        </div>
      ) : (
        /* D2: en sesión real no se muestran cifras de comparación inventadas */
        <div className="p-10 rounded-3xl bg-card border border-dashed border-border text-center space-y-3">
          <Camera className="h-10 w-10 text-muted-foreground mx-auto opacity-40" />
          <h3 className="font-bold text-base text-foreground">Sin evaluaciones comparables</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Cuando existan al menos dos evaluaciones aprobadas podrás comparar la evolución
            fotográfica lado a lado.
          </p>
        </div>
      )}
    </div>
  );
}
