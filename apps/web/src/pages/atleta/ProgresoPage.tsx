import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { apiClient, resolverUrlApi } from '../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../lib/acceso-alumno';
import { BloqueoAlumnoPanel } from '../../components/common/BloqueoAlumnoPanel';
import { AvisoDatosOffline } from '../../components/common/AvisoDatosOffline';
import { construirPayloadCheckinAntropometrico, obtenerUltimaMedicionReal } from '../../lib/antropometria-checkin';
import { formatFechaCalendario } from '../../lib/date-format';
import { crearEvolucionDemo } from '../../lib/demo-evolucion';
import { etiquetaAngulo } from '../../lib/comparador-fotos';
import {
  etiquetaEstadoMedicion,
  etiquetaOrigenAntropometria,
} from '../../lib/etiquetas-dominio';
import type { TonoSemaforo } from '../../lib/adherencia';
import { GraficoEvolucion } from '../../components/common/GraficoEvolucion';
import { VisorFoto } from '../../components/common/VisorFoto';
import {
  EvolucionCorporalDTO,
  ControlAntropometricoDetalleDTO,
  FotoAntropometriaDetalleDTO,
} from '@guachafit/shared';
import {
  TrendingUp,
  Camera,
  Scale,
  Calendar,
  Sparkles,
  CheckCircle2,
  Lock,
  Plus,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  ArrowUpRight,
  AlertTriangle,
  Upload,
  Eye,
  Images,
  ImageOff,
} from 'lucide-react';

/** Clases del badge de estado del control antropométrico por tono semántico (DESIGN.md). */
const CLASES_BADGE_ESTADO_MEDICION: Record<TonoSemaforo, string> = {
  success: 'bg-success/15 text-success border-success/20',
  warning: 'bg-warning/15 text-warning border-warning/20',
  danger: 'bg-destructive/15 text-destructive border-destructive/20',
  info: 'bg-info/15 text-info border-info/20',
  neutral: 'bg-secondary text-muted-foreground border-border',
};

