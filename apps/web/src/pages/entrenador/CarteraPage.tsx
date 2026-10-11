import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient, generateIdempotencyKey } from '../../lib/api-client';
import { construirPayloadCobroSala } from '../../lib/cobro-sala';
import { mensajeConExcedente } from '../../lib/saldo-a-favor';
import { esErrorSinPlanAsignado } from '../../lib/suscripcion-alumno';
import { useAuth } from '../../context/auth-context';
import { useValorDebounced } from '../../lib/use-valor-debounced';
import { usePaginacionServidor } from '../../lib/use-paginacion-servidor';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { useTabsAccesibles } from '../../lib/use-tabs-accesibles';
import { Paginacion } from '../../components/common/Paginacion';
import { MetricCard } from '../../components/common/MetricCard';
import { TablaCartera } from '../../components/entrenador/TablaCartera';
import { crearCarteraDemo } from '../../lib/demo-cartera';
import { pluralizar } from '../../lib/pluralizar';
import { fechaCalendarioLocal, formatFechaHoraLocal } from '../../lib/date-format';
import {
  PESTANAS_CARTERA,
  contadorPestana,
  hayTasaProyectable,
  normalizarPestana,
  tonoResultadoRecordatorio,
} from '../../lib/cartera';
import {
  Moneda,
  type CarteraDTO,
  type FilaCarteraDTO,
  type PestanaCarteraDTO,
  type RecordatorioManualResultadoDTO,
} from '@guachafit/shared';
import {
  AlertCircle,
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  DollarSign,
  HandCoins,
  Info,
  Receipt,
  Search,
  Wallet,
  X,
} from 'lucide-react';

interface EstadoCobro {
  fila: FilaCarteraDTO;
  monto: string;
  moneda: Moneda;
  fechaOperacion: string;
  /**
   * M5-L1B (RNF-002): clave de idempotencia del cobro de este alumno. Se conserva hasta un cobro
   * confirmado (también si se cierra y reabre el modal), así un reintento tras una respuesta
   * perdida no cobra dos veces.
   */
  claveIdempotencia: string;
}

