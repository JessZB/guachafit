/**
 * RF-017 RN-03 (A6): asignar una plantilla a varios alumnos a la vez (máximo 50 por envío).
 *
 * Usa el endpoint existente `POST /plantillas/:id/asignar` (acepta `alumnoIds[]`) y muestra el
 * resultado por alumno con mensajes humanos: los errores técnicos de `resultados[].error` pasan
 * por la traducción de mensajes-error. Reemplazar la rutina actual pide confirmación.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ModoAsignacionPlantilla,
  type AsignacionPlantillaResponseDTO,
  type DirectorioAlumnosDTO,
  type PerfilAlumnoDetalleDTO,
  type PlantillaRutinaResumenDTO,
} from '@guachafit/shared';
import { AlertCircle, CheckCircle2, Loader2, Search, Users, X } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';
import { triggerHaptic } from '../../lib/haptics';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { ROSTER_DEMO_DIRECTORIO } from '../../lib/directorio-alumnos';
import {
  MAX_ALUMNOS_ASIGNACION,
  MENSAJE_ASIGNACION_INCIERTA,
  alternarSeleccionAlumno,
  combinarPaginasAlumnos,
  construirUrlAlumnosAsignacion,
  describirResultadosAsignacion,
  esFalloAmbiguoAsignacion,
  hayMasAlumnos,
  mensajeListaVaciaAlumnos,
  requiereConfirmacionReintento,
  textoConfirmacionReemplazo,
  type FilaResultadoAsignacion,
} from '../../lib/asignacion-masiva';
import { DialogoConfirmacion } from '../common/DialogoConfirmacion';

interface AsignacionMasivaPlantillaProps {
  plantilla: PlantillaRutinaResumenDTO;
  onCerrar: () => void;
}

function nombreCompleto(alumno: PerfilAlumnoDetalleDTO): string {
  return `${alumno.nombres} ${alumno.apellidos}`.trim();
}

/** Espera tras la última tecla antes de buscar en el servidor. */
const ESPERA_BUSQUEDA_MS = 300;

