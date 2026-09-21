import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../context/auth-context';
import { apiClient } from '../../lib/api-client';
import { pluralizar } from '../../lib/pluralizar';
import { calcularTotalPaginas, rebanarPagina } from '../../lib/paginacion';
import { Paginacion } from '../../components/common/Paginacion';
import {
  Moneda,
  MetodoPago,
  EstadoCuota,
  EstadoConciliacion,
  CuotaDetalleDTO,
  TasaCambioVigenteDTO,
  PresignedUploadUrlResponseDTO,
  ResumenFinancieroAlumnoDTO,
  TransaccionPagoDetalleDTO,
  AuthUserDTO,
} from '@guachafit/shared';
import {
  etiquetaEstadoTransaccion,
  filtrarTransaccionesPorEstado,
  normalizarEstadoTransaccion,
  type FiltroEstadoTransaccionPago,
} from '../../lib/pagos-historial-filtros';
import { etiquetaEstadoCuota } from '../../lib/etiquetas-dominio';
import { etiquetaMetodoPago } from '../../lib/conciliacion-filtros';
import { formatFechaCalendario } from '../../lib/date-format';
import {
  CreditCard,
  TrendingUp,
  Receipt,
  Plus,
  CheckCircle2,
  AlertTriangle,
  X,
  Upload,
  Eye,
  Trash2,
  Image as ImageIcon,
  ArrowLeft,
  ChevronRight,
  ArrowUpRight,
  ShieldCheck,
  RotateCcw,
  SearchX,
} from 'lucide-react';

/**
 * N2: imagen de demostración del visor de comprobante. SOLO se renderiza con `isDemoMode`
 * activo; en sesión real, un comprobante sin URL o con carga fallida muestra un placeholder
 * honesto (el server devuelve `comprobanteUrl = null` de forma legítima, ej. sin R2 configurado).
 */
const COMPROBANTE_DEMO_URL =
  'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=600&q=80';

/**
 * WU25b: transacción demo del historial (mismo fixture de WU20). Solo se usa con `isDemoMode`
 * activo; el slice de página se corta localmente con la misma aritmética del `offset` del API.
 */
function crearTransaccionesDemoPagos(user: AuthUserDTO | null): TransaccionPagoDetalleDTO[] {
  return [
    {
      id: 'tx-001',
      cuotaId: 'cuota-demo-001',
      clienteId: user?.id || 'demo-alumno',
      entrenadorId: user?.entrenadorId || 'demo-coach',
      registradoPor: user?.id || 'demo-alumno',
      montoOriginal: '1300.00',
      monedaOriginal: Moneda.VES,
      tasaCambioFijada: '65.0000',
      montoEquivalenteUsd: '20.00',
      metodoPago: MetodoPago.PAGO_MOVIL,
      referenciaBancaria: '987654',
      fechaOperacion: '2026-09-02',
      estadoConciliacion: 'aprobado' as any,
      fechaReporteUtc: new Date().toISOString(),
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
    },
  ];
}

/** WU20: chips del historial (mismos estados que ya renderiza el badge de cada fila). */
const OPCIONES_ESTADO_HISTORIAL: Array<{
  valor: FiltroEstadoTransaccionPago;
  label: string;
}> = [
  { valor: 'todos', label: 'Todos' },
  { valor: EstadoConciliacion.PENDIENTE, label: etiquetaEstadoTransaccion(EstadoConciliacion.PENDIENTE) },
  { valor: EstadoConciliacion.APROBADO, label: etiquetaEstadoTransaccion(EstadoConciliacion.APROBADO) },
  { valor: EstadoConciliacion.RECHAZADO, label: etiquetaEstadoTransaccion(EstadoConciliacion.RECHAZADO) },
];

/**
 * WU20: normaliza las transacciones del historial real al DTO que renderiza la vista.
 * `GET /finanzas/clientes/:id/historial` entrega `estado`/`referencia`/`montoUsd`/`montoBs`
 * (no `estadoConciliacion`/`referenciaBancaria`/`montoEquivalenteUsd`); sin este mapeo la fila
 * mostraba "En Revisión" y montos indefinidos. Es solo lectura: no toca el flujo de reportar pago.
 */
