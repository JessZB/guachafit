import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { avisoExcedenteAprobacion, mensajeConExcedente } from '../../lib/saldo-a-favor';
import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';
import { pluralizar } from '../../lib/pluralizar';
import { formatFechaCalendario } from '../../lib/date-format';
import { rebanarPagina } from '../../lib/paginacion';
import { usePaginacionServidor } from '../../lib/use-paginacion-servidor';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { Paginacion } from '../../components/common/Paginacion';
import {
  TransaccionPagoDetalleDTO,
  BandejaConciliacionDTO,
  Moneda,
  MetodoPago,
} from '@guachafit/shared';
import {
  etiquetaMetodoPago,
  filtrarTransaccionesConciliacion,
  hayFiltroConciliacionActivo,
  metodosPagoPresentes,
  type FiltroMetodoPago,
} from '../../lib/conciliacion-filtros';
import {
  DollarSign,
  Receipt,
  CheckCircle2,
  XCircle,
  FileText,
  AlertCircle,
  X,
  ExternalLink,
  ShieldCheck,
  Eye,
  Image as ImageIcon,
  RotateCcw,
  Search,
  SearchX,
} from 'lucide-react';

/**
 * N2: imagen de demostración del visor de comprobantes. SOLO se renderiza con `isDemoMode`
 * activo; en sesión real, un comprobante sin URL o con carga fallida muestra un placeholder
 * honesto (el server devuelve `comprobanteUrl = null` de forma legítima, ej. sin R2 configurado).
 */
const COMPROBANTE_DEMO_URL =
  'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80';

/**
 * WU25b: cola demo de la bandeja (mismo fixture de WU20). Solo se usa con `isDemoMode` activo;
 * el slice de página se corta localmente con la misma aritmética del `offset` del servidor.
 */
function crearColaDemo(): TransaccionPagoDetalleDTO[] {
  return [
    {
      id: 'tx-pending-1',
      cuotaId: 'cuota-101',
      clienteId: 'cli-01',
      entrenadorId: 'coach-01',
      clienteNombre: 'Carlos Mendoza',
      registradoPor: 'cli-01',
      montoOriginal: '1950.00',
      monedaOriginal: Moneda.VES,
      tasaCambioFijada: '65.0000',
      montoEquivalenteUsd: '30.00',
      excedenteUsd: '0.00',
      metodoPago: MetodoPago.PAGO_MOVIL,
      referenciaBancaria: '445566',
      fechaOperacion: '2026-09-06',
      comprobanteStorageKey: 'comprobantes/cli-01/2026/demo-recibo-1.webp',
      comprobanteUrl:
        'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80',
      estadoConciliacion: 'pendiente' as any,
      fechaReporteUtc: new Date().toISOString(),
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
    },
    {
      id: 'tx-pending-2',
      cuotaId: 'cuota-102',
      clienteId: 'cli-02',
      entrenadorId: 'coach-01',
      clienteNombre: 'Mariana Pérez',
      registradoPor: 'cli-02',
      montoOriginal: '50.00',
      monedaOriginal: Moneda.USD,
      tasaCambioFijada: '65.0000',
      montoEquivalenteUsd: '50.00',
      excedenteUsd: '0.00',
      metodoPago: MetodoPago.ZELLE,
      referenciaBancaria: 'ZEL-998811',
      fechaOperacion: '2026-09-05',
      comprobanteStorageKey: 'comprobantes/cli-02/2026/demo-recibo-2.webp',
      comprobanteUrl:
        'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80',
      estadoConciliacion: 'pendiente' as any,
      fechaReporteUtc: new Date().toISOString(),
      createdAtUtc: new Date().toISOString(),
      updatedAtUtc: new Date().toISOString(),
    },
  ];
}

