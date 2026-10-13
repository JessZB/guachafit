/**
 * Hook de datos del módulo `pagos` (fase B, prompt 54).
 *
 * Tasa vigente, cuota, saldo a favor e historial paginado server-side
 * (`txLimit`/`txOffset`), movidos tal cual desde `PagosPage.tsx`.
 *
 * R9: `apiClient` + `useState` (sin TanStack: los specs montan sin provider,
 * R5). §6: estados honestos D2/D6, sin inventar conversiones.
 */
import { useEffect, useMemo, useState } from 'react';
import { EstadoCuota } from '@guachafit/shared';
import type {
  CuotaDetalleDTO, ResumenFinancieroAlumnoDTO, TasaCambioVigenteDTO, TransaccionPagoDetalleDTO,
} from '@guachafit/shared';
import { useAuth } from '../../../context/auth-context';
import { apiClient, resolverUrlApi } from '../../../lib/api-client';
import { calcularTotalPaginas, rebanarPagina } from '../../../lib/paginacion';
import {
  adaptarCuotaDesdeResumen,
  adaptarTransaccionesHistorial,
  crearTransaccionesDemoPagos,
} from '../../../lib/pagos-adaptadores';
import {
  etiquetaFaltaTasa,
  saldoVesProyectado as calcularSaldoVesProyectado,
  tasaEfectivaNumerica,
} from '../../../lib/pagos-montos';
import {
  filtrarTransaccionesPorEstado,
  type FiltroEstadoTransaccionPago,
} from '../../../lib/pagos-historial-filtros';

