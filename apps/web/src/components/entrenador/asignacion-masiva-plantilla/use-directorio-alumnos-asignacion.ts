/**
 * Ola 3 · módulo `asignacion-masiva-plantilla` (lote C, hook de datos).
 *
 * Directorio de alumnos + selección con tope. Recorte verbatim de
 * `AsignacionMasivaPlantilla.tsx:54-66,87-177` (R9: conserva el mecanismo vigente —
 * `useState` + debounce de 300 ms + `apiClient` directo + roster demo local, sin TanStack Query).
 */
import { useEffect, useRef, useState } from 'react';
import type { DirectorioAlumnosDTO, PerfilAlumnoDetalleDTO } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { ROSTER_DEMO_DIRECTORIO } from '../../../lib/directorio-alumnos';
import { triggerHaptic } from '../../../lib/haptics';
import {
  alternarSeleccionAlumno,
  combinarPaginasAlumnos,
  construirUrlAlumnosAsignacion,
  hayMasAlumnos,
} from '../../../lib/asignacion-masiva';
import { nombreCompletoAsignacion } from '../../../lib/asignacion-masiva-plantilla-nombres';

/** Espera tras la última tecla antes de buscar en el servidor. */
const ESPERA_BUSQUEDA_MS = 300;

export function useDirectorioAlumnosAsignacion({ isDemoMode }: { isDemoMode: boolean }) {
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
  const solicitudActual = useRef(0);
  const esPrimeraCarga = useRef(true);

  const registrarNombres = (lista: PerfilAlumnoDetalleDTO[]) => {
    setNombresPorId((previos) => {
      const mapa = { ...previos };
      for (const alumno of lista) {
        mapa[alumno.id] = nombreCompletoAsignacion(alumno);
        if (alumno.usuarioId) mapa[alumno.usuarioId] = nombreCompletoAsignacion(alumno);
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
            nombreCompletoAsignacion(alumno).toLowerCase().includes(filtro)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, isDemoMode]);

  const cargarMas = () => {
    if (isLoading || isCargandoMas) return;
    void cargarAlumnos(busquedaAplicada, siguienteOffset);
  };

  const reintentarCarga = () => {
    void cargarAlumnos(busqueda, 0);
  };

  const idsVisibles = new Set(alumnos.map((alumno) => alumno.id));
  const seleccionadosFueraDeLista = seleccion.filter((id) => !idsVisibles.has(id)).length;

  const alternar = (alumnoId: string) => {
    triggerHaptic('selection');
    const resultado = alternarSeleccionAlumno(seleccion, alumnoId);
    setSeleccion(resultado.seleccion);
    setAvisoLimite(resultado.limiteAlcanzado);
  };

  return {
    alumnos,
    isLoading,
    isCargandoMas,
    errorCarga,
    busqueda,
    setBusqueda,
    busquedaAplicada,
    hayMas,
    nombresPorId,
    seleccion,
    avisoLimite,
    seleccionadosFueraDeLista,
    cargarMas,
    reintentarCarga,
    alternar,
  };
}