export function ConciliacionPage() {
  const { isDemoMode } = useAuth();
  // WU25b: paginación numerada server-side (envelope `{ items, total, limit, offset }`).
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  // En demo la cola es local: los ids ya conciliados se excluyen del slice del fixture.
  const [idsResueltosDemo, setIdsResueltosDemo] = useState<string[]>([]);
  const [rejectingTx, setRejectingTx] = useState<TransaccionPagoDetalleDTO | null>(null);
  const [viewingComprobanteTx, setViewingComprobanteTx] = useState<TransaccionPagoDetalleDTO | null>(null);
  // N2: la URL real puede fallar (expiración TTL); nunca se sustituye por una imagen ajena.
  const [comprobanteImgError, setComprobanteImgError] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  // D5: fallo de conciliación visible; la transacción no desaparece si el server no confirmó.
  const [actionError, setActionError] = useState<string | null>(null);
  // WU20: filtros client-side de la bandeja (búsqueda por alumno/referencia + método de pago).
  // WU25b: con paginación server-side se aplican sobre la PÁGINA cargada (el endpoint no acepta
  // filtros); la UI muestra el conteo "en esta página" para no confundir con el total en cola.
  const [busqueda, setBusqueda] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState<FiltroMetodoPago>('todos');

  // U3b: los dos modales de la bandeja (rechazo y visor de comprobante) comparten el contrato de
  // diálogo accesible: Escape, trampa de Tab, foco inicial y restore del foco al disparador.
  const refModalRechazo = useDialogoAccesible({
    abierto: rejectingTx !== null,
    onCerrar: () => setRejectingTx(null),
  });
  const refModalComprobante = useDialogoAccesible({
    abierto: viewingComprobanteTx !== null,
    onCerrar: () => setViewingComprobanteTx(null),
  });

  /**
   * WU25b: carga de UNA página de la bandeja. En demo se filtra la cola local (ids ya
   * conciliados) y se corta con `rebanarPagina`; en real se consulta el envelope del servidor.
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
    }): Promise<BandejaConciliacionDTO> => {
      const offset = (paginaSolicitada - 1) * tamanoSolicitado;
      if (isDemoMode) {
        const cola = crearColaDemo().filter((tx) => !idsResueltosDemo.includes(tx.id));
        return {
          items: rebanarPagina(cola, paginaSolicitada, tamanoSolicitado),
          total: cola.length,
          limit: tamanoSolicitado,
          offset,
        };
      }
      return apiClient<BandejaConciliacionDTO>(
        `/finanzas/conciliacion/bandeja?limit=${tamanoSolicitado}&offset=${offset}`,
        { signal }
      );
    },
    [isDemoMode, idsResueltosDemo]
  );

  const paginacion = usePaginacionServidor<TransaccionPagoDetalleDTO, BandejaConciliacionDTO>({
    clave: ['conciliacion-bandeja', isDemoMode ? `demo-${idsResueltosDemo.length}` : 'real'],
    pagina,
    tamano,
    cargar: cargarPagina,
    onAjustarPagina: setPagina,
  });

  const {
    items: transacciones,
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
    () => filtrarTransaccionesConciliacion(transacciones, { busqueda, metodoPago: filtroMetodo }),
    [transacciones, busqueda, filtroMetodo]
  );

  const metodosPresentes = useMemo(() => metodosPagoPresentes(transacciones), [transacciones]);

  const hayFiltroActivo = hayFiltroConciliacionActivo({ busqueda, metodoPago: filtroMetodo });

  // Si el método filtrado desaparece de la cola (p. ej. tras aprobar la única transacción de ese
  // método), el chip activo ya no existiría: se vuelve a "Todos" para no dejar un filtro fantasma.
  useEffect(() => {
    if (filtroMetodo !== 'todos' && !metodosPresentes.includes(filtroMetodo)) {
      setFiltroMetodo('todos');
    }
  }, [metodosPresentes, filtroMetodo]);

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroMetodo('todos');
  };

  const handleAprobar = async (txId: string) => {
    setActionError(null);
    let excedenteUsd: string | undefined;
    try {
      const respuesta = await apiClient<{ transaccion?: { excedenteUsd?: string } } | null>(
        `/finanzas/transacciones/${txId}/conciliar`,
        {
          method: 'PATCH',
          body: JSON.stringify({ accion: 'aprobar' }),
        }
      );
      excedenteUsd = respuesta?.transaccion?.excedenteUsd;
    } catch (err: any) {
      // D5: sin éxito falso ni desaparición optimista; la transacción sigue en la bandeja.
      setActionError(
        err?.message || 'No se pudo aprobar la transacción. Revisa tu conexión e inténtalo de nuevo.'
      );
      return;
    }

    // WU25b: el servidor manda; se recarga la página actual (el hook ajusta si el total encogió).
    // En demo se registra el id resuelto y el slice local se recalcula.
    if (isDemoMode) setIdsResueltosDemo((prev) => [...prev, txId]);
    else recargar();
    // RF-006 RN-05: el excedente (dato del API) queda como saldo a favor del alumno.
    setActionSuccess(mensajeConExcedente('Pago aprobado y descontado de la cuota.', excedenteUsd));
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const handleConfirmarRechazo = async () => {
    if (!rejectingTx || !motivoRechazo.trim()) return;
    setActionError(null);

    try {
      await apiClient(`/finanzas/transacciones/${rejectingTx.id}/conciliar`, {
        method: 'PATCH',
        body: JSON.stringify({
          accion: 'rechazar',
          motivoRechazo,
        }),
      });
    } catch (err: any) {
      setActionError(
        err?.message || 'No se pudo rechazar la transacción. Revisa tu conexión e inténtalo de nuevo.'
      );
      return;
    }

    // WU25b: mismo criterio que aprobar — recarga real o slice demo con el id resuelto.
    if (isDemoMode) setIdsResueltosDemo((prev) => [...prev, rejectingTx.id]);
    else recargar();
    setRejectingTx(null);
    setMotivoRechazo('');
    setActionSuccess('Transacción rechazada con observaciones notificadas al alumno.');
    setTimeout(() => setActionSuccess(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          <DollarSign className="h-4 w-4" />
          <span>Pagos y Cobros</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Bandeja de Pagos por Validar
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Aprueba o rechaza los pagos que reportan tus alumnos.
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-warning/15 text-warning border border-warning/20">
            {pluralizar(total, 'transacción en cola', 'transacciones en cola')}
          </span>
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

      {/* D2: error honesto con reintento (sin cola demo fuera del modo demo) */}
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
      ) : total === 0 ? (
        <div className="p-12 text-center space-y-3 bg-card rounded-3xl border border-border">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
          <h3 className="font-bold text-base text-foreground">Bandeja al Día</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            No hay transacciones pendientes de revisión. Todos los abonos han sido procesados.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* WU25b: paginación numerada server-side (FIFO del endpoint) */}
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

          {/* WU20: filtros de la bandeja (búsqueda por alumno/referencia + método real de la tarjeta) */}
          <div className="p-4 rounded-3xl bg-card border border-border/80 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setFiltroMetodo('todos')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    filtroMetodo === 'todos'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Todos
                </button>
                {metodosPresentes.map((metodo) => {
                  const activo = filtroMetodo === metodo;
                  return (
                    <button
                      key={metodo}
                      type="button"
                      onClick={() => setFiltroMetodo(metodo)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activo
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span className="capitalize">{etiquetaMetodoPago(metodo)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="relative flex-1 lg:max-w-xs lg:ml-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por alumno o referencia..."
                  aria-label="Buscar pago por alumno o referencia"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-background border border-border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground font-mono">
                Mostrando {visibles.length} de {transacciones.length} en esta página ·{' '}
                {pluralizar(total, 'transacción en cola', 'transacciones en cola')}
              </p>
              {hayFiltroActivo && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {visibles.length === 0 ? (
            <div className="p-10 rounded-3xl bg-card border border-dashed border-border text-center space-y-3">
              <SearchX className="h-9 w-9 text-muted-foreground mx-auto opacity-50" />
              <h3 className="text-sm font-bold text-foreground">Sin resultados</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Ningún pago en cola coincide con la búsqueda o el método seleccionado.
              </p>
              <button
                type="button"
                onClick={limpiarFiltros}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Limpiar filtros</span>
              </button>
            </div>
          ) : (
            visibles.map((tx) => (
            <div
              key={tx.id}
              className="p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-4 hover:border-primary/40 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-lg text-foreground">
                      {tx.clienteNombre || 'Alumno'}
                    </h2>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border uppercase">
                      {etiquetaMetodoPago(tx.metodoPago)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <p className="text-xs text-muted-foreground">
                      Ref: <span className="font-mono font-bold text-foreground">{tx.referenciaBancaria}</span> •
                      Fecha Operación:{' '}
                      {formatFechaCalendario(tx.fechaOperacion) ?? tx.fechaOperacion}
                    </p>
                    {tx.comprobanteUrl || tx.comprobanteStorageKey ? (
                      <button
                        type="button"
                        onClick={() => {
                          setComprobanteImgError(false);
                          setViewingComprobanteTx(tx);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-bold transition-all cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Ver Comprobante</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-secondary text-muted-foreground text-[11px] font-medium">
                        <FileText className="h-3 w-3" />
                        <span>Sin captura digital</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-xs text-muted-foreground font-medium block">
                    Abono en Dólares
                  </span>
                  <span className="text-2xl font-bold font-mono text-primary">
                    +${tx.montoEquivalenteUsd} USD
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground block mt-0.5">
                    {tx.montoOriginal} {tx.monedaOriginal} (Tasa: {tx.tasaCambioFijada})
                  </span>
                </div>
              </div>

              {/* RF-006 RN-05: aviso previo si el pago excede lo que debe la cuota. */}
              {avisoExcedenteAprobacion(tx.montoEquivalenteUsd, tx.saldoPendienteCuotaUsd) && (
                <p
                  role="note"
                  className="p-3 rounded-2xl bg-warning/10 border border-warning/30 text-xs font-semibold text-foreground"
                >
                  {avisoExcedenteAprobacion(tx.montoEquivalenteUsd, tx.saldoPendienteCuotaUsd)}
                </p>
              )}

              {/* Actions Grid */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  <span>Acreditación segura con comprobante verificado.</span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => setRejectingTx(tx)}
                    className="flex-1 sm:flex-initial py-2 px-4 rounded-xl border border-destructive/40 text-destructive hover:bg-destructive/10 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Rechazar con Motivo
                  </button>
                  <button
                    onClick={() => handleAprobar(tx.id)}
                    className="flex-1 sm:flex-initial py-2 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                  >
                    Aprobar y Descontar Saldo
                  </button>
                </div>
              </div>
            </div>
            ))
          )}
        </div>
      )}

      {/* Reject Modal */}
      {rejectingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div
            ref={refModalRechazo}
            role="dialog"
            aria-modal="true"
            aria-labelledby="conciliacion-rechazo-titulo"
            tabIndex={-1}
            className="p-6 rounded-3xl bg-card border border-destructive/30 shadow-2xl w-full max-w-md space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <h3
                  id="conciliacion-rechazo-titulo"
                  className="font-bold text-base text-foreground"
                >
                  Rechazar Transacción
                </h3>
              </div>
              <button
                onClick={() => setRejectingTx(null)}
                aria-label="Cerrar rechazo de transacción"
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Se requiere registrar un motivo para que el alumno conozca la razón y pueda corregir el reporte o comprobante.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Motivo del Rechazo</label>
              <textarea
                rows={3}
                required
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                placeholder="Ej: La referencia bancaria no coincide con el extracto o el monto recibido fue incompleto."
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-destructive resize-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setRejectingTx(null)}
                className="flex-1 py-2 rounded-xl bg-secondary hover:bg-secondary/80 font-bold text-xs text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarRechazo}
                disabled={!motivoRechazo.trim()}
                className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground font-bold text-xs shadow-md disabled:opacity-50"
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Inspección de Comprobante Bancario (RF-007, ADR-007) */}
      {viewingComprobanteTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md">
          <div
            ref={refModalComprobante}
            role="dialog"
            aria-modal="true"
            aria-labelledby="conciliacion-comprobante-titulo"
            tabIndex={-1}
            className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-2xl space-y-4 max-h-[92vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h3
                    id="conciliacion-comprobante-titulo"
                    className="font-bold text-base text-foreground"
                  >
                    Auditoría de Comprobante Bancario
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Alumno: <span className="font-bold text-foreground">{viewingComprobanteTx.clienteNombre || 'Alumno'}</span> • {etiquetaMetodoPago(viewingComprobanteTx.metodoPago).toUpperCase()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingComprobanteTx(null)}
                aria-label="Cerrar auditoría de comprobante"
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cross-Referenced Transaction Details Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-2xl bg-secondary/30 border border-border text-xs">
              <div>
                <span className="text-[11px] text-muted-foreground uppercase font-bold">Monto Declarado</span>
                <p className="font-mono font-bold text-foreground mt-0.5">
                  {viewingComprobanteTx.montoOriginal} {viewingComprobanteTx.monedaOriginal}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground uppercase font-bold">Equivalente USD</span>
                <p className="font-mono font-bold text-primary mt-0.5">
                  +${viewingComprobanteTx.montoEquivalenteUsd}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground uppercase font-bold">Referencia</span>
                <p className="font-mono font-bold text-foreground mt-0.5">
                  {viewingComprobanteTx.referenciaBancaria || 'Sin referencia'}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground uppercase font-bold">Fecha Operación</span>
                <p className="font-medium text-foreground mt-0.5">
                  {formatFechaCalendario(viewingComprobanteTx.fechaOperacion) ??
                    viewingComprobanteTx.fechaOperacion}
                </p>
              </div>
            </div>

            {/* High-Resolution Receipt Image Frame */}
            <div className="flex-1 overflow-auto rounded-2xl border border-border bg-black/50 flex flex-col items-center justify-center p-3 relative min-h-[280px]">
              {viewingComprobanteTx.comprobanteUrl && !comprobanteImgError ? (
                <img
                  src={viewingComprobanteTx.comprobanteUrl}
                  alt="Comprobante Bancario"
                  className="max-h-[48vh] max-w-full rounded-xl object-contain shadow-lg"
                  onError={() => setComprobanteImgError(true)}
                />
              ) : isDemoMode && !viewingComprobanteTx.comprobanteUrl ? (
                // N2: la foto stock SOLO vive en modo demo explícito.
                <img
                  src={COMPROBANTE_DEMO_URL}
                  alt="Comprobante Bancario (demostración)"
                  className="max-h-[48vh] max-w-full rounded-xl object-contain shadow-lg opacity-80"
                />
              ) : (
                // N2: en sesión real nunca se muestra una imagen ajena como si fuera el comprobante.
                <div className="text-center space-y-2 px-6">
                  <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/60" />
                  <p className="text-sm font-bold text-foreground">
                    {viewingComprobanteTx.comprobanteUrl
                      ? 'No se pudo cargar la imagen del comprobante'
                      : 'Sin comprobante disponible'}
                  </p>
                  <p className="text-[11px] text-muted-foreground max-w-sm">
                    {viewingComprobanteTx.comprobanteUrl
                      ? 'El enlace temporal de lectura falló o expiró. Cierra el visor e inténtalo de nuevo.'
                      : 'El servidor no generó una URL de lectura para este pago (por ejemplo, almacenamiento R2 no configurado).'}
                  </p>
                </div>
              )}
              {viewingComprobanteTx.comprobanteUrl && (
                <a
                  href={viewingComprobanteTx.comprobanteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute top-4 right-2 p-2 rounded-xl bg-background/80 hover:bg-background text-foreground text-xs font-bold backdrop-blur-md shadow-md flex items-center gap-1.5 transition-all"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Abrir original</span>
                </a>
              )}
            </div>

            {/* Direct Action Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-border/80">
              <span className="text-[11px] text-muted-foreground">
                {viewingComprobanteTx.comprobanteUrl
                  ? 'Presigned URL segura temporal de lectura (TTL 15 min, ADR-007)'
                  : 'Sin captura digital verificable para este pago'}
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => {
                    const tx = viewingComprobanteTx;
                    setViewingComprobanteTx(null);
                    setRejectingTx(tx);
                  }}
                  className="flex-1 sm:flex-initial py-2 px-4 rounded-xl border border-destructive/40 text-destructive hover:bg-destructive/10 font-bold text-xs transition-colors cursor-pointer"
                >
                  Rechazar Pago
                </button>
                <button
                  onClick={() => {
                    handleAprobar(viewingComprobanteTx.id);
                    setViewingComprobanteTx(null);
                  }}
                  className="flex-1 sm:flex-initial py-2 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                >
                  Aprobar y Descontar Saldo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