function adaptarTransaccionesHistorial(
  transacciones: ResumenFinancieroAlumnoDTO['transacciones'],
  contexto: { clienteId: string; entrenadorId: string }
): TransaccionPagoDetalleDTO[] {
  return transacciones.map((tx) => {
    const esVes = Boolean(tx.montoBs);
    const tasa = esVes
      ? Number(tx.montoUsd) > 0
        ? (Number(tx.montoBs) / Number(tx.montoUsd)).toFixed(4)
        : ''
      : '1.0000';

    return {
      id: tx.id,
      cuotaId: tx.cuotaId,
      clienteId: contexto.clienteId,
      entrenadorId: contexto.entrenadorId,
      registradoPor: contexto.clienteId,
      montoOriginal: tx.montoBs ?? tx.montoUsd,
      monedaOriginal: esVes ? Moneda.VES : Moneda.USD,
      tasaCambioFijada: tasa,
      montoEquivalenteUsd: tx.montoUsd,
      metodoPago: tx.metodoPago as MetodoPago,
      referenciaBancaria: tx.referencia ?? null,
      fechaOperacion: tx.createdAtUtc ? tx.createdAtUtc.slice(0, 10) : '',
      estadoConciliacion: (tx.estado as EstadoConciliacion) ?? EstadoConciliacion.PENDIENTE,
      fechaReporteUtc: tx.createdAtUtc,
      createdAtUtc: tx.createdAtUtc,
      updatedAtUtc: tx.createdAtUtc,
    };
  });
}

/**
 * Adapta el resumen financiero real (`GET /finanzas/clientes/:id/historial`) a la vista de cuota.
 * Solo transporta datos reales: los campos no mostrados se rellenan con valores neutros y los
 * campos visibles (saldos, estado, vencimiento, transacciones) provienen del servidor.
 */
function adaptarCuotaDesdeResumen(
  resumen: ResumenFinancieroAlumnoDTO,
  entrenadorId: string
): CuotaDetalleDTO | null {
  const c = resumen.cuotaMesActual;
  if (!c) return null;
  return {
    id: c.id,
    clienteId: resumen.alumnoId,
    entrenadorId,
    planId: '',
    planNombre: `Cuota del periodo ${c.periodo}`,
    periodo: c.periodo,
    montoTotalUsd: c.montoTotalUsd,
    montoAbonadoUsd: c.montoPagadoUsd,
    saldoPendienteUsd: c.saldoPendienteUsd,
    fechaEmisionUtc: c.fechaVencimiento,
    fechaCorteUtc: c.fechaVencimiento,
    estado: c.estado as EstadoCuota,
    transacciones: adaptarTransaccionesHistorial(resumen.transacciones, {
      clienteId: resumen.usuarioId,
      entrenadorId,
    }),
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString(),
  };
}

