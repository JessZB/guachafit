/**
 * Módulo 6 · Nutrición: estado del reporte de hoy y su carga (hook de datos, R9).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (SL3, fase B) con el MISMO mecanismo
 * (`useState`/`useReducer`/`useCallback`/`useEffect`, fetch manual con `apiClient`, sin
 * TanStack). §6: estados honestos (carga con reintento, 404 = "aún no hay reporte", bloqueo
 * RF-012 con su propia pantalla).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Dispatch, RefObject } from 'react';
import { resolverUrlApi, apiClient } from '../../../lib/api-client';
import { type BloqueoAlumno } from '../../../lib/acceso-alumno';
import { subscribeToOutboxChanges } from '../../../lib/offline-db';
import {
  buscarCheckinNutricionalPendiente,
  clasificarErrorCargaReporteHoy,
  debeMostrarErrorCargaReporte,
  siguienteEstadoReporte,
  ESTADO_REPORTE_INICIAL,
  valoresFormularioDesdeCheckin,
  type ErrorCargaReporte,
  type EstadoReporteHoy,
  type EventoReporteNutricional,
} from '../../../lib/nutricion-checkin';
import type { AvisoReporte } from '../../nutricion/AvisosReporteNutricional';
import type { CheckinNutricionalDetalleDTO, SemaforoNutricional } from '@guachafit/shared';

export interface ValoresFormularioReporte {
  semaforo: SemaforoNutricional;
  aguaLitros: string;
  calorias: string;
  proteina: string;
  notas: string;
}

export interface ReporteHoy {
  estadoReporte: EstadoReporteHoy['estado'];
  fotosEncoladas: number;
  reporteRegistradoHoy: boolean;
  reporteEncolado: boolean;
  confirmandoEnvio: boolean;
  formularioBloqueado: boolean;
  /** `true` desde el montaje hasta que la primera consulta del reporte de hoy resuelve (éxito, vacío o error). */
  cargandoReporte: boolean;
  existingCheckin: CheckinNutricionalDetalleDTO | null;
  setExistingCheckin: (checkin: CheckinNutricionalDetalleDTO | null) => void;
  errorCargaReporte: ErrorCargaReporte | null;
  mostrarErrorCarga: boolean;
  avisoReporte: AvisoReporte | null;
  setAvisoReporte: (aviso: AvisoReporte | null) => void;
  avisoVisible: AvisoReporte | null;
  errorSemaforo: string | null;
  setErrorSemaforo: (mensaje: string | null) => void;
  grupoSemaforoRef: RefObject<HTMLFieldSetElement | null>;
  bloqueo: BloqueoAlumno | null;
  setBloqueo: (bloqueo: BloqueoAlumno | null) => void;
  urlCheckinHoy: string;
  cargarReporteHoy: () => Promise<void>;
  sincronizarPendienteHoy: () => Promise<void>;
  despacharReporte: Dispatch<EventoReporteNutricional>;
  aplicarCheckinCargado: (data: CheckinNutricionalDetalleDTO) => ValoresFormularioReporte;
}