export function useEstadoCuentaAlumno() {
  const { user, isDemoMode } = useAuth();
  const [cuota, setCuota] = useState<CuotaDetalleDTO | null>(null);
  const [tasa, setTasa] = useState<TasaCambioVigenteDTO | null>(null);
  // RF-006 RN-05: saldo a favor del alumno (se aplica solo a la próxima cuota).
  const [saldoAFavorUsd, setSaldoAFavorUsd] = useState('0.00');
  // D6: distingue "sin tasa configurada" (dato real de la API) de "no se pudo consultar".
  const [tasaError, setTasaError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // D2: fallo de carga honesto (sin cuota demo fuera del modo demo).
  const [error, setError] = useState<string | null>(null);
  // WU25b: historial paginado server-side con `txLimit`/`txOffset` + `transaccionesTotal` real.
  const [paginaHistorial, setPaginaHistorial] = useState(1);
  const [tamanoHistorial, setTamanoHistorial] = useState(10);
  const [transaccionesHistorial, setTransaccionesHistorial] = useState<TransaccionPagoDetalleDTO[]>([]);
  const [transaccionesTotal, setTransaccionesTotal] = useState(0);
  const [isCargandoHistorial, setIsCargandoHistorial] = useState(false);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);
  // WU20: chip de estado del historial (solo lectura; no afecta el flujo de reportar pago).
  const [filtroEstadoHistorial, setFiltroEstadoHistorial] = useState<FiltroEstadoTransaccionPago>('todos');

  const cargarDatos = async () => {
    setIsLoading(true);
    setError(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): tasa y cuota de ejemplo solo con la bandera activa.
    if (isDemoMode) {
      setTasa({
        entrenadorId: user?.entrenadorId || 'demo-coach',
        tasaOficialBcv: '65.0000',
        tasaActivaEntrenador: '65.0000',
        tasaEfectiva: '65.0000',
        fuente: 'oficial_bcv',
        fechaActualizacionUtc: new Date().toISOString(),
      });
      setCuota({
        id: 'cuota-demo-001',
        clienteId: user?.id || 'demo-alumno',
        entrenadorId: user?.entrenadorId || 'demo-coach',
        planId: 'plan-001',
        planNombre: 'Plan Alto Rendimiento Mensual',
        periodo: '2026-09',
        montoTotalUsd: '50.00',
        montoAbonadoUsd: '20.00',
        saldoPendienteUsd: '30.00',
        saldoAFavorAplicadoUsd: '0.00',
        fechaEmisionUtc: new Date().toISOString(),
        fechaCorteUtc: new Date(Date.now() + 86400000 * 5).toISOString(),
        estado: EstadoCuota.ABONADA_PARCIAL,
        // WU25b: la página visible la resuelve `cargarPaginaHistorial` con el slice del fixture.
        transacciones: [],
        createdAtUtc: new Date().toISOString(),
        updatedAtUtc: new Date().toISOString(),
      });
      // WU25b: página 1 del historial demo (mismo flujo que la sesión real, cero red).
      setPaginaHistorial(1);
      await cargarPaginaHistorial(1, tamanoHistorial);
      setIsLoading(false);
      return;
    }

    // Sesión real: tasa vigente y cuota/transacciones reales del alumno titular.
    try {
      const tasaData = await apiClient<TasaCambioVigenteDTO>('/finanzas/tasas/vigente')
        .then((data) => {
          setTasaError(false);
          return data;
        })
        .catch(() => {
          // D6: si la consulta falla no se afirma "sin tasa"; se dice "no disponible".
          setTasaError(true);
          return null;
        });
      setTasa(tasaData ?? null);

      if (!user?.id) {
        setCuota(null);
        setIsLoading(false);
        return;
      }

      // WU25b: la página 1 del historial alimenta el resumen (saldos/cuota) y el total real.
      setPaginaHistorial(1);
      const ok = await cargarPaginaHistorial(1, tamanoHistorial);
      if (!ok) {
        setError(
          'No se pudo cargar tu estado de cuenta. Revisa tu conexión e inténtalo de nuevo.'
        );
      }
    } catch (err: any) {
      // D2: sin cuota demo en sesión real; error visible con reintento.
      setCuota(null);
      setError(
        err?.message || 'No se pudo cargar tu estado de cuenta. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * WU25b: carga UNA página del historial (`GET .../historial?txLimit&txOffset`;
   * en demo corta el fixture local). `false` si falla: el llamador decide el
   * mensaje y se conserva lo cargado.
   */
  const cargarPaginaHistorial = async (
    paginaSolicitada: number,
    tamanoSolicitado: number,
    reintento = false
  ): Promise<boolean> => {
    if (!user?.id) return true;
    setIsCargandoHistorial(true);
    setErrorHistorial(null);
    try {
      if (isDemoMode) {
        const fixture = crearTransaccionesDemoPagos(user);
        setTransaccionesHistorial(rebanarPagina(fixture, paginaSolicitada, tamanoSolicitado));
        setTransaccionesTotal(fixture.length);
        return true;
      }
      const offset = (Math.max(1, paginaSolicitada) - 1) * Math.max(1, tamanoSolicitado);
      const resumen = await apiClient<ResumenFinancieroAlumnoDTO>(
        `/finanzas/clientes/${user.id}/historial?txLimit=${tamanoSolicitado}&txOffset=${offset}`
      );
      setCuota(adaptarCuotaDesdeResumen(resumen, user.entrenadorId || user.id));
      setSaldoAFavorUsd(resumen.saldoAFavorUsd ?? '0.00');
      setTransaccionesHistorial(
        adaptarTransaccionesHistorial(resumen.transacciones, {
          clienteId: resumen.usuarioId,
          entrenadorId: user.entrenadorId || user.id,
        })
      );
      const total = Number(resumen.transaccionesTotal ?? resumen.transacciones?.length ?? 0);
      setTransaccionesTotal(total);
      const totalPaginas = calcularTotalPaginas(total, tamanoSolicitado);
      if (paginaSolicitada > totalPaginas && !reintento) {
        setPaginaHistorial(totalPaginas);
        void cargarPaginaHistorial(totalPaginas, tamanoSolicitado, true);
      }
      return true;
    } catch (err: any) {
      setErrorHistorial(
        err?.message || 'No se pudo cargar el historial de pagos. Inténtalo de nuevo.'
      );
      return false;
    } finally {
      setIsCargandoHistorial(false);
    }
  };

  const cambiarPaginaHistorial = (nuevaPagina: number) => {
    setPaginaHistorial(nuevaPagina);
    void cargarPaginaHistorial(nuevaPagina, tamanoHistorial);
  };

  const cambiarTamanoHistorial = (nuevoTamano: number) => {
    setTamanoHistorial(nuevoTamano);
    setPaginaHistorial(1);
    void cargarPaginaHistorial(1, nuevoTamano);
  };

  useEffect(() => {
    cargarDatos();
  }, [user, isDemoMode]);

  // D2/D6: sin tasa real no se inventa una conversión (derivados en `lib/pagos-montos.ts`).
  const tasaEfectivaNum = tasaEfectivaNumerica(tasa?.tasaEfectiva);
  const etiquetaSinTasa = etiquetaFaltaTasa(tasa?.tasaEfectiva, tasaError);

  const saldoVesProyectado = calcularSaldoVesProyectado(
    cuota?.saldoPendienteUsd,
    tasaEfectivaNum
  );

  // WU20: historial visible según el chip de estado (mismo criterio que el badge de cada fila).
  // WU25b: con paginación server-side el chip filtra la PÁGINA cargada (el endpoint no acepta
  // estados); la cabecera usa `transaccionesTotal`, el COUNT real del servidor.
  const transaccionesFiltradas = useMemo(
    () => filtrarTransaccionesPorEstado(transaccionesHistorial, filtroEstadoHistorial),
    [transaccionesHistorial, filtroEstadoHistorial]
  );

  // U4: URL del GET que alimenta la pantalla (misma construcción que `apiClient`), para datar
  // la copia que el Service Worker tenga en Cache Storage cuando no haya conexión.
  const urlHistorialActual = useMemo(() => {
    if (!user?.id) return null;
    const offset = (Math.max(1, paginaHistorial) - 1) * Math.max(1, tamanoHistorial);
    return resolverUrlApi(
      `/finanzas/clientes/${user.id}/historial?txLimit=${tamanoHistorial}&txOffset=${offset}`
    );
  }, [user?.id, paginaHistorial, tamanoHistorial]);

  return {
    cuota,
    tasa,
    tasaError,
    saldoAFavorUsd,
    isLoading,
    error,
    recargar: cargarDatos,
    paginaHistorial,
    tamanoHistorial,
    transaccionesHistorial,
    transaccionesTotal,
    isCargandoHistorial,
    errorHistorial,
    filtroEstadoHistorial,
    setFiltroEstadoHistorial,
    cambiarPaginaHistorial,
    cambiarTamanoHistorial,
    tasaEfectivaNum,
    etiquetaSinTasa,
    saldoVesProyectado,
    transaccionesFiltradas,
    urlHistorialActual,
  };
}
