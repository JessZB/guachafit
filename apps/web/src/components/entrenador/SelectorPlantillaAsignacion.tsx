import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ModoAsignacionPlantilla,
  type AsignacionPlantillaResponseDTO,
  type BloqueDiaRutinaDTO,
  type PlantillaRutinaDTO,
  type PlantillaRutinaResumenDTO,
} from '@guachafit/shared';
import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';
import { triggerHaptic } from '../../lib/haptics';
import {
  detallePlantillaDemo,
  plantillasDemoActivas,
} from '../../lib/demo-plantillas';
import { formatearSegundos } from '../../lib/sesion-tiempos';
import { pluralizar } from '../../lib/pluralizar';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import {
  ETIQUETAS_NIVEL_PLANTILLA,
  aplicarOverridesPreview,
  claveOverrideEjercicio,
  construirAjustesPlantilla,
  obtenerOverrideDeEjercicio,
  overrideTieneCambios,
  validarOverrideEjercicio,
  type ErrorAjuste,
  type OverrideAjusteEjercicio,
} from '../../lib/plantillas-rutina';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Dumbbell,
  Layers,
  Loader2,
  RefreshCw,
  Repeat2,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';

interface SelectorPlantillaAsignacionProps {
  /** `perfiles_alumno.id` del expediente abierto. */
  alumnoId: string;
  alumnoNombre: string;
  onCerrar: () => void;
  /** Se invoca tras una asignación con al menos un éxito (refresco del expediente). */
  onAsignada: (resultado: AsignacionPlantillaResponseDTO) => void;
}

/**
 * RF-017 Escenario 2 + RN-03: "Cargar desde Plantilla" en el Expediente 360°.
 * Selecciona una plantilla activa del banco, previsualiza días/ejercicios/series,
 * permite ajustar cargas particulares antes de confirmar y exige elegir explícitamente
 * entre Reemplazar y Fusionar la rutina del alumno.
 */