export function useReporteHoy(
  hoyLocal: string,
  timezoneCliente: string,
  isDemoMode: boolean,
  alumnoId: string | undefined,
  rehidratar: (valores: ValoresFormularioReporte) => void
): ReporteHoy {
  // Estado del reporte de hoy (RF-002 §6): transición pura en `siguienteEstadoReporte`.
  const [reporte, despacharReporte] = useReducer(siguienteEstadoReporte, ESTADO_REPORTE_INICIAL);
  const estadoReporte = reporte.estado;
  const fotosEncoladas = reporte.fotosEncoladas;
  const [avisoReporte, setAvisoReporte] = useState<AvisoReporte | null>(null);
  // Se intentó guardar sin elegir color: el error se muestra junto al semáforo, que recibe el foco.
  const [errorSemaforo, setErrorSemaforo] = useState<string | null>(null);
  const grupoSemaforoRef = useRef<HTMLFieldSetElement | null>(null);
  // Fallo al consultar el reporte de hoy que NO es "aún no hay reporte": se muestra con reintento.
  const [errorCargaReporte, setErrorCargaReporte] = useState<ErrorCargaReporte | null>(null);
  const [existingCheckin, setExistingCheckin] = useState<CheckinNutricionalDetalleDTO | null>(null);
  // Carga sin saltos: el formulario espera a la primera respuesta para aparecer ya rehidratado.
  const [cargandoReporte, setCargandoReporte] = useState(true);
  // RF-012: alumno pausado no puede enviar reportes; la pantalla informativa reemplaza al formulario.
  const [bloqueo, setBloqueo] = useState<BloqueoAlumno | null>(null);

  const urlCheckinHoy = useMemo(
    () =>
      resolverUrlApi(
        `/nutricion/checkin/hoy?fecha=${hoyLocal}&timezoneCliente=${encodeURIComponent(
          timezoneCliente
        )}`
      ),
    [hoyLocal, timezoneCliente]
  );

  const reporteRegistradoHoy = Boolean(existingCheckin) || estadoReporte === 'saved';
  const reporteEncolado = estadoReporte === 'queued' && !reporteRegistradoHoy;
  const confirmandoEnvio = estadoReporte === 'confirmando' && !reporteRegistradoHoy;
  const formularioBloqueado = reporteRegistradoHoy || reporteEncolado || confirmandoEnvio;

  /** Rehidratación fiel: un 0 reportado se muestra como 0 (solo `null` queda vacío). */
  const aplicarCheckinCargado = useCallback(
    (data: CheckinNutricionalDetalleDTO): ValoresFormularioReporte => {
      const valores = valoresFormularioDesdeCheckin(data);
      setExistingCheckin(data);
      return valores;
    },
    []
  );

  const cargarReporteHoy = useCallback(async () => {
    try {
      // U4: sin conexión no se corta la carga — el SW (NetworkFirst `api-cache`) puede servir
      // el último check-in guardado; el chip de frescura dirá de cuándo es.
      const data = await apiClient<CheckinNutricionalDetalleDTO | null>(
        `/nutricion/checkin/hoy?fecha=${hoyLocal}&timezoneCliente=${encodeURIComponent(timezoneCliente)}`
      );
      setErrorCargaReporte(null);
      if (!data) {
        despacharReporte({ tipo: 'carga', resultado: 'sin-reporte' });
        return;
      }
      rehidratar(aplicarCheckinCargado(data));
      despacharReporte({ tipo: 'carga', resultado: 'encontrado' });
    } catch (err) {
      // 404 = todavía no hay reporte; cualquier otro fallo se guarda y la pantalla decide si
      // mostrarlo (`debeMostrarErrorCargaReporte`).
      const error = clasificarErrorCargaReporteHoy(err, navigator.onLine);
      setErrorCargaReporte(error);
      despacharReporte({ tipo: 'carga', resultado: error ? 'error' : 'sin-reporte' });
    } finally {
      // Todas las ramas (datos, null, error) liberan el esqueleto del formulario.
      setCargandoReporte(false);
    }
  }, [hoyLocal, timezoneCliente, aplicarCheckinCargado, rehidratar]);

  /**
   * RF-002 §6: el reporte encolado vive en la cola durable, no en memoria. Se lee al montar, cada
   * vez que la cola cambia y justo después de encolar (por si la cola ya lo envió antes).
   */
  const sincronizarPendienteHoy = useCallback(async () => {
    if (isDemoMode) return;
    const resultado = await buscarCheckinNutricionalPendiente(hoyLocal, alumnoId);
    despacharReporte({ tipo: 'cola', resultado });
  }, [isDemoMode, hoyLocal, alumnoId]);

  useEffect(() => {
    void sincronizarPendienteHoy();
    return subscribeToOutboxChanges(() => void sincronizarPendienteHoy());
  }, [sincronizarPendienteHoy]);

  // El pendiente salió de la cola: el formulario sigue bloqueado hasta saber si quedó registrado.
  useEffect(() => {
    if (estadoReporte === 'confirmando') void cargarReporteHoy();
  }, [estadoReporte, cargarReporteHoy]);

  const mostrarErrorCarga = !isDemoMode && debeMostrarErrorCargaReporte(estadoReporte, errorCargaReporte);
  // Aviso del guardado (rechazo, 409…) o, si no hay, el que dejó la máquina de estados.
  const avisoVisible: AvisoReporte | null =
    avisoReporte ?? (reporte.aviso ? { tono: 'info', texto: reporte.aviso } : null);

  return {
    estadoReporte,
    fotosEncoladas,
    reporteRegistradoHoy,
    reporteEncolado,
    confirmandoEnvio,
    formularioBloqueado,
    cargandoReporte,
    existingCheckin,
    setExistingCheckin,
    errorCargaReporte,
    mostrarErrorCarga,
    avisoReporte,
    setAvisoReporte,
    avisoVisible,
    errorSemaforo,
    setErrorSemaforo,
    grupoSemaforoRef,
    bloqueo,
    setBloqueo,
    urlCheckinHoy,
    cargarReporteHoy,
    sincronizarPendienteHoy,
    despacharReporte,
    aplicarCheckinCargado,
  };
}
