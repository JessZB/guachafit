import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../../lib/acceso-alumno';
import {
  elegirSesionParaMostrar,
  getCachedRutinaParaHoy,
  guardarSemanaCacheada,
  hayMutacionesSinEnviarDeGrupo,
  leerSemanaCacheada,
  offlineDb,
} from '../../../lib/offline-db';
import { esFalloParaEncolar } from '../../../lib/offline-sync';
import { fechaCalendarioEnZona } from '../../../lib/zona-horaria';
import { triggerHaptic } from '../../../lib/haptics';
import type {
  SemanaEntrenamientoProgresoDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { buildDemoSemanaProgreso, buildDemoSesion } from '../../../lib/entrenamiento-demo';
import { combinarSeriesPendientesLocales } from '../../../lib/sesion-borrador';
import type { FeedbackCierre } from './use-cierre-sesion';

interface OpcionesCarga {
  user: { id?: string } | null;
  isDemoMode: boolean;
  tz: string;
  setSesion: (sesion: SesionEntrenamientoDetalleDTO | null) => void;
  setBloqueo: (bloqueo: BloqueoAlumno | null) => void;
  setActionError: (mensaje: string | null) => void;
  setSemanaProgreso: (semana: SemanaEntrenamientoProgresoDTO | null) => void;
  setFinishFeedback: (feedback: FeedbackCierre | null) => void;
  setPendienteSync: (pendiente: boolean) => void;
  resetBorradores: () => void;
  cacheSesion: (data: SesionEntrenamientoDetalleDTO) => Promise<void>;
}

/**
 * Carga/caché de sesión, bloqueo RF-012, selección de bloque y errores de carga.
 * Los datos demo SOLO se usan con la bandera explícita isDemoMode.
 */
export function useCargaSesion({
  user,
  isDemoMode,
  tz,
  setSesion,
  setBloqueo,
  setActionError,
  setSemanaProgreso,
  setFinishFeedback,
  setPendienteSync,
  resetBorradores,
  cacheSesion,
}: OpcionesCarga) {
  const [selectedBloqueId, setSelectedBloqueId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitchingBloque, setIsSwitchingBloque] = useState(false);

  // Estados honestos de carga: error de red y offline sin cache
  const [loadError, setLoadError] = useState(false);
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  // D2/D3: lo mostrado viene de lo guardado en el teléfono (con su antigüedad) y, si solo hay
  // un entrenamiento de otro día, se avisa en vez de presentarlo como el de hoy.
  const [datosGuardadosEn, setDatosGuardadosEn] = useState<number | null>(null);
  const [ultimoGuardadoOtroDia, setUltimoGuardadoOtroDia] = useState<string | null>(null);

  /**
   * D2/D3: carga lo guardado en el teléfono. Solo presenta como "de hoy" la sesión cuya fecha
   * programada es hoy (día local); si solo hay una de otro día, se informa su fecha.
   * Devuelve `true` si había algo que mostrar.
   */
  const cargarDesdeGuardado = useCallback(async (): Promise<boolean> => {
    const alumnoId = user?.id ?? '';
    const [rutina, semana] = await Promise.all([
      getCachedRutinaParaHoy(alumnoId, fechaCalendarioEnZona(tz)).catch(() => ({
        deHoy: null,
        ultimaDeOtroDia: null,
      })),
      leerSemanaCacheada(alumnoId).catch(() => null),
    ]);
    setSesion(rutina.deHoy?.sesion ?? null);
    setUltimoGuardadoOtroDia(rutina.deHoy ? null : rutina.ultimaDeOtroDia?.fechaProgramada ?? null);
    if (semana) setSemanaProgreso(semana.semana);
    const guardadoEn = rutina.deHoy?.updatedAt ?? semana?.updatedAt ?? null;
    setDatosGuardadosEn(guardadoEn);
    return Boolean(rutina.deHoy || semana);
  }, [user, tz, setSemanaProgreso]);

  // Accesibilidad (U3b): Escape, trampa de foco y restore viven en `useDialogoAccesible`.

  // Cargar sesión de hoy y progreso semanal.
  // - Sin argumento: trae la sesión de hoy más reciente del alumno (cualquier bloque).
  // - Con bloqueId: consulta READ-ONLY la sesión de hoy de ese bloque (no instancia nada).
  // Los datos demo SOLO se usan con la bandera explícita isDemoMode.
  const loadSessionAndProgress = useCallback(
    async (bloqueId?: string) => {
      setIsLoading(true);
      setLoadError(false);
      setActionError(null);
      // Cada carga real re-evalúa el ciclo de vida: si el alumno fue reactivado, la pantalla de
      // bloqueo desaparece sola con el siguiente intento.
      setBloqueo(null);
      // El feedback de finalización pertenece a la sesión finalizada, no a la recién cargada
      setFinishFeedback(null);
      setPendienteSync(false);
      // Los borradores de edición pertenecen a la sesión anterior
      resetBorradores();

      // MODO DEMO EXPLÍCITO: datos de ejemplo y cero llamadas/mutaciones contra la API real.
      if (isDemoMode) {
        const demoProgreso = buildDemoSemanaProgreso(bloqueId);
        const demoBloqueId = bloqueId || demoProgreso.siguienteBloqueSugeridoId || 'd2';
        setSemanaProgreso(demoProgreso);
        setSelectedBloqueId(demoBloqueId);
        setSesion(buildDemoSesion(demoBloqueId, user?.id));
        setIsOffline(false);
        setIsLoading(false);
        setIsSwitchingBloque(false);
        return;
      }

      setDatosGuardadosEn(null);
      setUltimoGuardadoOtroDia(null);

      // OFFLINE: solo cache local; sin cache => estado offline vacío (nunca demo).
      if (!navigator.onLine) {
        await cargarDesdeGuardado();
        setIsOffline(true);
        setIsLoading(false);
        setIsSwitchingBloque(false);
        return;
      }

      try {
        // 1. Progreso semanal (incluye racha efectiva y estados de omisión)
        const progresoRes = await apiClient<SemanaEntrenamientoProgresoDTO>(
          `/alumnos/me/rutina/semana-actual?timezone=${encodeURIComponent(tz)}`
        );
        setSemanaProgreso(progresoRes);
        // D3: la semana queda guardada para consultarla sin conexión.
        if (user?.id) await guardarSemanaCacheada(user.id, progresoRes).catch(() => {});

        // 2. Sesión de hoy: del bloque consultado o la más reciente del alumno
        const url = bloqueId
          ? `/alumnos/me/sesiones/hoy?timezone=${encodeURIComponent(tz)}&bloqueId=${encodeURIComponent(bloqueId)}`
          : `/alumnos/me/sesiones/hoy?timezone=${encodeURIComponent(tz)}`;

        const respuesta = await apiClient<SesionEntrenamientoDetalleDTO | null>(url);
        // D4: con cambios de esta sesión aún en la cola (p. ej. "Comenzar" encolado), manda la
        // copia del teléfono: así una recarga no ofrece "Comenzar" otra vez ni pierde series.
        let data = respuesta ?? null;
        if (data?.id) {
          const [pendientes, local] = await Promise.all([
            hayMutacionesSinEnviarDeGrupo(`sesion:${data.id}`).catch(() => false),
            offlineDb.rutinaHoy.get(data.id).catch(() => undefined),
          ]);
          // Borrador de series: lo tecleado en series aún pendientes se vuelca sobre la copia
          // del servidor antes de mostrarla y de guardarla en caché (sin un segundo almacén).
          // Una copia local corrupta jamás debe convertirse en el estado de error de carga: ante
          // cualquier excepción al combinar o elegir se muestran los datos del servidor.
          const delServidor = data;
          try {
            const servidorConBorrador = combinarSeriesPendientesLocales(
              delServidor,
              local?.sesion ?? null
            );
            data = elegirSesionParaMostrar(servidorConBorrador, local?.sesion ?? null, pendientes);
          } catch (errorCopiaLocal) {
            console.warn('Copia local de la sesión ilegible; se usan los datos del servidor:', errorCopiaLocal);
            data = delServidor;
          }
        }
        setSesion(data);
        if (data?.bloqueId) setSelectedBloqueId(data.bloqueId);
        else if (bloqueId) setSelectedBloqueId(bloqueId);
        else setSelectedBloqueId(progresoRes.siguienteBloqueSugeridoId ?? null);

        if (data?.id) await cacheSesion(data);
        setIsOffline(false);
      } catch (err) {
        // RF-012: el bloqueo por ciclo de vida tiene su propia pantalla; cualquier otro error de
        // red/servidor conserva el estado de error con retry (jamás datos demo).
        const bloqueoDetectado = resolverBloqueoAlumno(err);
        if (bloqueoDetectado) {
          setBloqueo(bloqueoDetectado);
          setSesion(null);
          setSemanaProgreso(null);
          return;
        }
        console.warn('No se pudo cargar la sesión del alumno:', err);
        // D2: si la red falló (o el servidor no respondió), se muestra lo guardado en el
        // teléfono con su antigüedad en lugar de un error vacío.
        const hayGuardado = esFalloParaEncolar(err) ? await cargarDesdeGuardado() : false;
        if (!hayGuardado) setLoadError(true);
      } finally {
        setIsLoading(false);
        setIsSwitchingBloque(false);
      }
    },
    [
      cacheSesion,
      cargarDesdeGuardado,
      isDemoMode,
      tz,
      user,
      setSesion,
      setBloqueo,
      setActionError,
      setSemanaProgreso,
      setFinishFeedback,
      setPendienteSync,
      resetBorradores,
    ]
  );

  useEffect(() => {
    loadSessionAndProgress();
  }, [loadSessionAndProgress]);

  // Consulta READ-ONLY de un bloque (chip de la semana): NO instancia ni elimina nada.
  const handleSelectBloque = async (bloqueId: string) => {
    if (!bloqueId) return;
    triggerHaptic('selection');
    setIsSwitchingBloque(true);
    setSelectedBloqueId(bloqueId);
    await loadSessionAndProgress(bloqueId);
  };

  return {
    selectedBloqueId,
    setSelectedBloqueId,
    isLoading,
    isSwitchingBloque,
    setIsSwitchingBloque,
    loadError,
    isOffline,
    datosGuardadosEn,
    ultimoGuardadoOtroDia,
    loadSessionAndProgress,
    handleSelectBloque,
  };
}
