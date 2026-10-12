import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
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
import { pluralizar } from '../../lib/pluralizar';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { traducirMensajeSuelto } from '../../lib/mensajes-error';
import { textoConfirmacionReemplazo } from '../../lib/asignacion-masiva';
import { DialogoConfirmacion } from '../common/DialogoConfirmacion';
import {
  filtrarEntradaPeso,
  filtrarEntradaRepsPrescritas,
  filtrarEntradaSeries,
} from '../../lib/entrada-numerica';
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
  PASOS_ASIGNACION,
  resumenAsignacion,
  textoEjercicioPlantilla,
  textoPaso,
  type PasoAsignacion,
} from '../../lib/asignacion-pasos';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Loader2,
  RefreshCw,
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
  // C4: reemplazar la rutina actual del alumno pide confirmación explícita.
  const [confirmandoReemplazo, setConfirmandoReemplazo] = useState(false);
  // Lote E6: el formulario avanza en 3 pasos; en el 2 solo hay un día abierto y los campos
  // de ajuste aparecen al pulsar "Ajustar" en cada ejercicio.
  const [paso, setPaso] = useState<PasoAsignacion>('elegir');
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  const [ajustando, setAjustando] = useState<Set<string>>(() => new Set());
  const refResumenErrores = useRef<HTMLDivElement>(null);
  const idBase = useId();

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
    setAjustando(new Set());
    setDiaAbierto(null);
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

  const alternarAjuste = (clave: string) =>
    setAjustando((previos) => {
      const siguientes = new Set(previos);
      if (siguientes.has(clave)) siguientes.delete(clave);
      else siguientes.add(clave);
      return siguientes;
    });

  /** Paso 2: al entrar se abre el primer día (o se conserva el que ya estaba abierto). */
  const irARevisar = () => {
    if (!detalle) return;
    setDiaAbierto((actual) =>
      actual && detalle.bloques.some((b) => b.diaId === actual) ? actual : detalle.bloques[0]?.diaId ?? null
    );
    setPaso('revisar');
  };

  // Resumen de errores enfocable: al aparecer recibe el foco para que se lea primero.
  useEffect(() => {
    if (paso === 'revisar' && erroresAjustes.length > 0) refResumenErrores.current?.focus();
  }, [paso, erroresAjustes]);

  const ajustesPendientes = useMemo(
    () => Object.values(overrides).filter(overrideTieneCambios).length,
    [overrides]
  );

  /** Tras un éxito no se permite re-confirmar: cada asignación crea/fusiona bloques reales. */
  const asignacionCompletada = Boolean(resultado && resultado.exitosos > 0);

  const confirmarAsignacion = async (reemplazoConfirmado = false) => {
    if (!detalle || asignacionCompletada) return;
    const { ajustes, errores } = construirAjustesPlantilla(overrides);
    if (errores.length > 0) {
      // Vuelve al paso 2 con el día y los campos del primer ajuste inválido a la vista.
      setErroresAjustes(errores);
      const primera = errores[0].clave;
      const bloque = detalle.bloques.find((b) =>
        b.ejercicios.some((ej) => claveOverrideEjercicio(b.diaId, ej.ejercicioId, ej.nombre) === primera)
      );
      if (bloque) setDiaAbierto(bloque.diaId);
      setAjustando((previos) => new Set(previos).add(primera));
      setPaso('revisar');
      triggerHaptic('warning');
      return;
    }
    if (modo === ModoAsignacionPlantilla.REEMPLAZAR && !reemplazoConfirmado) {
      setConfirmandoReemplazo(true);
      return;
    }
    setConfirmandoReemplazo(false);

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
        // A6/C6: el error crudo de `resultados[].error` se traduce antes de mostrarse.
        setErrorAsignacion(traducirMensajeSuelto(res.resultados.find((r) => !r.exito)?.error));
      }
    } catch (err: any) {
      setErrorAsignacion(err?.message || 'No se pudo asignar la plantilla en el servidor.');
      triggerHaptic('warning');
    } finally {
      setIsAsignando(false);
    }
  };

  const totalEjercicios = detalle ? detalle.bloques.reduce((t, b) => t + b.ejercicios.length, 0) : 0;
  const puedeAvanzar = Boolean(detalle && !errorDetalle && !cargandoDetalleId);
  const indicePaso = PASOS_ASIGNACION.indexOf(paso);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-plantilla-asignar-title"
        tabIndex={-1}
        className="w-full sm:max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] bg-card sm:rounded-3xl sm:border border-border shadow-2xl flex flex-col"
      >
        {/* Cabecera: título, alumno y paso actual con su barra de progreso */}
        <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-border/80 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="modal-plantilla-asignar-title" className="text-lg font-bold text-foreground">
                Asignar rutina
              </h2>
              <p className="text-sm text-muted-foreground break-words">Para {alumnoNombre}</p>
            </div>
            <button
              type="button"
              onClick={onCerrar}
              className="min-h-11 min-w-11 shrink-0 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Cerrar selector de plantilla"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">{textoPaso(paso)}</p>
            <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
              {PASOS_ASIGNACION.map((p, i) => (
                <span
                  key={p}
                  className={`h-1.5 rounded-full ${i <= indicePaso ? 'bg-primary' : 'bg-secondary'}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Contenido del paso */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {paso === 'elegir' && (
            <>
              <div className="space-y-1.5">
                <label htmlFor={`${idBase}-busqueda`} className="text-sm font-medium text-foreground">
                  Buscar plantilla
                </label>
                <div className="relative">
                  <Search
                    className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id={`${idBase}-busqueda`}
                    type="search"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    autoFocus
                    placeholder="Nombre de la plantilla"
                    className="w-full min-h-11 pl-9 pr-3 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              {isLoading ? (
                <div className="space-y-2" aria-label="Cargando plantillas">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-14 rounded-xl bg-secondary/40 animate-pulse" />
                  ))}
                </div>
              ) : errorCarga ? (
                <div role="alert" className="py-6 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">{errorCarga}</p>
                  <button
                    type="button"
                    onClick={cargarPlantillas}
                    className="min-h-11 inline-flex items-center gap-1.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold text-sm cursor-pointer"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Reintentar
                  </button>
                </div>
              ) : plantillasFiltradas.length === 0 ? (
                <div className="py-6 text-center space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {plantillas.length === 0 ? 'No tienes plantillas activas' : 'Sin coincidencias'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {plantillas.length === 0 ? (
                      <>
                        Crea una en{' '}
                        <Link
                          to="/coach/plantillas"
                          className="text-primary font-semibold hover:underline"
                          onClick={onCerrar}
                        >
                          Plantillas de ejercicios
                        </Link>{' '}
                        y vuelve a intentarlo.
                      </>
                    ) : (
                      'Prueba con otro nombre.'
                    )}
                  </p>
                </div>
              ) : (
                <ul role="list" className="divide-y divide-border/70 border-y border-border/70">
                  {plantillasFiltradas.map((plantilla) => {
                    const seleccionada = detalle?.id === plantilla.id;
                    return (
                      <li key={plantilla.id}>
                        <button
                          type="button"
                          onClick={() => seleccionarPlantilla(plantilla)}
                          disabled={Boolean(cargandoDetalleId)}
                          aria-pressed={seleccionada}
                          className={`w-full min-h-14 px-3 py-3 flex items-center gap-3 text-left cursor-pointer transition-colors disabled:opacity-60 ${
                            seleccionada ? 'bg-primary/10' : 'hover:bg-secondary/50'
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-foreground break-words">
                              {plantilla.nombre}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {ETIQUETAS_NIVEL_PLANTILLA[plantilla.nivelObjetivo]} ·{' '}
                              {pluralizar(plantilla.totalDias, 'día', 'días')} ·{' '}
                              {pluralizar(plantilla.totalEjercicios, 'ejercicio', 'ejercicios')}
                            </span>
                          </span>
                          {cargandoDetalleId === plantilla.id ? (
                            <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" aria-hidden="true" />
                          ) : (
                            seleccionada && (
                              <CheckCircle2 className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
                            )
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {errorDetalle && (
                <p role="alert" className="text-sm text-destructive">
                  {errorDetalle}
                </p>
              )}
            </>
          )}

          {paso === 'revisar' && detalle && (
            <>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{detalle.nombre}</span> ·{' '}
                {pluralizar(detalle.bloques.length, 'día', 'días')} ·{' '}
                {pluralizar(totalEjercicios, 'ejercicio', 'ejercicios')}
                {ajustesPendientes > 0 && (
                  <span className="text-primary font-semibold">
                    {' '}
                    · {pluralizar(ajustesPendientes, 'ajuste', 'ajustes')}
                  </span>
                )}
              </p>

              {erroresAjustes.length > 0 && (
                <div
                  ref={refResumenErrores}
                  role="alert"
                  tabIndex={-1}
                  className="p-3 rounded-xl bg-warning/10 border border-warning/30 text-sm text-foreground space-y-1 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-warning"
                >
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-warning shrink-0" aria-hidden="true" />
                    Revisa estos ajustes antes de asignar:
                  </p>
                  <ul className="list-disc pl-6 space-y-0.5">
                    {erroresAjustes.map((error) => (
                      <li key={error.clave}>{error.mensaje}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="divide-y divide-border/70 border-y border-border/70">
                {bloquesPreview.map((bloque) => {
                  const abierto = diaAbierto === bloque.diaId;
                  const idPanel = `${idBase}-dia-${bloque.diaId}`;
                  return (
                    <section key={bloque.diaId}>
                      <h3>
                        <button
                          type="button"
                          aria-expanded={abierto}
                          aria-controls={idPanel}
                          onClick={() => setDiaAbierto(abierto ? null : bloque.diaId)}
                          className="w-full min-h-12 py-3 flex items-center justify-between gap-3 text-left cursor-pointer"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-foreground break-words">
                              {bloque.titulo}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {pluralizar(bloque.ejercicios.length, 'ejercicio', 'ejercicios')}
                            </span>
                          </span>
                          <ChevronDown
                            className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                              abierto ? 'rotate-180' : ''
                            }`}
                            aria-hidden="true"
                          />
                        </button>
                      </h3>

                      {abierto && (
                        <ul id={idPanel} className="pb-3 space-y-1">
                          {bloque.ejercicios.map((ej, ejIdx) => {
                            const clave = claveOverrideEjercicio(bloque.diaId, ej.ejercicioId, ej.nombre);
                            const override = obtenerOverrideDeEjercicio(overrides, bloque.diaId, ej);
                            const erroresCampo = override ? validarOverrideEjercicio(override) : {};
                            const ajustado = Boolean(override && overrideTieneCambios(override));
                            const errorAjuste = erroresAjustes.find((e) => e.clave === clave);
                            const editando = ajustando.has(clave);
                            const errorVisible =
                              erroresCampo.peso || erroresCampo.series || erroresCampo.reps || errorAjuste?.mensaje;
                            return (
                              <li key={ej.id || clave || ejIdx} className="py-2.5 space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground break-words">
                                      {ej.nombre}
                                      {ajustado && (
                                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-semibold align-middle">
                                          Ajustado
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-sm text-muted-foreground">{textoEjercicioPlantilla(ej)}</p>
                                    {ej.notas && (
                                      <p className="text-xs text-muted-foreground">Nota técnica: {ej.notas}</p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => alternarAjuste(clave)}
                                    disabled={asignacionCompletada}
                                    aria-expanded={editando}
                                    aria-label={`Ajustar ${ej.nombre}`}
                                    className="min-h-11 shrink-0 px-3 rounded-xl border border-border text-sm font-medium text-foreground hover:border-primary/40 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                  >
                                    <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
                                    Ajustar
                                  </button>
                                </div>

                                {editando && (
                                  <div className="flex items-end gap-3 flex-wrap pl-0.5">
                                    <div className="flex flex-col gap-1">
                                      <label
                                        htmlFor={`${idBase}-${bloque.diaId}-${ejIdx}-peso`}
                                        className="text-xs font-medium text-muted-foreground"
                                      >
                                        Peso (kg)
                                      </label>
                                      <input
                                        id={`${idBase}-${bloque.diaId}-${ejIdx}-peso`}
                                        type="text"
                                        inputMode="decimal"
                                        value={override?.peso ?? ''}
                                        onChange={(e) => {
                                          const anterior = override?.peso ?? '';
                                          const filtrado = filtrarEntradaPeso(e.target.value, anterior, 'kg');
                                          if (filtrado !== anterior) actualizarOverride(bloque, ej, 'peso', filtrado);
                                        }}
                                        disabled={asignacionCompletada}
                                        placeholder="sin cambio"
                                        aria-invalid={Boolean(erroresCampo.peso)}
                                        className={`h-11 w-24 px-2 rounded-lg bg-background border text-center font-mono text-sm text-foreground focus:outline-hidden focus:border-primary ${
                                          erroresCampo.peso ? 'border-destructive/70' : 'border-border'
                                        }`}
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label
                                        htmlFor={`${idBase}-${bloque.diaId}-${ejIdx}-series`}
                                        className="text-xs font-medium text-muted-foreground"
                                      >
                                        Series
                                      </label>
                                      <input
                                        id={`${idBase}-${bloque.diaId}-${ejIdx}-series`}
                                        type="text"
                                        inputMode="numeric"
                                        value={override?.series ?? ''}
                                        onChange={(e) => {
                                          const anterior = override?.series ?? '';
                                          const filtrado = filtrarEntradaSeries(e.target.value, anterior);
                                          if (filtrado !== anterior) actualizarOverride(bloque, ej, 'series', filtrado);
                                        }}
                                        disabled={asignacionCompletada}
                                        placeholder={String(ej.series)}
                                        aria-invalid={Boolean(erroresCampo.series)}
                                        className={`h-11 w-16 px-2 rounded-lg bg-background border text-center font-mono text-sm text-foreground focus:outline-hidden focus:border-primary ${
                                          erroresCampo.series ? 'border-destructive/70' : 'border-border'
                                        }`}
                                      />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                      <label
                                        htmlFor={`${idBase}-${bloque.diaId}-${ejIdx}-reps`}
                                        className="text-xs font-medium text-muted-foreground"
                                      >
                                        Repeticiones
                                      </label>
                                      <input
                                        id={`${idBase}-${bloque.diaId}-${ejIdx}-reps`}
                                        type="text"
                                        value={override?.reps ?? ''}
                                        onChange={(e) => {
                                          const anterior = override?.reps ?? '';
                                          const filtrado = filtrarEntradaRepsPrescritas(e.target.value, anterior);
                                          if (filtrado !== anterior) actualizarOverride(bloque, ej, 'reps', filtrado);
                                        }}
                                        disabled={asignacionCompletada}
                                        placeholder={ej.reps}
                                        aria-invalid={Boolean(erroresCampo.reps)}
                                        className={`h-11 w-20 px-2 rounded-lg bg-background border text-center font-mono text-sm text-foreground focus:outline-hidden focus:border-primary ${
                                          erroresCampo.reps ? 'border-destructive/70' : 'border-border'
                                        }`}
                                      />
                                    </div>
                                    {ajustado && (
                                      <button
                                        type="button"
                                        onClick={() => limpiarOverride(clave)}
                                        disabled={asignacionCompletada}
                                        className="min-h-11 px-2 text-sm font-medium text-muted-foreground hover:text-foreground underline cursor-pointer disabled:opacity-50"
                                      >
                                        Restablecer
                                      </button>
                                    )}
                                  </div>
                                )}

                                {errorVisible && (
                                  <p className="text-sm font-medium text-destructive">{errorVisible}</p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            </>
          )}

          {paso === 'confirmar' && detalle && (
            <>
              <fieldset className="space-y-2" disabled={asignacionCompletada}>
                <legend className="text-sm font-semibold text-foreground mb-2">
                  ¿Qué hacemos con la rutina actual?
                </legend>
                {[
                  {
                    valor: ModoAsignacionPlantilla.REEMPLAZAR,
                    titulo: 'Reemplazar la rutina actual',
                    detalle: `La rutina vigente de ${alumnoNombre} deja de estar activa; su historial no se borra.`,
                  },
                  {
                    valor: ModoAsignacionPlantilla.FUSIONAR,
                    titulo: 'Añadir a la rutina actual',
                    detalle: 'Agrega los días de la plantilla a los que ya tiene, sin borrar ninguno.',
                  },
                ].map((opcion) => {
                  const idOpcion = `${idBase}-modo-${opcion.valor}`;
                  const marcado = modo === opcion.valor;
                  return (
                    <div
                      key={opcion.valor}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                        marcado ? 'border-primary/60 bg-primary/5' : 'border-border'
                      }`}
                    >
                      <input
                        id={idOpcion}
                        type="radio"
                        name={`${idBase}-modo`}
                        value={opcion.valor}
                        checked={marcado}
                        onChange={() => setModo(opcion.valor)}
                        aria-describedby={`${idOpcion}-detalle`}
                        className="mt-0.5 h-5 w-5 accent-primary cursor-pointer"
                      />
                      <div className="min-w-0">
                        <label htmlFor={idOpcion} className="block text-sm font-semibold text-foreground cursor-pointer">
                          {opcion.titulo}
                        </label>
                        <p id={`${idOpcion}-detalle`} className="text-sm text-muted-foreground">
                          {opcion.detalle}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </fieldset>

              <p className="text-base text-foreground">
                {resumenAsignacion({
                  plantillaNombre: detalle.nombre,
                  alumnoNombre,
                  numeroAjustes: ajustesPendientes,
                  modo,
                })}
              </p>

              {resultado && resultado.exitosos > 0 && (
                <div
                  role="status"
                  aria-live="polite"
                  className="p-3 rounded-xl bg-success/10 border border-success/30 text-sm text-foreground flex items-start gap-2"
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success-strong" aria-hidden="true" />
                  <span>
                    <span className="font-semibold">Rutina asignada a {alumnoNombre}.</span>{' '}
                    {resultado.modo === ModoAsignacionPlantilla.REEMPLAZAR
                      ? 'Reemplazó su rutina activa.'
                      : 'Los días se añadieron a su rutina actual.'}
                  </span>
                </div>
              )}

              {errorAsignacion && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2"
                >
                  <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span>{errorAsignacion}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Navegación fija abajo */}
        <div className="px-4 sm:px-6 py-3 border-t border-border/80 flex items-center justify-between gap-3 safe-area-pb">
          {paso === 'elegir' || asignacionCompletada ? (
            <button
              type="button"
              onClick={onCerrar}
              disabled={isAsignando}
              className="min-h-11 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-sm cursor-pointer disabled:opacity-50"
            >
              Cerrar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPaso(paso === 'confirmar' ? 'revisar' : 'elegir')}
              disabled={isAsignando}
              className="min-h-11 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-sm inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Atrás
            </button>
          )}

          {paso === 'confirmar' ? (
            <button
              type="button"
              disabled={isAsignando || asignacionCompletada}
              onClick={() => void confirmarAsignacion()}
              aria-busy={isAsignando}
              className="min-h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-md shadow-primary/20 hover:brightness-110 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {isAsignando ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {isAsignando ? 'Asignando…' : asignacionCompletada ? 'Asignación completada' : 'Asignar rutina'}
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!puedeAvanzar}
              onClick={() => (paso === 'elegir' ? irARevisar() : setPaso('confirmar'))}
              className="min-h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              Siguiente
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* C4: reemplazar la rutina actual es destructivo para el plan vigente: se confirma. */}
      <DialogoConfirmacion
        abierto={confirmandoReemplazo}
        idTitulo={`${idBase}-confirmar-reemplazo`}
        titulo="Reemplazar la rutina actual"
        detalle={textoConfirmacionReemplazo(1, alumnoNombre)}
        textoConfirmar="Sí, reemplazar"
        variante="peligro"
        procesando={isAsignando}
        onCancelar={() => setConfirmandoReemplazo(false)}
        onConfirmar={() => void confirmarAsignacion(true)}
      />
    </div>
  );
}