export function SelectorPlantillaAsignacion({
  alumnoId,
  alumnoNombre,
  onCerrar,
  onAsignada,
}: SelectorPlantillaAsignacionProps) {
  const { isDemoMode } = useAuth();
  const [plantillas, setPlantillas] = useState<PlantillaRutinaResumenDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const [detalle, setDetalle] = useState<PlantillaRutinaDTO | null>(null);
  const [cargandoDetalleId, setCargandoDetalleId] = useState<string | null>(null);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);

  const [overrides, setOverrides] = useState<Record<string, OverrideAjusteEjercicio>>({});
  const [modo, setModo] = useState<ModoAsignacionPlantilla>(ModoAsignacionPlantilla.REEMPLAZAR);
  const [isAsignando, setIsAsignando] = useState(false);
  const [resultado, setResultado] = useState<AsignacionPlantillaResponseDTO | null>(null);
  const [errorAsignacion, setErrorAsignacion] = useState<string | null>(null);
  const [erroresAjustes, setErroresAjustes] = useState<ErrorAjuste[]>([]);

  // U3b: Escape, trampa de Tab y restore del foco; el foco inicial sigue en el buscador
  // (`autoFocus`), por eso el hook no lo reasigna.
  const refDialogo = useDialogoAccesible({ onCerrar, enfocarAlAbrir: false });

  const cargarPlantillas = async () => {
    setIsLoading(true);
    setErrorCarga(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): mismas plantillas demo del banco, sin llamada API.
    if (isDemoMode) {
      setPlantillas(plantillasDemoActivas());
      setIsLoading(false);
      return;
    }

    try {
      const res = await apiClient<PlantillaRutinaResumenDTO[]>('/plantillas?activa=true');
      setPlantillas(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setErrorCarga(err?.message || 'No se pudieron cargar tus plantillas de ejercicios.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarPlantillas();
  }, [isDemoMode]);

  const plantillasFiltradas = useMemo(
    () =>
      plantillas.filter((p) =>
        !busqueda.trim() ? true : p.nombre.toLowerCase().includes(busqueda.toLowerCase())
      ),
    [plantillas, busqueda]
  );

  const seleccionarPlantilla = async (resumen: PlantillaRutinaResumenDTO) => {
    if (cargandoDetalleId) return;
    triggerHaptic('selection');
    setErrorDetalle(null);
    setOverrides({});
    setErroresAjustes([]);
    setResultado(null);
    setErrorAsignacion(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): el detalle sale del fixture local, sin llamada API.
    if (isDemoMode) {
      const demoDetalle = detallePlantillaDemo(resumen.id);
      if (!demoDetalle) {
        setDetalle(null);
        setErrorDetalle('No se pudo cargar el detalle de la plantilla.');
        return;
      }
      setDetalle(demoDetalle);
      return;
    }

    setCargandoDetalleId(resumen.id);
    try {
      const detalleRes = await apiClient<PlantillaRutinaDTO>(`/plantillas/${resumen.id}`);
      setDetalle(detalleRes);
    } catch (err: any) {
      setDetalle(null);
      setErrorDetalle(err?.message || 'No se pudo cargar el detalle de la plantilla.');
    } finally {
      setCargandoDetalleId(null);
    }
  };

  const actualizarOverride = (
    bloque: BloqueDiaRutinaDTO,
    ejercicio: BloqueDiaRutinaDTO['ejercicios'][number],
    campo: 'peso' | 'series' | 'reps',
    valor: string
  ) => {
    const clave = claveOverrideEjercicio(bloque.diaId, ejercicio.ejercicioId, ejercicio.nombre);
    // Al corregir un campo se descarta su error de confirmación anterior.
    setErroresAjustes((prev) => prev.filter((e) => e.clave !== clave));
    setOverrides((prev) => {
      const actual: OverrideAjusteEjercicio = prev[clave] ?? {
        diaId: bloque.diaId,
        ejercicioId: ejercicio.ejercicioId,
        nombreEjercicio: ejercicio.nombre,
        peso: '',
        series: '',
        reps: '',
      };
      const actualizado = { ...actual, [campo]: valor };
      const siguiente = { ...prev };
      if (overrideTieneCambios(actualizado)) {
        siguiente[clave] = actualizado;
      } else {
        delete siguiente[clave];
      }
      return siguiente;
    });
  };

  const limpiarOverride = (clave: string) => {
    triggerHaptic('selection');
    setOverrides((prev) => {
      const siguiente = { ...prev };
      delete siguiente[clave];
      return siguiente;
    });
    setErroresAjustes((prev) => prev.filter((e) => e.clave !== clave));
  };

  const bloquesPreview = useMemo(
    () => (detalle ? aplicarOverridesPreview(detalle.bloques, overrides) : []),
    [detalle, overrides]
  );

  const ajustesPendientes = useMemo(
    () => Object.values(overrides).filter(overrideTieneCambios).length,
    [overrides]
  );

  /** Tras un éxito no se permite re-confirmar: cada asignación crea/fusiona bloques reales. */
  const asignacionCompletada = Boolean(resultado && resultado.exitosos > 0);

  const confirmarAsignacion = async () => {
    if (!detalle || asignacionCompletada) return;
    const { ajustes, errores } = construirAjustesPlantilla(overrides);
    if (errores.length > 0) {
      setErroresAjustes(errores);
      triggerHaptic('warning');
      return;
    }

    // MODO DEMO EXPLÍCITO (isDemoMode): asignación simulada en estado local, sin llamada API.
    // No se invoca `onAsignada`: el refresco del padre consulta la API real, innecesaria en
    // demo porque el expediente ya se hidrata de fixtures.
    if (isDemoMode) {
      const res: AsignacionPlantillaResponseDTO = {
        plantillaId: detalle.id,
        modo,
        totalSolicitados: 1,
        exitosos: 1,
        fallidos: 0,
        resultados: [
          {
            alumnoId,
            exito: true,
            rutinaId: `demo-rutina-${alumnoId}`,
            rutinaNombre: detalle.nombre,
            bloquesTotal: detalle.bloques.length,
          },
        ],
      };
      setResultado(res);
      triggerHaptic('success');
      return;
    }

    setIsAsignando(true);
    setErrorAsignacion(null);
    setErroresAjustes([]);
    try {
      const res = await apiClient<AsignacionPlantillaResponseDTO>(
        `/plantillas/${detalle.id}/asignar`,
        {
          method: 'POST',
          body: JSON.stringify({
            alumnoIds: [alumnoId],
            modo,
            ...(ajustes.length > 0 ? { ajustes } : {}),
          }),
        }
      );
      setResultado(res);
      triggerHaptic(res.exitosos > 0 ? 'success' : 'warning');
      if (res.exitosos > 0) {
        onAsignada(res);
      }
      if (res.fallidos > 0) {
        setErrorAsignacion(
          res.resultados.find((r) => !r.exito)?.error || 'La asignación falló para el alumno.'
        );
      }
    } catch (err: any) {
      setErrorAsignacion(err?.message || 'No se pudo asignar la plantilla en el servidor.');
      triggerHaptic('warning');
    } finally {
      setIsAsignando(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-plantilla-asignar-title"
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-5xl space-y-5 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <div>
              <h3 id="modal-plantilla-asignar-title" className="font-black text-base text-foreground">
                Cargar desde Plantilla
              </h3>
              <p className="text-xs text-muted-foreground">
                Expediente de <span className="font-semibold text-foreground">{alumnoNombre}</span> ·
                elige una plantilla, ajusta cargas y confirma la asignación.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
            title="Cerrar"
            aria-label="Cerrar selector de plantilla"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr),minmax(0,3fr)] gap-5">
          {/* Columna izquierda: banco de plantillas */}
          <div className="space-y-3 lg:border-r lg:border-border/60 lg:pr-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                Plantillas Activas
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                {plantillas.length} disponibles
              </span>
            </div>

            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                autoFocus
                placeholder="Buscar plantilla..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
              />
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-16 rounded-2xl bg-secondary/30 border border-border/60 animate-pulse"
                  />
                ))}
              </div>
            ) : errorCarga ? (
              <div className="p-4 rounded-2xl bg-card border border-border text-center space-y-2">
                <AlertCircle className="h-5 w-5 text-destructive mx-auto" />
                <p className="text-[11px] text-muted-foreground">{errorCarga}</p>
                <button
                  type="button"
                  onClick={cargarPlantillas}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold text-[11px] cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3" />
                  Reintentar
                </button>
              </div>
            ) : plantillasFiltradas.length === 0 ? (
              <div className="p-4 rounded-2xl bg-card border border-dashed border-border text-center space-y-1.5">
                <Dumbbell className="h-5 w-5 text-muted-foreground mx-auto opacity-50" />
                <p className="text-[11px] font-bold text-foreground">
                  {plantillas.length === 0
                    ? 'No tienes plantillas activas'
                    : 'Sin coincidencias'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {plantillas.length === 0 ? (
                    <>
                      Crea una en el{' '}
                      <Link
                        to="/coach/plantillas"
                        className="text-primary font-bold hover:underline"
                        onClick={onCerrar}
                      >
                        Plantillas de ejercicios
                      </Link>{' '}
                      y vuelve a intentarlo.
                    </>
                  ) : (
                    'Ajusta el término de búsqueda.'
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {plantillasFiltradas.map((plantilla) => {
                  const seleccionada = detalle?.id === plantilla.id;
                  return (
                    <button
                      key={plantilla.id}
                      type="button"
                      onClick={() => seleccionarPlantilla(plantilla)}
                      disabled={Boolean(cargandoDetalleId)}
                      className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer disabled:opacity-60 ${
                        seleccionada
                          ? 'bg-primary/10 border-primary/50'
                          : 'bg-card border-border/70 hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-foreground leading-snug break-words">
                          {plantilla.nombre}
                        </span>
                        {cargandoDetalleId === plantilla.id ? (
                          <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
                        ) : (
                          seleccionada && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-secondary border border-border/60 text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                          {ETIQUETAS_NIVEL_PLANTILLA[plantilla.nivelObjetivo]}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {pluralizar(plantilla.totalDias, 'día', 'días')} ·{' '}
                          {pluralizar(plantilla.totalEjercicios, 'ejercicio', 'ejercicios')}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Columna derecha: preview + ajustes + confirmación */}
          <div className="space-y-4">
            {!detalle ? (
              <div className="p-8 rounded-2xl bg-secondary/15 border border-dashed border-border text-center space-y-2 h-full flex flex-col items-center justify-center">
                <ArrowLeft className="h-6 w-6 text-muted-foreground opacity-60" />
                <p className="text-xs font-bold text-foreground">Selecciona una plantilla</p>
                <p className="text-[11px] text-muted-foreground max-w-xs">
                  Verás los días, ejercicios, series y cargas prescritas antes de confirmar la
                  asignación.
                </p>
              </div>
            ) : errorDetalle ? (
              <div className="p-6 rounded-2xl bg-card border border-border text-center space-y-2">
                <AlertCircle className="h-6 w-6 text-destructive mx-auto" />
                <p className="text-[11px] text-muted-foreground">{errorDetalle}</p>
              </div>
            ) : (
              <>
                {/* Cabecera de la plantilla seleccionada */}
                <div className="p-4 rounded-2xl bg-secondary/25 border border-border/60 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-black text-foreground break-words">{detalle.nombre}</h4>
                    <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide border bg-secondary text-foreground border-border">
                      {ETIQUETAS_NIVEL_PLANTILLA[detalle.nivelObjetivo]}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {pluralizar(detalle.bloques.length, 'bloque de día', 'bloques de día')} ·{' '}
                    {pluralizar(
                      detalle.bloques.reduce((t, b) => t + b.ejercicios.length, 0),
                      'ejercicio',
                      'ejercicios'
                    )}
                    {ajustesPendientes > 0 && (
                      <span className="text-primary font-bold">
                        {' '}
                        · {ajustesPendientes} ajuste{ajustesPendientes === 1 ? '' : 's'} de carga
                      </span>
                    )}
                  </p>
                </div>

                {/* Modo de asignación (RN-03) */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Repeat2 className="h-3.5 w-3.5 text-primary" />
                    Modo de Asignación
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label
                      className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                        modo === ModoAsignacionPlantilla.REEMPLAZAR
                          ? 'bg-primary/10 border-primary/50'
                          : 'bg-card border-border/70 hover:border-primary/30'
                      }`}
                    >
                      <input
                        type="radio"
                        name="modo-asignacion-plantilla"
                        value={ModoAsignacionPlantilla.REEMPLAZAR}
                        checked={modo === ModoAsignacionPlantilla.REEMPLAZAR}
                        onChange={() => setModo(ModoAsignacionPlantilla.REEMPLAZAR)}
                        disabled={asignacionCompletada}
                        className="sr-only"
                      />
                      <span className="text-xs font-bold text-foreground block">
                        Reemplazar rutina activa
                      </span>
                      <span className="text-[11px] text-muted-foreground block mt-1 leading-snug">
                        Sustituye la rutina vigente de {alumnoNombre} por esta plantilla. La rutina
                        anterior deja de estar activa; su historial no se borra.
                      </span>
                    </label>

                    <label
                      className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                        modo === ModoAsignacionPlantilla.FUSIONAR
                          ? 'bg-primary/10 border-primary/50'
                          : 'bg-card border-border/70 hover:border-primary/30'
                      }`}
                    >
                      <input
                        type="radio"
                        name="modo-asignacion-plantilla"
                        value={ModoAsignacionPlantilla.FUSIONAR}
                        checked={modo === ModoAsignacionPlantilla.FUSIONAR}
                        onChange={() => setModo(ModoAsignacionPlantilla.FUSIONAR)}
                        disabled={asignacionCompletada}
                        className="sr-only"
                      />
                      <span className="text-xs font-bold text-foreground block">
                        Fusionar con la rutina activa
                      </span>
                      <span className="text-[11px] text-muted-foreground block mt-1 leading-snug">
                        Anexa los días de la plantilla a los bloques existentes sin borrar ninguno. Si
                        no hay rutina activa, se crea como nueva.
                      </span>
                    </label>
                  </div>
                </div>

                {/* Preview con ajustes */}
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                    Previsualización y Ajustes de Carga
                  </span>

                  <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                    {bloquesPreview.map((bloque) => (
                      <div
                        key={bloque.diaId}
                        className="p-3.5 rounded-2xl bg-secondary/20 border border-border/60 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-extrabold text-foreground">
                            {bloque.titulo}
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {pluralizar(bloque.ejercicios.length, 'ejercicio', 'ejercicios')}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {bloque.ejercicios.map((ej, ejIdx) => {
                            const clave = claveOverrideEjercicio(
                              bloque.diaId,
                              ej.ejercicioId,
                              ej.nombre
                            );
                            const override = obtenerOverrideDeEjercicio(
                              overrides,
                              bloque.diaId,
                              ej
                            );
                            const erroresCampo = override ? validarOverrideEjercicio(override) : {};
                            const ajustado = Boolean(override && overrideTieneCambios(override));
                            const errorAjuste = erroresAjustes.find((e) => e.clave === clave);

                            return (
                              <div
                                key={ej.id || clave || ejIdx}
                                className={`p-2.5 rounded-xl bg-card border text-xs space-y-2 ${
                                  ajustado ? 'border-primary/50' : 'border-border/60'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <span className="h-4.5 w-4.5 rounded-md bg-primary/10 text-primary font-mono font-black flex items-center justify-center text-[11px] shrink-0">
                                      {ejIdx + 1}
                                    </span>
                                    <span className="font-bold text-foreground break-words">
                                      {ej.nombre}
                                    </span>
                                    {ajustado && (
                                      <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-primary/15 text-primary text-[11px] font-extrabold uppercase">
                                        ajustado
                                      </span>
                                    )}
                                  </div>
                                  {ajustado && (
                                    <button
                                      type="button"
                                      onClick={() => limpiarOverride(clave)}
                                      disabled={asignacionCompletada}
                                      className="text-[11px] font-bold text-muted-foreground hover:text-foreground underline cursor-pointer shrink-0 disabled:opacity-50"
                                      title="Descartar los ajustes de este ejercicio"
                                    >
                                      Restablecer
                                    </button>
                                  )}
                                </div>

                                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap font-mono text-[11px] text-muted-foreground">
                                  <span className="px-1.5 py-0.5 rounded-md bg-secondary border border-border/60 font-bold text-foreground">
                                    {pluralizar(ej.series, 'serie', 'series')} × {ej.reps}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded-md bg-primary/10 border border-primary/20 font-bold text-primary">
                                    {ej.peso || 'sin carga'}
                                  </span>
                                  {ej.rpe && <span>RPE {ej.rpe}</span>}
                                  <span>Descanso: {formatearSegundos(ej.descansoSegundos || 90)}</span>
                                </div>

                                {/* Overrides de peso / series / reps */}
                                <div className="flex items-end gap-2 flex-wrap pt-1.5 border-t border-border/40">
                                  <div className="flex flex-col">
                                    <label className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">
                                      Peso (kg)
                                    </label>
                                    <input
                                      type="text"
                                      value={override?.peso ?? ''}
                                      onChange={(e) =>
                                        actualizarOverride(bloque, ej, 'peso', e.target.value)
                                      }
                                      disabled={asignacionCompletada}
                                      placeholder={
                                        ej.peso && /^\d/.test(ej.peso)
                                          ? ej.peso.replace(/[^\d.]/g, '')
                                          : 'sin cambio'
                                      }
                                      aria-invalid={Boolean(erroresCampo.peso)}
                                      className={`h-7 w-20 px-2 rounded-lg bg-background border text-center font-mono font-bold text-[11px] text-foreground focus:outline-hidden focus:border-primary transition-colors ${
                                        erroresCampo.peso ? 'border-destructive/70' : 'border-border'
                                      }`}
                                    />
                                  </div>

                                  <div className="flex flex-col">
                                    <label className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">
                                      Series
                                    </label>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={override?.series ?? ''}
                                      onChange={(e) =>
                                        actualizarOverride(bloque, ej, 'series', e.target.value)
                                      }
                                      disabled={asignacionCompletada}
                                      placeholder={String(ej.series)}
                                      aria-invalid={Boolean(erroresCampo.series)}
                                      className={`h-7 w-14 px-1.5 rounded-lg bg-background border text-center font-mono font-bold text-[11px] text-foreground focus:outline-hidden focus:border-primary transition-colors ${
                                        erroresCampo.series ? 'border-destructive/70' : 'border-border'
                                      }`}
                                    />
                                  </div>

                                  <div className="flex flex-col">
                                    <label className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">
                                      Reps
                                    </label>
                                    <input
                                      type="text"
                                      value={override?.reps ?? ''}
                                      onChange={(e) =>
                                        actualizarOverride(bloque, ej, 'reps', e.target.value)
                                      }
                                      disabled={asignacionCompletada}
                                      placeholder={ej.reps}
                                      aria-invalid={Boolean(erroresCampo.reps)}
                                      className={`h-7 w-16 px-1.5 rounded-lg bg-background border text-center font-mono font-bold text-[11px] text-foreground focus:outline-hidden focus:border-primary transition-colors ${
                                        erroresCampo.reps ? 'border-destructive/70' : 'border-border'
                                      }`}
                                    />
                                  </div>
                                </div>

                                {(erroresCampo.peso || erroresCampo.series || erroresCampo.reps) && (
                                  <p className="text-[11px] font-bold text-destructive">
                                    {erroresCampo.peso || erroresCampo.series || erroresCampo.reps}
                                  </p>
                                )}
                                {errorAjuste && !erroresCampo.peso && !erroresCampo.series && !erroresCampo.reps && (
                                  <p className="text-[11px] font-bold text-destructive">
                                    {errorAjuste.mensaje}
                                  </p>
                                )}

                                {ej.notas && (
                                  <p className="text-[11px] text-muted-foreground leading-snug">
                                    <span className="font-bold text-foreground">Nota técnica:</span>{' '}
                                    {ej.notas}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resultado de la asignación */}
                {resultado && resultado.exitosos > 0 && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="p-3 rounded-2xl bg-success/10 border border-success/30 text-success text-xs flex items-start gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="block font-bold">
                        Planificación asignada a {alumnoNombre}.
                      </span>
                      <span className="block text-[11px] text-success/80">
                        {resultado.modo === ModoAsignacionPlantilla.REEMPLAZAR
                          ? 'Rutina activa reemplazada'
                          : 'Días fusionados con la rutina activa'}
                        {resultado.resultados[0]?.rutinaNombre
                          ? ` · «${resultado.resultados[0].rutinaNombre}»`
                          : ''}
                        {resultado.resultados[0]?.bloquesTotal
                          ? ` · ${pluralizar(resultado.resultados[0].bloquesTotal, 'bloque', 'bloques')}`
                          : ''}
                        . El expediente ya refleja la rutina vigente.
                      </span>
                    </div>
                  </div>
                )}

                {errorAsignacion && (
                  <div className="p-3 rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorAsignacion}</span>
                  </div>
                )}

                {erroresAjustes.length > 0 && (
                  <div
                    role="alert"
                    className="p-3 rounded-2xl bg-warning/10 border border-warning/30 text-warning text-xs flex items-start gap-2"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="block font-bold">
                        Revisa los ajustes marcados antes de confirmar.
                      </span>
                      <span className="block text-[11px] text-warning/80">
                        {erroresAjustes[0].mensaje}
                      </span>
                    </div>
                  </div>
                )}

                {/* Footer del modal */}
                <div className="pt-3 border-t border-border/80 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {ajustesPendientes} ajuste{ajustesPendientes === 1 ? '' : 's'} por confirmar
                  </span>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isAsignando}
                      onClick={onCerrar}
                      className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs cursor-pointer disabled:opacity-50"
                    >
                      Cerrar
                    </button>
                    <button
                      type="button"
                      disabled={isAsignando || asignacionCompletada}
                      onClick={confirmarAsignacion}
                      title={
                        asignacionCompletada
                          ? 'La asignación ya se completó. Cierra el panel para asignar otra plantilla o modo.'
                          : undefined
                      }
                      className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isAsignando ? (
                        <>
                          <div className="h-3 w-3 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                          <span>Asignando...</span>
                        </>
                      ) : asignacionCompletada ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Asignación Completada</span>
                        </>
                      ) : (
                        <>
                          <Dumbbell className="h-3.5 w-3.5" />
                          <span>Confirmar Asignación</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