export function AsignacionMasivaPlantilla({ plantilla, onCerrar }: AsignacionMasivaPlantillaProps) {
  const { isDemoMode } = useAuth();
  const [alumnos, setAlumnos] = useState<PerfilAlumnoDetalleDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCargandoMas, setIsCargandoMas] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  // Término con el que se cargó la lista visible (la búsqueda va al servidor con debounce).
  const [busquedaAplicada, setBusquedaAplicada] = useState('');
  const [siguienteOffset, setSiguienteOffset] = useState(0);
  const [hayMas, setHayMas] = useState(false);
  // Nombres de todo alumno visto: la selección se conserva aunque deje de estar en la lista.
  const [nombresPorId, setNombresPorId] = useState<Record<string, string>>({});
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [avisoLimite, setAvisoLimite] = useState(false);
  const [modo, setModo] = useState<ModoAsignacionPlantilla>(ModoAsignacionPlantilla.FUSIONAR);
  const [confirmandoReemplazo, setConfirmandoReemplazo] = useState(false);
  const [isAsignando, setIsAsignando] = useState(false);
  const [errorAsignacion, setErrorAsignacion] = useState<string | null>(null);
  const [resultados, setResultados] = useState<FilaResultadoAsignacion[] | null>(null);
  // El endpoint de asignación no admite clave de idempotencia: tras un fallo ambiguo, reintentar
  // en modo Añadir podría duplicar días, así que se pide confirmación explícita.
  const [falloAmbiguo, setFalloAmbiguo] = useState(false);
  const [confirmandoReintento, setConfirmandoReintento] = useState(false);
  const solicitudActual = useRef(0);
  const esPrimeraCarga = useRef(true);

  const refDialogo = useDialogoAccesible({
    onCerrar: () => {
      if (!isAsignando) onCerrar();
    },
  });

  const registrarNombres = (lista: PerfilAlumnoDetalleDTO[]) => {
    setNombresPorId((previos) => {
      const mapa = { ...previos };
      for (const alumno of lista) {
        mapa[alumno.id] = nombreCompleto(alumno);
        if (alumno.usuarioId) mapa[alumno.usuarioId] = nombreCompleto(alumno);
      }
      return mapa;
    });
  };

  /** Carga una página del directorio; `offset` 0 reinicia la lista (búsqueda nueva). */
  const cargarAlumnos = async (termino: string, offset: number) => {
    const idSolicitud = ++solicitudActual.current;
    const esPaginaInicial = offset === 0;
    if (esPaginaInicial) setIsLoading(true);
    else setIsCargandoMas(true);
    setErrorCarga(null);

    if (isDemoMode) {
      const filtro = termino.trim().toLowerCase();
      const lista = filtro
        ? ROSTER_DEMO_DIRECTORIO.filter((alumno) =>
            nombreCompleto(alumno).toLowerCase().includes(filtro)
          )
        : ROSTER_DEMO_DIRECTORIO;
      registrarNombres(lista);
      setAlumnos(lista);
      setBusquedaAplicada(termino);
      setHayMas(false);
      setIsLoading(false);
      return;
    }

    try {
      const res = await apiClient<DirectorioAlumnosDTO>(
        construirUrlAlumnosAsignacion(termino, offset)
      );
      // Una respuesta vieja (búsqueda ya reemplazada) no pisa la lista actual.
      if (idSolicitud !== solicitudActual.current) return;
      const pagina = Array.isArray(res?.items) ? res.items : [];
      registrarNombres(pagina);
      setAlumnos((previos) => (esPaginaInicial ? pagina : combinarPaginasAlumnos(previos, pagina)));
      setBusquedaAplicada(termino);
      setSiguienteOffset(offset + pagina.length);
      setHayMas(
        hayMasAlumnos({
          cargados: offset + pagina.length,
          total: typeof res?.total === 'number' ? res.total : undefined,
          tamanoUltimaPagina: pagina.length,
        })
      );
    } catch (err) {
      if (idSolicitud !== solicitudActual.current) return;
      if (esPaginaInicial) {
        setAlumnos([]);
        setHayMas(false);
      }
      setErrorCarga(
        err instanceof Error && err.message ? err.message : 'No pudimos cargar tus alumnos.'
      );
    } finally {
      if (idSolicitud === solicitudActual.current) {
        setIsLoading(false);
        setIsCargandoMas(false);
      }
    }
  };

  // Primera carga inmediata; cada cambio de búsqueda espera ~300 ms antes de ir al servidor.
  useEffect(() => {
    const espera = esPrimeraCarga.current ? 0 : ESPERA_BUSQUEDA_MS;
    esPrimeraCarga.current = false;
    const temporizador = window.setTimeout(() => void cargarAlumnos(busqueda, 0), espera);
    return () => window.clearTimeout(temporizador);
  }, [busqueda, isDemoMode]);

  const cargarMas = () => {
    if (isLoading || isCargandoMas) return;
    void cargarAlumnos(busquedaAplicada, siguienteOffset);
  };

  const idsVisibles = new Set(alumnos.map((alumno) => alumno.id));
  const seleccionadosFueraDeLista = seleccion.filter((id) => !idsVisibles.has(id)).length;

  const alternar = (alumnoId: string) => {
    triggerHaptic('selection');
    const resultado = alternarSeleccionAlumno(seleccion, alumnoId);
    setSeleccion(resultado.seleccion);
    setAvisoLimite(resultado.limiteAlcanzado);
  };

  const enviarAsignacion = async () => {
    setConfirmandoReemplazo(false);
    setConfirmandoReintento(false);
    setErrorAsignacion(null);

    if (isDemoMode) {
      setResultados(
        describirResultadosAsignacion(
          seleccion.map((alumnoId) => ({ alumnoId, exito: true, rutinaNombre: plantilla.nombre })),
          nombresPorId
        )
      );
      triggerHaptic('success');
      return;
    }

    setIsAsignando(true);
    try {
      const res = await apiClient<AsignacionPlantillaResponseDTO>(
        `/plantillas/${plantilla.id}/asignar`,
        {
          method: 'POST',
          body: JSON.stringify({ alumnoIds: seleccion, modo }),
        }
      );
      setFalloAmbiguo(false);
      setResultados(describirResultadosAsignacion(res.resultados ?? [], nombresPorId));
      triggerHaptic(res.exitosos > 0 ? 'success' : 'warning');
    } catch (err) {
      if (esFalloAmbiguoAsignacion(err)) {
        // Sin respuesta clara la asignación pudo aplicarse: no se ofrece reintentar a ciegas.
        setFalloAmbiguo(true);
        setErrorAsignacion(MENSAJE_ASIGNACION_INCIERTA);
      } else {
        setErrorAsignacion(
          err instanceof Error && err.message
            ? err.message
            : 'No pudimos asignar la plantilla. Inténtalo de nuevo.'
        );
      }
      triggerHaptic('warning');
    } finally {
      setIsAsignando(false);
    }
  };

  const confirmar = () => {
    if (seleccion.length === 0 || isAsignando) return;
    if (modo === ModoAsignacionPlantilla.REEMPLAZAR) {
      setConfirmandoReemplazo(true);
      return;
    }
    if (requiereConfirmacionReintento(falloAmbiguo, modo)) {
      setConfirmandoReintento(true);
      return;
    }
    void enviarAsignacion();
  };

  const exitosos = resultados?.filter((fila) => fila.exito).length ?? 0;
  const nombreUnico = seleccion.length === 1 ? nombresPorId[seleccion[0]] : undefined;

  return (
    <div
      onClick={(evento) => {
        if (evento.target === evento.currentTarget && !isAsignando) onCerrar();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="asignacion-masiva-titulo"
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h3 id="asignacion-masiva-titulo" className="font-black text-base text-foreground">
                Asignar a alumnos
              </h3>
              <p className="text-xs text-muted-foreground break-words">
                Plantilla «{plantilla.nombre}» · elige hasta {MAX_ALUMNOS_ASIGNACION} alumnos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={isAsignando}
            aria-label="Cerrar asignación a alumnos"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {resultados ? (
          <div className="space-y-3">
            <div
              role="status"
              aria-live="polite"
              className={`p-3 rounded-2xl border text-xs font-semibold flex items-center gap-2 ${
                exitosos > 0
                  ? 'bg-success/10 border-success/30 text-success'
                  : 'bg-destructive/10 border-destructive/30 text-destructive'
              }`}
            >
              {exitosos > 0 ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>
                Plantilla asignada a {exitosos} de {resultados.length} alumno
                {resultados.length === 1 ? '' : 's'}.
              </span>
            </div>
            <ul className="space-y-2">
              {resultados.map((fila) => (
                <li
                  key={fila.alumnoId}
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    fila.exito ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5'
                  }`}
                >
                  {fila.exito ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <span className="block font-bold text-foreground">{fila.nombre}</span>
                    <span className={`block ${fila.exito ? 'text-success' : 'text-destructive'}`}>
                      {fila.mensaje}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onCerrar}
                className="min-h-11 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs cursor-pointer"
              >
                Listo
              </button>
            </div>
          </div>
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-foreground mb-2">
                ¿Qué hacemos con la rutina actual?
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  {
                    valor: ModoAsignacionPlantilla.FUSIONAR,
                    titulo: 'Añadir a la rutina actual',
                    detalle: 'Agrega los días de la plantilla sin borrar los que ya tienen.',
                  },
                  {
                    valor: ModoAsignacionPlantilla.REEMPLAZAR,
                    titulo: 'Reemplazar la rutina actual',
                    detalle: 'La rutina actual deja de estar activa; su historial se conserva.',
                  },
                ].map((opcion) => (
                  <label
                    key={opcion.valor}
                    className={`min-h-11 p-3 rounded-2xl border cursor-pointer transition-all ${
                      modo === opcion.valor
                        ? 'bg-primary/10 border-primary/50'
                        : 'bg-card border-border/70 hover:border-primary/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="modo-asignacion-masiva"
                      value={opcion.valor}
                      checked={modo === opcion.valor}
                      onChange={() => setModo(opcion.valor)}
                      className="sr-only"
                    />
                    <span className="text-xs font-bold text-foreground block">{opcion.titulo}</span>
                    <span className="text-xs text-muted-foreground block mt-1">{opcion.detalle}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="asignacion-masiva-busqueda" className="text-xs font-bold text-foreground">
                  Alumnos
                </label>
                <span className="text-xs text-muted-foreground" aria-live="polite">
                  {seleccion.length} de {MAX_ALUMNOS_ASIGNACION} seleccionados
                  {seleccionadosFueraDeLista > 0 &&
                    ` (${seleccionadosFueraDeLista} fuera de esta lista)`}
                </span>
              </div>
              <div className="relative">
                <Search
                  className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="asignacion-masiva-busqueda"
                  type="search"
                  value={busqueda}
                  onChange={(evento) => setBusqueda(evento.target.value)}
                  placeholder="Buscar por nombre..."
                  className="w-full min-h-11 pl-9 pr-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>
              {avisoLimite && (
                <p role="alert" className="text-xs font-semibold text-warning">
                  Puedes asignar hasta {MAX_ALUMNOS_ASIGNACION} alumnos a la vez.
                </p>
              )}

              {isLoading ? (
                <div className="py-6 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="Cargando alumnos" />
                </div>
              ) : errorCarga && alumnos.length === 0 ? (
                <div role="alert" className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-2">
                  <p>{errorCarga}</p>
                  <button
                    type="button"
                    onClick={() => void cargarAlumnos(busqueda, 0)}
                    className="min-h-11 px-3 rounded-xl bg-secondary text-foreground font-bold text-xs cursor-pointer"
                  >
                    Reintentar
                  </button>
                </div>
              ) : alumnos.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  {mensajeListaVaciaAlumnos(busquedaAplicada)}
                </p>
              ) : (
                <ul className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {alumnos.map((alumno) => {
                    const marcado = seleccion.includes(alumno.id);
                    const idCasilla = `asignacion-masiva-${alumno.id}`;
                    return (
                      <li key={alumno.id}>
                        <label
                          htmlFor={idCasilla}
                          className={`min-h-11 px-3 py-2 rounded-xl border flex items-center gap-3 cursor-pointer text-xs ${
                            marcado ? 'border-primary/50 bg-primary/5' : 'border-border/70 hover:border-primary/30'
                          }`}
                        >
                          <input
                            id={idCasilla}
                            type="checkbox"
                            checked={marcado}
                            onChange={() => alternar(alumno.id)}
                            className="h-5 w-5 accent-primary cursor-pointer"
                          />
                          <span className="font-semibold text-foreground">{nombreCompleto(alumno)}</span>
                        </label>
                      </li>
                    );
                  })}
                  {(hayMas || errorCarga) && (
                    <li className="pt-1 space-y-2">
                      {errorCarga && (
                        <p role="alert" className="text-xs text-destructive">
                          {errorCarga}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={cargarMas}
                        disabled={isCargandoMas}
                        aria-busy={isCargandoMas}
                        className="w-full min-h-11 px-3 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                      >
                        {isCargandoMas && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        )}
                        <span>{isCargandoMas ? 'Cargando...' : 'Cargar más alumnos'}</span>
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>

            {errorAsignacion && (
              <div
                role="alert"
                className="p-3 rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errorAsignacion}</span>
              </div>
            )}

            <div className="pt-3 border-t border-border/80 flex flex-col sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                onClick={onCerrar}
                disabled={isAsignando}
                className="min-h-11 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={seleccion.length === 0 || isAsignando}
                aria-busy={isAsignando}
                className="min-h-11 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                {isAsignando && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                <span>
                  {isAsignando
                    ? 'Asignando...'
                    : `Asignar a ${seleccion.length} alumno${seleccion.length === 1 ? '' : 's'}`}
                </span>
              </button>
            </div>
          </>
        )}
      </div>

      <DialogoConfirmacion
        abierto={confirmandoReemplazo}
        idTitulo="asignacion-masiva-confirmar-reemplazo"
        titulo="Reemplazar la rutina actual"
        detalle={textoConfirmacionReemplazo(seleccion.length, nombreUnico)}
        textoConfirmar="Sí, reemplazar"
        variante="peligro"
        onCancelar={() => setConfirmandoReemplazo(false)}
        onConfirmar={() => void enviarAsignacion()}
      />

      <DialogoConfirmacion
        abierto={confirmandoReintento}
        idTitulo="asignacion-masiva-confirmar-reintento"
        titulo="¿Volver a intentar la asignación?"
        detalle={`${MENSAJE_ASIGNACION_INCIERTA} Si ya se asignó, añadirla otra vez duplicará los días de su rutina.`}
        textoConfirmar="Sí, volver a intentar"
        variante="peligro"
        onCancelar={() => setConfirmandoReintento(false)}
        onConfirmar={() => void enviarAsignacion()}
      />
    </div>
  );
}