export function ProgresoPage() {
  const { user, isDemoMode } = useAuth();
  const [evolucion, setEvolucion] = useState<EvolucionCorporalDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // D2: fallo de carga honesto (sin evolución demo fuera del modo demo).
  const [error, setError] = useState<string | null>(null);
  // D5: fallo de envío visible; el check-in no se declara exitoso si el server no lo aceptó.
  const [submitError, setSubmitError] = useState<string | null>(null);
  // RF-012: alumno pausado no puede enviar el check-in remoto; el panel informativo lo declara.
  const [bloqueo, setBloqueo] = useState<BloqueoAlumno | null>(null);
  // RF-004: visor accesible de una foto de progreso (Escape y trampa de foco en `VisorFoto`).
  const [fotoVisor, setFotoVisor] = useState<{
    foto: FotoAntropometriaDetalleDTO;
    fecha: string;
  } | null>(null);
  // Miniaturas cuyo enlace temporal falló: se rotulan en vez de dejar una imagen rota.
  const [fotosConError, setFotosConError] = useState<string[]>([]);

  // U4: URL del GET de evolución, para datar la copia cacheada cuando no hay conexión.
  const urlEvolucion = user?.id ? resolverUrlApi(`/antropometria/evolucion/${user.id}`) : null;

  // Progressive Disclosure: 'hub' (selector) | 'nuevo' | 'evolucion'
  const [vistaActiva, setVistaActiva] = useState<'hub' | 'nuevo' | 'evolucion'>('hub');

  // Form for remote athlete check-in.
  // D6: en sesión real los campos arrancan VACÍOS (los fixtures solo viven tras isDemoMode);
  // al abrir el formulario se precargan con la última medición real de la evolución cargada.
  const [pesoKg, setPesoKg] = useState(() => (isDemoMode ? '74.50' : ''));
  const [porcentajeGrasa, setPorcentajeGrasa] = useState(() => (isDemoMode ? '14.80' : ''));
  const [cinturaCm, setCinturaCm] = useState(() => (isDemoMode ? '81.00' : ''));
  const [brazoCm, setBrazoCm] = useState(() => (isDemoMode ? '37.50' : ''));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  /**
   * Abre el formulario de check-in. En sesión real precarga la última medición real disponible
   * (sin pisar lo que el alumno ya haya escrito); sin evolución, los campos quedan vacíos.
   */
  const abrirFormularioCheckin = () => {
    if (!isDemoMode) {
      const ultima = obtenerUltimaMedicionReal(evolucion);
      if (ultima) {
        setPesoKg((prev) => prev || ultima.pesoKg);
        setPorcentajeGrasa((prev) => prev || ultima.porcentajeGrasa);
        setCinturaCm((prev) => prev || ultima.cinturaCm);
        setBrazoCm((prev) => prev || ultima.brazoCm);
      }
    }
    setVistaActiva('nuevo');
  };

  const cargarEvolucion = async () => {
    setIsLoading(true);
    setError(null);
    // Al recargar la serie se obtienen enlaces presignados nuevos: las miniaturas que habían
    // fallado vuelven a intentar (no quedan marcadas "Sin imagen" para siempre).
    setFotosConError([]);

    // MODO DEMO EXPLÍCITO (isDemoMode): evolución de ejemplo solo con la bandera activa.
    if (isDemoMode) {
      setEvolucion(crearEvolucionDemo(user?.id || 'demo-alumno'));
      setIsLoading(false);
      return;
    }

    try {
      if (!user?.id) {
        setEvolucion(null);
        return;
      }
      const data = await apiClient<EvolucionCorporalDTO>(`/antropometria/evolucion/${user.id}`);
      setEvolucion(data);
    } catch (err: any) {
      // D2: sin evolución demo en sesión real; error visible con reintento.
      setEvolucion(null);
      setError(
        err?.message || 'No se pudo cargar tu evolución corporal. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarEvolucion();
  }, [user, isDemoMode]);

  const handleSubmitCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      setSubmitError('No se pudo identificar tu sesión. Vuelve a iniciar sesión e inténtalo de nuevo.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Endpoint real (POST /antropometria/checkin, rol ALUMNO): exige `alumnoId` (usuarioId)
      // y `fechaEvaluacion` (YYYY-MM-DD local). El helper valida contra el contrato compartido
      // para que un valor fuera de rango nunca se traduzca en un 400 opaco del servidor.
      const payload = construirPayloadCheckinAntropometrico(user.id, {
        pesoKg,
        porcentajeGrasa,
        cinturaCm,
        brazoCm,
      });
      await apiClient<ControlAntropometricoDetalleDTO>('/antropometria/checkin', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Refresco real (sin tirar el estado de éxito): el check-in remoto queda PENDIENTE de
      // aprobación, así que la curva de evolución puede no cambiar todavía; se re-consulta
      // igualmente para no mostrar datos obsoletos si el coach ya aprobó otros controles.
      const evolucionActualizada = await apiClient<EvolucionCorporalDTO>(
        `/antropometria/evolucion/${user.id}`
      ).catch(() => null);
      if (evolucionActualizada) setEvolucion(evolucionActualizada);

      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false);
        setVistaActiva('evolucion');
      }, 1800);
    } catch (err: any) {
      // RF-012: bloqueo de ciclo de vida (pausado) → panel informativo; el historial sigue visible.
      const bloqueoDetectado = resolverBloqueoAlumno(err);
      if (bloqueoDetectado) {
        setBloqueo(bloqueoDetectado);
        setSubmitError(null);
        return;
      }
      // D5: sin éxito falso; el check-in solo queda enviado si el servidor lo aceptó (2xx).
      setSubmitError(
        err?.message || 'No se pudo enviar tu check-in. Revisa los datos e inténtalo de nuevo.'
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
      {/* Cabecera Principal */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
            <Scale className="h-3.5 w-3.5" />
            <span>Fisiología y Métricas</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-0.5">
            Mi Progreso Físico
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Registro de medidas corporales y evolución física a lo largo del tiempo.
          </p>
        </div>
      </div>

      {/* U4: evolución servida desde la caché del SW (sin conexión), con su antigüedad. */}
      {!isDemoMode && evolucion && <AvisoDatosOffline url={urlEvolucion} />}

      {/* D2: error de carga honesto con reintento (sin evolución demo fuera del modo demo) */}
      {error && (
        <div className="p-5 rounded-3xl bg-card border border-destructive/30 text-center space-y-3">
          <AlertTriangle className="h-7 w-7 text-destructive mx-auto" />
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => cargarEvolucion()}
            className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* RF-012: aviso de bloqueo del check-in remoto (el historial sigue en modo lectura) */}
      {bloqueo && !isDemoMode && (
        <BloqueoAlumnoPanel
          bloqueo={bloqueo}
          onReintentar={() => setBloqueo(null)}
          className="max-w-none"
        />
      )}

      {/* ========================================================================= */}
      {/* VISTA 1: HUB PRINCIPAL (Selector de 2 Caminos)                             */}
      {/* ========================================================================= */}
      {vistaActiva === 'hub' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* Tarjeta de Métricas Netas */}
          {evolucion && (
            <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-md space-y-3">
              <span className="text-xs font-bold text-primary uppercase tracking-wider block">
                Resumen de Evolución
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border">
                  <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Cambio de Peso
                  </span>
                  <p className="text-xl font-black font-mono text-success mt-0.5">
                    {evolucion.cambioNetoPesoKg} kg
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border">
                  <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Grasa Corporal
                  </span>
                  <p className="text-xl font-black font-mono text-success mt-0.5">
                    {evolucion.cambioNetoGrasaPorcentaje}%
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border col-span-2 sm:col-span-1">
                  <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Evaluaciones
                  </span>
                  <p className="text-xl font-black font-mono text-foreground mt-0.5">
                    {evolucion.totalEvaluaciones} aprobadas
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Selector de Acciones */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider px-1">
              Selecciona qué deseas hacer:
            </h2>

            {/* Opción A: Actualizar Medidas */}
            <div
              onClick={abrirFormularioCheckin}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && abrirFormularioCheckin()}
              className="group p-5 rounded-3xl bg-gradient-to-br from-card to-info/10 border-2 border-info/30 hover:border-info/70 transition-all duration-200 cursor-pointer shadow-md hover:shadow-info/5 active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3.5 rounded-2xl bg-info text-info-foreground shadow-md shadow-info/20">
                    <Camera className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground group-hover:text-info transition-colors flex items-center gap-1.5">
                      Actualizar mis medidas y fotos
                      <ArrowUpRight className="h-4 w-4 text-info opacity-80" />
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                      Registra tu peso actual, perímetros de cintura o brazo y envía tu check-in al coach.
                    </p>
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-secondary/80 text-foreground group-hover:text-info group-hover:bg-info/15 transition-colors">
                  <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>

            {/* Opción B: Ver Evolución e Historial */}
            <div
              onClick={() => setVistaActiva('evolucion')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setVistaActiva('evolucion')}
              className="group p-5 rounded-3xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer shadow-xs active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3.5 rounded-2xl bg-secondary text-foreground">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                      Ver mi antes y después
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                      Consulta tu registro cronológico de mediciones corporales y evolución en el tiempo.
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
      {/* VISTA 2: FORMULARIO DE CHECK-IN ENFOCADO                                    */}
      {/* ========================================================================= */}
      {vistaActiva === 'nuevo' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-border/80 pb-3">
            <button
              onClick={() => setVistaActiva('hub')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Volver a opciones de progreso</span>
            </button>
            <span className="text-xs font-semibold text-muted-foreground">Registro de Check-in</span>
          </div>

          <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-md space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Registro de Medición Corporal</h2>
              <p className="text-xs text-muted-foreground">
                Tus datos quedarán guardados y asociados a tu historial de evolución.
              </p>
            </div>

            {submitSuccess ? (
              <div className="p-8 text-center space-y-3">
                <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
                <h4 className="font-bold text-base text-foreground">¡Mediciones Guardadas!</h4>
                <p className="text-xs text-muted-foreground">
                  Tus datos fueron enviados a tu entrenador para auditoría y validación.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitCheckin} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Peso (kg)</label>
                    <input
                      type="text"
                      required
                      value={pesoKg}
                      onChange={(e) => setPesoKg(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">
                      % Grasa Estimado
                    </label>
                    <input
                      type="text"
                      value={porcentajeGrasa}
                      onChange={(e) => setPorcentajeGrasa(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Perímetro Cintura (cm)
                    </label>
                    <input
                      type="text"
                      value={cinturaCm}
                      onChange={(e) => setCinturaCm(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Perímetro Brazo (cm)
                    </label>
                    <input
                      type="text"
                      value={brazoCm}
                      onChange={(e) => setBrazoCm(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border/80 text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <Lock className="h-3.5 w-3.5 text-primary" />
                    <span>Revisión de tu coach</span>
                  </div>
                  <p className="text-[11px]">
                    Si eres alumno online, tu reporte queda registrado como remoto y tu coach lo revisa en su bandeja. Si eres presencial, se consolida en sala.
                  </p>
                </div>

                {submitError && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm tracking-wide shadow-md shadow-primary/20 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                >
                  <span>{isSubmitting ? 'Enviando...' : 'Enviar Evaluación al Coach'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 3: HISTORIAL Y EVOLUCIÓN CRONOLÓGICA                                */}
      {/* ========================================================================= */}
      {vistaActiva === 'evolucion' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-border/80 pb-3">
            <button
              onClick={() => setVistaActiva('hub')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Volver a opciones de progreso</span>
            </button>
            <button
              onClick={abrirFormularioCheckin}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nuevo Check-in</span>
            </button>
          </div>

          {/* RF-004 RN-01: gráfico multieje con filtros de rango sobre la serie real. */}
          {evolucion && evolucion.evaluaciones.length > 0 && (
            <GraficoEvolucion evaluaciones={evolucion.evaluaciones} />
          )}

          {/* RF-004 RN-02/RN-03: sin fotos adjuntas todavía, vacío honesto (no se simula galería). */}
          {evolucion &&
            evolucion.evaluaciones.length > 0 &&
            evolucion.evaluaciones.every((item) => item.fotos.length === 0) && (
              <div className="p-6 rounded-3xl bg-card border border-dashed border-border text-center space-y-2">
                <Images className="h-9 w-9 text-muted-foreground mx-auto opacity-40" />
                <p className="text-xs font-bold text-foreground">Aún no tienes fotos de progreso</p>
                <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                  Las fotos se adjuntan al registrar tu check-in (frontal, lateral o posterior) y
                  quedan privadas con enlaces temporales.
                </p>
              </div>
            )}

          <div className="space-y-3">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground px-1">
              Registro Histórico Cronológico
            </h3>

            {evolucion?.evaluaciones && evolucion.evaluaciones.length > 0 ? (
              evolucion.evaluaciones.map((item) => {
                const estadoMedicion = etiquetaEstadoMedicion(item.estado);
                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-border/50 pb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary" />
                        <span className="font-bold text-sm text-foreground">
                          {formatFechaCalendario(item.fechaEvaluacion) ?? item.fechaEvaluacion}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full border uppercase ${CLASES_BADGE_ESTADO_MEDICION[estadoMedicion.tono]}`}
                        >
                          {estadoMedicion.texto}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {etiquetaOrigenAntropometria(item.origen)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-2.5 rounded-xl bg-secondary/30">
                        <span className="text-[11px] text-muted-foreground uppercase font-semibold">
                          Peso
                        </span>
                        <p className="font-mono font-bold text-sm text-foreground">
                          {item.pesoKg} kg
                        </p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-secondary/30">
                        <span className="text-[11px] text-muted-foreground uppercase font-semibold">
                          % Grasa
                        </span>
                        <p className="font-mono font-bold text-sm text-foreground">
                          {item.porcentajeGrasa ? `${item.porcentajeGrasa}%` : '—'}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-secondary/30">
                        <span className="text-[11px] text-muted-foreground uppercase font-semibold">
                          Cintura
                        </span>
                        <p className="font-mono font-bold text-sm text-foreground">
                          {item.perimetros?.cinturaCm ? `${item.perimetros.cinturaCm} cm` : '—'}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-secondary/30">
                        <span className="text-[11px] text-muted-foreground uppercase font-semibold">
                          Brazo
                        </span>
                        <p className="font-mono font-bold text-sm text-foreground">
                          {item.perimetros?.brazoCm ? `${item.perimetros.brazoCm} cm` : '—'}
                        </p>
                      </div>
                    </div>

                    {/* RF-004 RN-02/RN-03: fotos propias de la toma, con visor accesible. */}
                    {item.fotos.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Fotos de esta toma
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {item.fotos.map((foto) => {
                            const fallo = fotosConError.includes(foto.id);
                            const fechaCorta =
                              formatFechaCalendario(item.fechaEvaluacion) ?? item.fechaEvaluacion;
                            return (
                              <button
                                key={foto.id}
                                type="button"
                                onClick={() =>
                                  setFotoVisor({ foto, fecha: item.fechaEvaluacion })
                                }
                                aria-label={`Ver foto ${etiquetaAngulo(foto.angulo)} del ${fechaCorta}`}
                                className="relative w-20 sm:w-24 aspect-3/4 rounded-2xl overflow-hidden border border-border bg-secondary/40 hover:border-primary/60 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                              >
                                {foto.presignedGetUrl && !fallo ? (
                                  <img
                                    src={foto.presignedGetUrl}
                                    alt=""
                                    loading="lazy"
                                    onError={() =>
                                      setFotosConError((prev) =>
                                        prev.includes(foto.id) ? prev : [...prev, foto.id]
                                      )
                                    }
                                    className="absolute inset-0 h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                                    <ImageOff className="h-4 w-4" />
                                    <span className="text-[11px] font-semibold">Sin imagen</span>
                                  </span>
                                )}
                                <span className="absolute bottom-0 inset-x-0 bg-background/80 backdrop-blur px-1.5 py-1 text-[11px] font-bold text-foreground flex items-center justify-center gap-1">
                                  <Eye className="h-3 w-3" />
                                  {etiquetaAngulo(foto.angulo)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No hay evaluaciones registradas aún.
              </p>
            )}
          </div>
        </div>
      )}

      {/* RF-004: visor de foto de progreso (solo montado con una foto elegida). */}
      {fotoVisor && (
        <VisorFoto
          foto={fotoVisor.foto}
          fecha={fotoVisor.fecha}
          onCerrar={() => setFotoVisor(null)}
        />
      )}
    </div>
  );
}