export function PagosPage() {
  const { user, isDemoMode } = useAuth();
  const [cuota, setCuota] = useState<CuotaDetalleDTO | null>(null);
  const [tasa, setTasa] = useState<TasaCambioVigenteDTO | null>(null);
  // D6: distingue "sin tasa configurada" (dato real de la API) de "no se pudo consultar".
  const [tasaError, setTasaError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // D2: fallo de carga honesto (sin cuota demo fuera del modo demo).
  const [error, setError] = useState<string | null>(null);
  // WU25b: historial paginado server-side con `txLimit`/`txOffset` + `transaccionesTotal` real.
  const [paginaHistorial, setPaginaHistorial] = useState(1);
  const [tamanoHistorial, setTamanoHistorial] = useState(10);
  const [transaccionesHistorial, setTransaccionesHistorial] = useState<
    TransaccionPagoDetalleDTO[]
  >([]);
  const [transaccionesTotal, setTransaccionesTotal] = useState(0);
  const [isCargandoHistorial, setIsCargandoHistorial] = useState(false);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);

  // Progressive Disclosure: 'hub' (selector) | 'nuevo-pago' | 'historial'
  const [vistaActiva, setVistaActiva] = useState<'hub' | 'nuevo-pago' | 'historial'>('hub');
  // WU20: chip de estado del historial (solo lectura; no afecta el flujo de reportar pago).
  const [filtroEstadoHistorial, setFiltroEstadoHistorial] =
    useState<FiltroEstadoTransaccionPago>('todos');

  // Form State
  const [metodoPago, setMetodoPago] = useState<MetodoPago>(MetodoPago.PAGO_MOVIL);
  const [moneda, setMoneda] = useState<Moneda>(Moneda.VES);
  const [montoOriginal, setMontoOriginal] = useState('1300.00');
  const [referenciaBancaria, setReferenciaBancaria] = useState('');
  const [fechaOperacion, setFechaOperacion] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // File Upload State (RF-007, ADR-007)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // N2: visor de comprobante. `url` puede ser null (el server no generó presigned URL): en
  // sesión real se muestra un placeholder honesto; jamás una imagen stock como si fuera propia.
  const [modalComprobante, setModalComprobante] = useState<{ url: string | null } | null>(null);
  const [comprobanteImgError, setComprobanteImgError] = useState(false);

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
   * WU25b: carga UNA página del historial de transacciones del alumno.
   *
   * - Real: `GET /finanzas/clientes/:id/historial?txLimit&txOffset`; `transaccionesTotal` es el
   *   COUNT real y los agregados del resumen siguen siendo del total, no de la página.
   * - Demo: corta el fixture local (`crearTransaccionesDemoPagos`) sin tocar la red.
   * Devuelve false si la consulta falla: el llamador decide el mensaje y se conserva lo cargado.
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

  // D2/D6: sin tasa real no se inventa una conversión. Se distingue el dato real de la API
  // ("sin tasa configurada") de un fallo de consulta ("no disponible").
  const tasaEfectivaNum = Number(tasa?.tasaEfectiva || '0') || 0;
  const etiquetaSinTasa = tasa?.tasaEfectiva
    ? null
    : tasaError
    ? 'Tasa no disponible'
    : 'Sin tasa configurada';
  // Operación que SÍ requiere tasa (pago en VES con dato confirmado de ausencia): se bloquea con
  // mensaje claro en vez de dejar que el usuario llene el formulario para recibir un error tardío.
  const pagoVesSinTasa = moneda === Moneda.VES && !tasa?.tasaEfectiva && !tasaError;
  const montoNum = Number(montoOriginal) || 0;
  const contravalorUsd =
    moneda === Moneda.VES
      ? tasaEfectivaNum > 0
        ? (montoNum / tasaEfectivaNum).toFixed(2)
        : '—'
      : montoNum.toFixed(2);

  const saldoVesProyectado =
    tasaEfectivaNum > 0
      ? (Number(cuota?.saldoPendienteUsd || 0) * tasaEfectivaNum).toFixed(2)
      : '—';

  // WU20: historial visible según el chip de estado (mismo criterio que el badge de cada fila).
  // WU25b: con paginación server-side el chip filtra la PÁGINA cargada (el endpoint no acepta
  // estados); la cabecera usa `transaccionesTotal`, el COUNT real del servidor.
  const transaccionesFiltradas = useMemo(
    () => filtrarTransaccionesPorEstado(transaccionesHistorial, filtroEstadoHistorial),
    [transaccionesHistorial, filtroEstadoHistorial]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Formato inválido. Por favor selecciona una imagen JPG, PNG o WebP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFormError('El archivo excede el límite máximo de 5 MB.');
      return;
    }

    setFormError(null);
    setSelectedFile(file);
    const objUrl = URL.createObjectURL(file);
    setPreviewUrl(objUrl);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleReportarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    let finalStorageKey: string | undefined = undefined;

    if (selectedFile) {
      try {
        const presignedData = await apiClient<PresignedUploadUrlResponseDTO>(
          '/antropometria/presigned-upload-url',
          {
            method: 'POST',
            body: JSON.stringify({
              modulo: 'comprobantes',
              alumnoId: user?.id,
              mimeType: selectedFile.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp',
            }),
          }
        );

        if (presignedData.uploadUrl) {
          await fetch(presignedData.uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': selectedFile.type,
            },
            body: selectedFile,
          });
          finalStorageKey = presignedData.storageKey;
        }
      } catch (err: any) {
        // D2: sin storageKey fabricado; si el comprobante no se pudo subir, el reporte no se envía.
        setFormError(
          err?.message ||
            'No se pudo subir el comprobante. Revisa tu conexión e inténtalo de nuevo.'
        );
        setIsSubmitting(false);
        return;
      }
    }

    if (!cuota) {
      setFormError('No tienes una cuota vigente para reportar el pago. Contacta a tu coach.');
      setIsSubmitting(false);
      return;
    }

    try {
      await apiClient(`/finanzas/cuotas/${cuota.id}/reportar-pago`, {
        method: 'POST',
        body: JSON.stringify({
          montoOriginal,
          monedaOriginal: moneda,
          metodoPago,
          referenciaBancaria: referenciaBancaria || undefined,
          fechaOperacion,
          comprobanteStorageKey: finalStorageKey,
        }),
      });

      setFormSuccess('¡Pago reportado con éxito! Tu coach lo validará en la bandeja.');
      handleRemoveFile();
      setTimeout(() => {
        setFormSuccess(null);
        setVistaActiva('historial');
      }, 1800);
    } catch (err: any) {
      // D5: sin éxito falso; el pago solo queda reportado si el servidor lo aceptó.
      setFormError(
        err?.message || 'No se pudo reportar el pago. Revisa los datos e inténtalo de nuevo.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24 lg:pb-12 animate-in fade-in duration-200">
      {/* Cabecera / Título */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
            <CreditCard className="h-3.5 w-3.5" />
            <span>Membresía y Finanzas</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-0.5">
            Pagos y Cuotas
          </h1>
        </div>

        {/* Tasa del Día */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-secondary/70 border border-border/80 self-start sm:self-auto">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          <div className="text-right">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase block">
              Tasa del Día
            </span>
            <span className="text-xs font-bold font-mono text-foreground">
              {tasa?.tasaEfectiva ? `1 USD = ${tasa.tasaEfectiva} VES` : etiquetaSinTasa}
            </span>
          </div>
        </div>
      </div>

      {/* D2: error de carga honesto con reintento (sin cuota demo fuera del modo demo) */}
      {error && (
        <div className="p-5 rounded-3xl bg-card border border-destructive/30 text-center space-y-3">
          <AlertTriangle className="h-7 w-7 text-destructive mx-auto" />
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => cargarDatos()}
            className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* D2: sin cuota emitida no se simula saldo; estado vacío honesto */}
      {!isLoading && !error && !cuota && vistaActiva === 'hub' && (
        <div className="p-8 rounded-3xl bg-card border border-dashed border-border text-center space-y-2">
          <Receipt className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
          <h3 className="font-bold text-sm text-foreground">Sin cuota vigente</h3>
          <p className="text-xs text-muted-foreground">
            Tu coach aún no ha emitido una cuota para este periodo. Si crees que es un error,
            contáctalo.
          </p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 1: HUB PRINCIPAL (Divulgación Progresiva - Nivel 1)                  */}
      {/* ========================================================================= */}
      {vistaActiva === 'hub' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* Tarjeta de Resumen de Saldo */}
          {cuota && (
            <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-md relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-border/60 pb-4">
                <div>
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">
                    {cuota.planNombre}
                  </span>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Corte:{' '}
                    {new Date(cuota.fechaCorteUtc).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'long',
                    })}
                  </div>
                </div>

                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                    cuota.estado === EstadoCuota.AL_DIA
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                      : cuota.estado === EstadoCuota.ABONADA_PARCIAL
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                      : 'bg-destructive/15 text-destructive border border-destructive/20'
                  }`}
                >
                  {etiquetaEstadoCuota(cuota.estado).texto}
                </span>
              </div>

              {/* Saldo Grande */}
              <div className="my-5 flex items-baseline justify-between">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground block">
                    Saldo Pendiente
                  </span>
                  <div className="text-3xl sm:text-4xl font-black font-mono text-foreground mt-0.5">
                    ${cuota.saldoPendienteUsd}{' '}
                    <span className="text-sm font-semibold text-primary">USD</span>
                  </div>
                  <div className="text-xs font-mono text-muted-foreground mt-0.5">
                    {tasaEfectivaNum > 0
                      ? `≈ ${saldoVesProyectado} Bolívares`
                      : 'Saldo en Bs. no disponible sin tasa vigente'}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-semibold text-muted-foreground block">
                    Total Cuota
                  </span>
                  <span className="text-lg font-bold font-mono text-muted-foreground">
                    ${cuota.montoTotalUsd} USD
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Selector de Acciones: 2 Caminos Claros */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider px-1">
              Selecciona qué deseas hacer:
            </h2>

            {/* Opción A: Realizar Abono */}
            <div
              onClick={() => setVistaActiva('nuevo-pago')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setVistaActiva('nuevo-pago')}
              className="group p-5 rounded-3xl bg-gradient-to-br from-card to-primary/10 border-2 border-primary/40 hover:border-primary transition-all duration-200 cursor-pointer shadow-md hover:shadow-primary/5 active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3.5 rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
                    <Plus className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5">
                      Reportar un nuevo abono o pago
                      <ArrowUpRight className="h-4 w-4 text-primary opacity-80" />
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                      Paga vía Pago Móvil, Zelle o divisas y adjunta tu comprobante en 30 segundos.
                    </p>
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-secondary/80 text-foreground group-hover:text-primary group-hover:bg-primary/15 transition-colors">
                  <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>

            {/* Opción B: Ver Historial */}
            <div
              onClick={() => setVistaActiva('historial')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setVistaActiva('historial')}
              className="group p-5 rounded-3xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer shadow-xs active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3.5 rounded-2xl bg-secondary text-foreground">
                    <Receipt className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                        Ver recibos e historial
                      </h3>
                      {transaccionesTotal > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                          {pluralizar(transaccionesTotal, 'pago', 'pagos')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                      Consulta comprobantes verificados, estados de cuota y aclaratorias de pagos.
                    </p>
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-secondary/80 text-foreground group-hover:text-primary transition-colors">
                  <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: FORMULARIO LIMPIO DE REPORTE (Sin modal invasivo)                 */}
      {/* ========================================================================= */}
      {vistaActiva === 'nuevo-pago' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-border/80 pb-3">
            <button
              onClick={() => setVistaActiva('hub')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Volver a opciones de pago</span>
            </button>
            <span className="text-xs font-semibold text-muted-foreground">Paso guiado</span>
          </div>

          <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-md space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Reportar Abono o Cuota</h2>
              <p className="text-xs text-muted-foreground">
                Introduce los datos de la transferencia o pago móvil para que tu entrenador lo verifique.
              </p>
            </div>

            {formError && (
              <div className="p-3 rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold">
                {formError}
              </div>
            )}

            {formSuccess ? (
              <div className="p-8 text-center space-y-3">
                <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
                <p className="text-sm font-bold text-foreground">{formSuccess}</p>
                <p className="text-xs text-muted-foreground">Redirigiendo a tu historial...</p>
              </div>
            ) : (
              <form onSubmit={handleReportarPago} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Método de Pago</label>
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  >
                    <option value={MetodoPago.PAGO_MOVIL}>Pago Móvil (VES)</option>
                    <option value={MetodoPago.TRANSFERENCIA_BANCARIA}>Transferencia Bancaria (VES)</option>
                    <option value={MetodoPago.EFECTIVO_USD}>Efectivo USD</option>
                    <option value={MetodoPago.EFECTIVO_VES}>Efectivo VES</option>
                    <option value={MetodoPago.ZELLE}>Zelle (USD)</option>
                    <option value={MetodoPago.BINANCE_USDT}>Binance USDT</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Moneda</label>
                    <select
                      value={moneda}
                      onChange={(e) => setMoneda(e.target.value as Moneda)}
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                    >
                      <option value={Moneda.VES}>VES (Bolívares)</option>
                      <option value={Moneda.USD}>USD (Dólares)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Monto Pagado</label>
                    <input
                      type="text"
                      required
                      value={montoOriginal}
                      onChange={(e) => setMontoOriginal(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                </div>

                {/* Previsualización de conversión */}
                <div
                  className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                    pagoVesSinTasa
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-primary/10 border-primary/20'
                  }`}
                >
                  <span className="text-xs text-muted-foreground">
                    {pagoVesSinTasa
                      ? 'Sin tasa configurada: tu entrenador debe definirla para reportar pagos en bolívares.'
                      : 'Contravalor acreditado a tu cuota:'}
                  </span>
                  {!pagoVesSinTasa && (
                    <span className="font-mono font-black text-sm text-primary">
                      ${contravalorUsd} USD
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Referencia Bancaria (Últimos 4-6 dígitos)
                  </label>
                  <input
                    type="text"
                    value={referenciaBancaria}
                    onChange={(e) => setReferenciaBancaria(e.target.value)}
                    placeholder="Ej: 987654"
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Fecha de Operación</label>
                  <input
                    type="date"
                    required
                    value={fechaOperacion}
                    onChange={(e) => setFechaOperacion(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                {/* Subida de Comprobante */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                    <span>Captura del Comprobante Bancario</span>
                    <span className="text-[10px] text-muted-foreground">Recomendado • Max 5MB</span>
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {!selectedFile ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="p-5 rounded-2xl border-2 border-dashed border-border/80 hover:border-primary/60 bg-secondary/20 hover:bg-secondary/40 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 text-center"
                    >
                      <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                        <Upload className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-bold text-foreground">
                        Toca para adjuntar foto o captura
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Captura de Pago Móvil, Zelle o Transferencia (JPG, PNG, WebP)
                      </p>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-2xl border border-primary/30 bg-primary/5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 overflow-hidden">
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                            alt="Preview comprobante"
                            className="h-12 w-12 rounded-xl object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <ImageIcon className="h-5 w-5 text-primary" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">
                            {selectedFile.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {(selectedFile.size / 1024).toFixed(1)} KB • Listo para enviar
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="p-2 rounded-xl hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors shrink-0 cursor-pointer"
                        title="Quitar comprobante"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || pagoVesSinTasa}
                  className="w-full py-3.5 px-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm tracking-wide shadow-md shadow-primary/20 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                >
                  {isSubmitting ? 'Enviando al coach...' : 'Enviar Comprobante de Pago'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 3: HISTORIAL LIMPIO CON VISIBILIDAD DE RECHAZOS (UX Transparente)    */}
      {/* ========================================================================= */}
      {vistaActiva === 'historial' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-border/80 pb-3">
            <button
              onClick={() => setVistaActiva('hub')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Volver a opciones de pago</span>
            </button>
            <button
              onClick={() => setVistaActiva('nuevo-pago')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nuevo Abono</span>
            </button>
          </div>

          <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base text-foreground flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <span>Historial de Pagos y Recibos</span>
              </h2>
              <span className="text-xs text-muted-foreground font-mono">
                {pluralizar(transaccionesTotal, 'registro', 'registros')}
              </span>
            </div>

            {transaccionesHistorial.length > 0 && (
              <div className="p-3 rounded-2xl bg-secondary/20 border border-border/70 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {OPCIONES_ESTADO_HISTORIAL.map((opcion) => {
                    const activo = filtroEstadoHistorial === opcion.valor;
                    return (
                      <button
                        key={opcion.valor}
                        type="button"
                        onClick={() => setFiltroEstadoHistorial(opcion.valor)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          activo
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {opcion.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Mostrando {transaccionesFiltradas.length} de {transaccionesHistorial.length} en
                  esta página · {pluralizar(transaccionesTotal, 'registro', 'registros')}
                </p>
              </div>
            )}

            {transaccionesHistorial.length === 0 ? (
              errorHistorial ? null : (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  No hay transacciones registradas para este periodo.
                </p>
              )
            ) : transaccionesFiltradas.length === 0 ? (
              <div className="p-10 rounded-3xl bg-card border border-dashed border-border text-center space-y-3">
                <SearchX className="h-9 w-9 text-muted-foreground mx-auto opacity-50" />
                <h3 className="text-sm font-black text-foreground">Sin resultados</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Ningún pago del historial coincide con el estado seleccionado.
                </p>
                <button
                  type="button"
                  onClick={() => setFiltroEstadoHistorial('todos')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Limpiar filtro</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {transaccionesFiltradas.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-4 rounded-2xl bg-secondary/30 border border-border/80 flex flex-col gap-2.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground capitalize">
                            {etiquetaMetodoPago(tx.metodoPago)}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                              normalizarEstadoTransaccion(tx.estadoConciliacion) ===
                              EstadoConciliacion.APROBADO
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                : normalizarEstadoTransaccion(tx.estadoConciliacion) ===
                                  EstadoConciliacion.RECHAZADO
                                ? 'bg-destructive/15 text-destructive border border-destructive/20'
                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {etiquetaEstadoTransaccion(tx.estadoConciliacion)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Ref: {tx.referenciaBancaria || 'Sin referencia'} • Fecha:{' '}
                          {formatFechaCalendario(tx.fechaOperacion) ?? tx.fechaOperacion}
                        </p>
                      </div>

                      <div className="text-left sm:text-right">
                        <p className="font-mono font-black text-base text-foreground">
                          +${tx.montoEquivalenteUsd} USD
                        </p>
                        <p className="text-[11px] font-mono text-muted-foreground">
                          {tx.montoOriginal} {tx.monedaOriginal} (Tasa: {tx.tasaCambioFijada})
                        </p>
                      </div>
                    </div>

                    {/* UX CRÍTICA: VISIBILIDAD DEL MOTIVO DE RECHAZO */}
                    {normalizarEstadoTransaccion(tx.estadoConciliacion) ===
                      EstadoConciliacion.RECHAZADO && (
                      <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/25 text-xs text-destructive flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-1">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">Motivo del Coach: </span>
                            <span>
                              {tx.motivoRechazo ||
                                'La referencia no coincide con el estado de cuenta bancario.'}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setVistaActiva('nuevo-pago')}
                          className="self-end sm:self-auto px-3 py-1 rounded-lg bg-destructive text-destructive-foreground font-bold text-[11px] hover:brightness-110 cursor-pointer transition-all shrink-0"
                        >
                          Corregir y Reenviar
                        </button>
                      </div>
                    )}

                    {/* Botón Ver Comprobante */}
                    {(tx.comprobanteUrl || tx.comprobanteStorageKey) && (
                      <div className="pt-2 border-t border-border/50 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setComprobanteImgError(false);
                            setModalComprobante({ url: tx.comprobanteUrl ?? null });
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-colors cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>Ver Comprobante Subido</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* WU25b: fallo de página visible sin perder lo ya cargado */}
            {errorHistorial && (
              <div
                role="alert"
                className="p-3 rounded-2xl bg-destructive/10 border border-destructive/25 text-destructive text-xs font-bold flex items-center gap-2"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{errorHistorial}</span>
              </div>
            )}

            {/* WU25b: paginación numerada con txLimit/txOffset y transaccionesTotal real */}
            {transaccionesTotal > 0 && (
              <div className="pt-1">
                <Paginacion
                  pagina={paginaHistorial}
                  tamano={tamanoHistorial}
                  total={transaccionesTotal}
                  onCambiarPagina={cambiarPaginaHistorial}
                  onCambiarTamano={cambiarTamanoHistorial}
                  cargando={isCargandoHistorial}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Comprobante SigV4 */}
      {modalComprobante && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md">
          <div className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-lg space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-base text-foreground">Comprobante de Pago</h3>
              </div>
              <button
                onClick={() => setModalComprobante(null)}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto rounded-2xl border border-border bg-black/40 flex items-center justify-center min-h-[260px] p-2">
              {modalComprobante.url && !comprobanteImgError ? (
                <img
                  src={modalComprobante.url}
                  alt="Comprobante bancario"
                  className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-md"
                  onError={() => setComprobanteImgError(true)}
                />
              ) : isDemoMode && !modalComprobante.url ? (
                // N2: la foto stock SOLO vive en modo demo explícito.
                <img
                  src={COMPROBANTE_DEMO_URL}
                  alt="Comprobante bancario (demostración)"
                  className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-md opacity-80"
                />
              ) : (
                // N2: en sesión real nunca se muestra una imagen ajena como comprobante propio.
                <div className="text-center space-y-2 px-6">
                  <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/60" />
                  <p className="text-sm font-bold text-foreground">
                    {modalComprobante.url
                      ? 'No se pudo cargar la imagen del comprobante'
                      : 'Sin comprobante disponible'}
                  </p>
                  <p className="text-[11px] text-muted-foreground max-w-xs">
                    {modalComprobante.url
                      ? 'El enlace temporal de lectura falló o expiró. Cierra el visor e inténtalo de nuevo.'
                      : 'El servidor no generó una URL de lectura para este pago (por ejemplo, almacenamiento R2 no configurado).'}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                {modalComprobante.url ? (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                    Almacenamiento seguro en Cloudflare R2
                  </>
                ) : (
                  'Sin captura digital verificable'
                )}
              </span>
              <button
                onClick={() => setModalComprobante(null)}
                className="py-2 px-4 rounded-xl bg-secondary text-foreground text-xs font-bold hover:bg-secondary/80 transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