export function CarteraPage() {
  const { isDemoMode } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pestana, setPestana] = useState<PestanaCarteraDTO>(() =>
    normalizarPestana(searchParams.get('pestana'))
  );
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [busqueda, setBusqueda] = useState('');
  const q = useValorDebounced(busqueda);

  // Estado de sesión SOLO demo: cobros y recordatorios aplicados sobre el fixture local.
  const [cobradosDemo, setCobradosDemo] = useState<string[]>([]);
  const [recordatoriosDemo, setRecordatoriosDemo] = useState<Record<string, string>>({});

  // Recordatorio manual (RN-02)
  const [filaRecordatorio, setFilaRecordatorio] = useState<FilaCarteraDTO | null>(null);
  const [enviandoRecordatorio, setEnviandoRecordatorio] = useState(false);
  const [errorRecordatorio, setErrorRecordatorio] = useState<string | null>(null);
  const [resultadoRecordatorio, setResultadoRecordatorio] =
    useState<RecordatorioManualResultadoDTO | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Cobro directo en efectivo (RN-01)
  const [cobro, setCobro] = useState<EstadoCobro | null>(null);
  const [enviandoCobro, setEnviandoCobro] = useState(false);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);
  const [cobroSinPlan, setCobroSinPlan] = useState(false);
  /** Claves pendientes por alumno (`alumnoUsuarioId`); se borran al confirmar el cobro. */
  const clavesCobroPendientesRef = useRef(new Map<string, string>());
  const [exitoCobro, setExitoCobro] = useState<string | null>(null);

  const cargarPagina = useCallback(
    async ({
      pagina: paginaSolicitada,
      tamano: tamanoSolicitado,
      signal,
    }: {
      pagina: number;
      tamano: number;
      signal: AbortSignal;
    }): Promise<CarteraDTO> => {
      const offset = (paginaSolicitada - 1) * tamanoSolicitado;
      if (isDemoMode) {
        return crearCarteraDemo({
          pestana,
          q,
          limit: tamanoSolicitado,
          offset,
          cobrados: cobradosDemo,
          recordatorios: recordatoriosDemo,
        });
      }
      const parametros = new URLSearchParams({
        pestana,
        limit: String(tamanoSolicitado),
        offset: String(offset),
      });
      if (q.trim().length > 0) parametros.set('q', q.trim());
      return apiClient<CarteraDTO>(`/finanzas/cartera?${parametros.toString()}`, { signal });
    },
    [isDemoMode, pestana, q, cobradosDemo, recordatoriosDemo]
  );

  const paginacion = usePaginacionServidor<FilaCarteraDTO, CarteraDTO>({
    clave: [
      'cartera-coach',
      pestana,
      q.trim(),
      isDemoMode ? `demo-${cobradosDemo.length}-${Object.keys(recordatoriosDemo).length}` : 'real',
    ],
    pagina,
    tamano,
    cargar: cargarPagina,
    onAjustarPagina: setPagina,
  });

  const { items, total, cargando, error: errorConsulta, recargar, respuesta } = paginacion;
  const resumen = respuesta?.resumen ?? null;
  const isLoading = cargando && !respuesta;
  const error = errorConsulta?.message ?? null;
  const pestanaActiva = PESTANAS_CARTERA.find((p) => p.clave === pestana)!;

  // Cambiar pestaña, tamaño o búsqueda vuelve a la página 1.
  useEffect(() => {
    setPagina(1);
  }, [pestana, tamano, q]);

  const cambiarPestana = (nueva: PestanaCarteraDTO) => {
    setPestana(nueva);
    const parametros = new URLSearchParams(searchParams);
    parametros.set('pestana', nueva);
    setSearchParams(parametros, { replace: true });
  };

  const cerrarModalRecordatorio = () => {
    setFilaRecordatorio(null);
    setResultadoRecordatorio(null);
    setErrorRecordatorio(null);
    setCopiado(false);
  };

  // U3b: Escape, trampa de Tab, foco inicial y restore del foco al disparador (los dos modales
  // de la cartera compartían el overlay sin semántica de diálogo).
  const refModalRecordatorio = useDialogoAccesible({
    abierto: filaRecordatorio !== null,
    onCerrar: cerrarModalRecordatorio,
  });

  const handleEnviarRecordatorio = async () => {
    if (!filaRecordatorio) return;
    setEnviandoRecordatorio(true);
    setErrorRecordatorio(null);

    if (isDemoMode) {
      // La demo simula la MISMA regla anti-spam del servidor (cooldown de 6 h).
      const previo = recordatoriosDemo[filaRecordatorio.alumnoUsuarioId];
      if (previo) {
        setResultadoRecordatorio({
          enviado: false,
          motivo: 'cooldown_activo',
          mensaje: `Ya enviaste un recordatorio manual a ${filaRecordatorio.alumnoNombre} hace poco. Espera para no saturar al alumno (modo demo).`,
          mensajeSugerido: null,
          saldoPendienteUsd: filaRecordatorio.saldoPendienteUsd,
          saldoPendienteBs: null,
          ultimaGestionUtc: previo,
          proximoPermitidoUtc: null,
        });
      } else {
        const ahoraIso = new Date().toISOString();
        setRecordatoriosDemo((actuales) => ({
          ...actuales,
          [filaRecordatorio.alumnoUsuarioId]: ahoraIso,
        }));
        setResultadoRecordatorio({
          enviado: true,
          motivo: 'despachado',
          mensaje: `Recordatorio simulado para ${filaRecordatorio.alumnoNombre} (modo demo).`,
          mensajeSugerido: `Hola ${filaRecordatorio.alumnoNombre.split(' ')[0]}, tu mensualidad tiene un saldo pendiente de $${filaRecordatorio.saldoPendienteUsd} USD. Puedes reportar tu pago desde la app para mantener tu plan al día.`,
          saldoPendienteUsd: filaRecordatorio.saldoPendienteUsd,
          saldoPendienteBs: null,
          ultimaGestionUtc: ahoraIso,
          proximoPermitidoUtc: null,
        });
      }
      setEnviandoRecordatorio(false);
      return;
    }

    try {
      const resultado = await apiClient<RecordatorioManualResultadoDTO>(
        `/finanzas/cartera/clientes/${filaRecordatorio.alumnoUsuarioId}/recordatorio`,
        { method: 'POST' }
      );
      setResultadoRecordatorio(resultado);
      if (resultado.enviado) recargar();
    } catch (err: any) {
      setErrorRecordatorio(
        err?.message || 'No se pudo enviar el recordatorio. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setEnviandoRecordatorio(false);
    }
  };

  const copiarMensaje = async () => {
    if (!resultadoRecordatorio?.mensajeSugerido) return;
    try {
      await navigator.clipboard.writeText(resultadoRecordatorio.mensajeSugerido);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
      setErrorRecordatorio(
        'No se pudo copiar automáticamente. Selecciona el texto y cópialo manualmente.'
      );
    }
  };

  const claveCobroPendiente = (alumnoUsuarioId: string): string => {
    const pendientes = clavesCobroPendientesRef.current;
    const existente = pendientes.get(alumnoUsuarioId);
    if (existente) return existente;
    const nueva = generateIdempotencyKey();
    pendientes.set(alumnoUsuarioId, nueva);
    return nueva;
  };

  const abrirCobro = (fila: FilaCarteraDTO) => {
    setErrorCobro(null);
    setCobroSinPlan(false);
    setExitoCobro(null);
    setCobro({
      fila,
      monto: fila.saldoPendienteUsd ?? '',
      moneda: Moneda.USD,
      fechaOperacion: fechaCalendarioLocal(),
      claveIdempotencia: claveCobroPendiente(fila.alumnoUsuarioId),
    });
  };

  const refModalCobro = useDialogoAccesible({
    abierto: cobro !== null,
    onCerrar: () => setCobro(null),
  });

  // U3b: patrón APG de las pestañas de estado (roving tabindex, flechas, Home/End y enlace con
  // el `tabpanel` del contenido). El estado sigue viviendo en la URL (`?pestana=`).
  const tabsCartera = useTabsAccesibles<PestanaCarteraDTO>({
    claves: PESTANAS_CARTERA.map((item) => item.clave),
    activa: pestana,
    onActivar: cambiarPestana,
    idBase: 'cartera-estados',
  });

  const handleRegistrarCobro = async () => {
    if (!cobro) return;
    const monto = Number(cobro.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      setErrorCobro('El monto debe ser mayor a 0.00.');
      return;
    }
    setEnviandoCobro(true);
    setErrorCobro(null);
    setCobroSinPlan(false);

    if (isDemoMode) {
      setCobradosDemo((actuales) =>
        actuales.includes(cobro.fila.alumnoUsuarioId)
          ? actuales
          : [...actuales, cobro.fila.alumnoUsuarioId]
      );
      setExitoCobro(
        `Cobro de $${cobro.monto} registrado para ${cobro.fila.alumnoNombre} (modo demo). El saldo se actualizó.`
      );
      setEnviandoCobro(false);
      return;
    }

    try {
      const respuesta = await apiClient<{ transaccion?: { excedenteUsd?: string } } | null>(
        `/finanzas/clientes/${cobro.fila.alumnoUsuarioId}/cobro-directo-inteligente`,
        {
          method: 'POST',
          body: JSON.stringify(
            construirPayloadCobroSala({
              monto: cobro.monto,
              moneda: cobro.moneda,
              hoyLocal: cobro.fechaOperacion,
            })
          ),
          idempotencyKey: cobro.claveIdempotencia,
        }
      );
      // Cobro confirmado: el próximo cobro de este alumno usará una clave nueva. El mensaje no
      // repite el monto del formulario: un reintento idempotente devuelve el cobro original.
      clavesCobroPendientesRef.current.delete(cobro.fila.alumnoUsuarioId);
      // RF-006 RN-05: si el cobro excedió la deuda, el API dice cuánto quedó a favor.
      setExitoCobro(
        mensajeConExcedente(
          `Cobro registrado y auto-aprobado para ${cobro.fila.alumnoNombre}. El saldo del alumno quedó actualizado.`,
          respuesta?.transaccion?.excedenteUsd
        )
      );
      recargar();
    } catch (err: any) {
      setCobroSinPlan(esErrorSinPlanAsignado(err));
      setErrorCobro(
        err?.message || 'No se pudo registrar el cobro. Revisa los datos e inténtalo de nuevo.'
      );
    } finally {
      setEnviandoCobro(false);
    }
  };

  const sinTasa = !hayTasaProyectable(resumen);
  const telefonoWhatsApp = filaRecordatorio?.telefonoWhatsapp?.replace(/[^0-9]/g, '') ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          <Wallet className="h-4 w-4" />
          <span>Cobranza y Cartera</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Control de Cobros
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Quién te debe, quién está por vencer y a quién ya le recordaste. Todo en un lugar.
            </p>
          </div>
          <Link
            to="/coach/conciliacion"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs transition-colors"
          >
            <Receipt className="h-4 w-4 text-primary" />
            <span>Bandeja de validación</span>
          </Link>
        </div>
      </div>

      {/* KPIs del RF-009 (cartera completa, no la página) */}
      {resumen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard
            title="Recaudado del Mes"
            value={`$${resumen.recaudadoMesUsd}`}
            subtitle="Pagos aprobados del mes en curso"
            icon={DollarSign}
            badge={{ text: 'USD', variant: 'success' }}
          />
          <MetricCard
            title="Total en Mora"
            value={`$${resumen.totalEnMoraUsd}`}
            subtitle={`${pluralizar(
              resumen.alumnosEnMora,
              'alumno con cuota vencida',
              'alumnos con cuotas vencidas'
            )}`}
            icon={AlertTriangle}
            badge={{
              text: resumen.alumnosEnMora > 0 ? 'Cobrar' : 'Al día',
              variant: resumen.alumnosEnMora > 0 ? 'warning' : 'success',
            }}
          />
          <MetricCard
            title="Próximos a Vencer"
            value={resumen.proximosAVencer}
            subtitle={`$${resumen.totalPorVencerUsd} USD vencen en los próximos 5 días`}
            icon={CalendarClock}
            badge={{
              text: '≤ 5 días',
              variant: resumen.proximosAVencer > 0 ? 'warning' : 'success',
            }}
          />
          <Link to="/coach/conciliacion" className="block">
            <MetricCard
              title="Pagos por Validar"
              value={resumen.pagosPorValidar}
              subtitle="Comprobantes esperando tu confirmación"
              icon={Receipt}
              badge={{ text: 'Ir a la bandeja', variant: 'info' }}
            />
          </Link>
        </div>
      )}

      {/* Error honesto con reintento */}
      {!isLoading && error && (
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
      )}

      {!error && (
        <>
          {/* Pestañas del RF-009 con contadores reales */}
          <div className="space-y-2">
            <div
              {...tabsCartera.propsTablist}
              className="flex flex-wrap gap-2"
              aria-label="Estados de cartera"
            >
              {PESTANAS_CARTERA.map((pestanaItem) => {
                const activa = pestanaItem.clave === pestana;
                return (
                  <button
                    key={pestanaItem.clave}
                    type="button"
                    {...tabsCartera.propsTab(pestanaItem.clave)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      activa
                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                        : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/70'
                    }`}
                  >
                    <span>{pestanaItem.etiqueta}</span>
                    <span
                      className={`min-w-[1.5rem] text-center px-1.5 py-0.5 rounded-full text-[11px] font-bold ${
                        activa
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : 'bg-background/60 text-foreground border border-border/60'
                      }`}
                    >
                      {contadorPestana(resumen, pestanaItem.clave)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">{pestanaActiva.criterio}</p>
          </div>

          {/* U3b: el contenido de la pestaña activa es el `tabpanel` enlazado por `aria-controls`. */}
          <div {...tabsCartera.propsPanel(pestana)} className="space-y-6">
          {/* Búsqueda server-side + estado de la página */}
          <div className="p-4 rounded-3xl bg-card border border-border/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative flex-1 sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(evento) => setBusqueda(evento.target.value)}
                  placeholder="Buscar alumno por nombre..."
                  aria-label="Buscar alumno por nombre"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-background border border-border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary transition-colors"
                />
              </div>
              <p className="text-[11px] text-muted-foreground font-mono sm:ml-auto">
                {isLoading
                  ? 'Cargando cartera...'
                  : `Mostrando ${items.length} de ${pluralizar(total, 'registro', 'registros')} en ${pestanaActiva.etiqueta}`}
              </p>
            </div>

            {sinTasa && (
              <div className="flex items-start gap-2 p-3 rounded-2xl bg-secondary/40 border border-border/60">
                <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    Sin tasa de cambio configurada: la columna en bolívares se muestra como «—»
                    para no inventar montos.
                  </p>
                  {/* U2 (Ola 4): destino real como botón táctil (≥44px), no un enlace de 15px */}
                  <Link
                    to="/coach/ajustes?tab=tasas"
                    className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-primary/25 bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/20 transition-colors focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    Ajustes → Tasas
                  </Link>
                </div>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="p-10 rounded-3xl bg-card border border-border text-center space-y-3">
              <div className="animate-pulse space-y-3">
                <div className="h-4 w-40 bg-secondary rounded mx-auto" />
                <div className="h-3 w-64 bg-secondary/70 rounded mx-auto" />
              </div>
              <p className="text-xs text-muted-foreground">Cargando cartera de alumnos...</p>
            </div>
          ) : (
            <div className="space-y-4">
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

              <TablaCartera
                pestana={pestana}
                filas={items}
                buscando={q.trim().length > 0}
                onRecordatorio={(fila) => {
                  setErrorRecordatorio(null);
                  setResultadoRecordatorio(null);
                  setFilaRecordatorio(fila);
                }}
                onCobrar={abrirCobro}
                onVerFicha={(fila) => {
                  if (fila.alumnoPerfilId) {
                    navigate(`/coach/alumnos/${fila.alumnoPerfilId}`);
                  }
                }}
                onRevisarPago={() => navigate('/coach/conciliacion')}
              />
            </div>
          )}
          </div>
        </>
      )}

      {/* Modal de recordatorio manual (RN-02) */}
      {filaRecordatorio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div
            ref={refModalRecordatorio}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cartera-recordatorio-titulo"
            tabIndex={-1}
            className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-lg space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <BellRing className="h-5 w-5 text-primary" />
                <h3
                  id="cartera-recordatorio-titulo"
                  className="font-bold text-base text-foreground"
                >
                  Enviar recordatorio manual
                </h3>
              </div>
              <button
                type="button"
                onClick={cerrarModalRecordatorio}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">{filaRecordatorio.alumnoNombre}</p>
              <p className="text-xs text-muted-foreground">
                Saldo pendiente:{' '}
                <span className="font-mono font-bold text-foreground">
                  ${filaRecordatorio.saldoPendienteUsd} USD
                </span>
                {filaRecordatorio.saldoPendienteBs && (
                  <span className="font-mono text-muted-foreground">
                    {' '}
                    · Bs. {filaRecordatorio.saldoPendienteBs}
                  </span>
                )}
              </p>
              {filaRecordatorio.ultimaGestionUtc && !resultadoRecordatorio && (
                <p className="text-[11px] text-muted-foreground">
                  Último recordatorio manual: {formatFechaHoraLocal(filaRecordatorio.ultimaGestionUtc)}
                </p>
              )}
            </div>

            {errorRecordatorio && (
              <div
                role="alert"
                className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorRecordatorio}</span>
              </div>
            )}

            {resultadoRecordatorio && (
              <div
                className={`p-3 rounded-2xl border text-xs font-bold flex items-start gap-2 ${
                  tonoResultadoRecordatorio(resultadoRecordatorio) === 'success'
                    ? 'bg-success/15 border-success/30 text-success'
                    : tonoResultadoRecordatorio(resultadoRecordatorio) === 'warning'
                    ? 'bg-warning/15 border-warning/30 text-warning'
                    : 'bg-secondary/60 border-border text-muted-foreground'
                }`}
              >
                {tonoResultadoRecordatorio(resultadoRecordatorio) === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <span>{resultadoRecordatorio.mensaje}</span>
              </div>
            )}

            {resultadoRecordatorio?.mensajeSugerido && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground" htmlFor="mensaje-recordatorio">
                  Mensaje enviado (puedes copiarlo o abrir WhatsApp)
                </label>
                <textarea
                  id="mensaje-recordatorio"
                  readOnly
                  rows={3}
                  value={resultadoRecordatorio.mensajeSugerido}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground resize-none"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={copiarMensaje}
                    className="py-2 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs cursor-pointer"
                  >
                    {copiado ? 'Copiado ✓' : 'Copiar mensaje'}
                  </button>
                  {telefonoWhatsApp && (
                    <a
                      href={`https://wa.me/${telefonoWhatsApp}?text=${encodeURIComponent(
                        resultadoRecordatorio.mensajeSugerido
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 px-4 rounded-xl bg-success/15 border border-success/30 text-success font-bold text-xs hover:bg-success/25 transition-colors"
                    >
                      Abrir WhatsApp
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={cerrarModalRecordatorio}
                className="flex-1 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 font-bold text-xs text-foreground cursor-pointer"
              >
                {resultadoRecordatorio ? 'Cerrar' : 'Cancelar'}
              </button>
              {!resultadoRecordatorio && (
                <button
                  type="button"
                  onClick={handleEnviarRecordatorio}
                  disabled={enviandoRecordatorio}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {enviandoRecordatorio ? 'Enviando...' : 'Enviar recordatorio'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de cobro directo en efectivo (RN-01) */}
      {cobro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div
            ref={refModalCobro}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cartera-cobro-titulo"
            tabIndex={-1}
            className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-md space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <HandCoins className="h-5 w-5 text-primary" />
                <h3 id="cartera-cobro-titulo" className="font-bold text-base text-foreground">
                  Registrar cobro en efectivo
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCobro(null)}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">{cobro.fila.alumnoNombre}</p>
              <p className="text-xs text-muted-foreground">
                Saldo pendiente actual:{' '}
                <span className="font-mono font-bold text-foreground">
                  ${cobro.fila.saldoPendienteUsd} USD
                </span>
              </p>
            </div>

            {errorCobro && (
              <div
                role="alert"
                className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorCobro}</span>
                {cobroSinPlan && cobro.fila.alumnoPerfilId && (
                  <Link
                    to={`/coach/alumnos/${cobro.fila.alumnoPerfilId}?tab=resumen`}
                    className="ml-auto shrink-0 underline hover:no-underline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    Asignar plan
                  </Link>
                )}
              </div>
            )}

            {exitoCobro ? (
              <div className="p-3 rounded-2xl bg-success/15 border border-success/30 text-success text-xs font-bold flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{exitoCobro}</span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground" htmlFor="cobro-monto">
                      Monto
                    </label>
                    <input
                      id="cobro-monto"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={cobro.monto}
                      onChange={(evento) =>
                        setCobro((actual) => (actual ? { ...actual, monto: evento.target.value } : actual))
                      }
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground" htmlFor="cobro-moneda">
                      Moneda
                    </label>
                    <select
                      id="cobro-moneda"
                      value={cobro.moneda}
                      onChange={(evento) =>
                        setCobro((actual) =>
                          actual ? { ...actual, moneda: evento.target.value as Moneda } : actual
                        )
                      }
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                    >
                      <option value="USD">USD (efectivo)</option>
                      <option value="VES" disabled={sinTasa}>
                        Bs. (efectivo){sinTasa ? ' — configura tu tasa' : ''}
                      </option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground" htmlFor="cobro-fecha">
                    Fecha de la operación
                  </label>
                  <input
                    id="cobro-fecha"
                    type="date"
                    value={cobro.fechaOperacion}
                    onChange={(evento) =>
                      setCobro((actual) =>
                        actual ? { ...actual, fechaOperacion: evento.target.value } : actual
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <p className="text-[11px] text-muted-foreground">
                  El cobro se registra y auto-aprueba con{' '}
                  <span className="font-bold text-foreground">
                    registrado_por: tu usuario de coach
                  </span>
                  . El saldo del alumno se descuenta de inmediato.
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCobro(null)}
                className="flex-1 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 font-bold text-xs text-foreground cursor-pointer"
              >
                {exitoCobro ? 'Cerrar' : 'Cancelar'}
              </button>
              {!exitoCobro && (
                <button
                  type="button"
                  onClick={handleRegistrarCobro}
                  disabled={enviandoCobro || !cobro.monto}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {enviandoCobro ? 'Registrando...' : 'Registrar cobro'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
