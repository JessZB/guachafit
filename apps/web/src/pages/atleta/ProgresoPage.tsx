import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { apiClient } from '../../lib/api-client';
import { construirPayloadCheckinAntropometrico } from '../../lib/antropometria-checkin';
import {
  EvolucionCorporalDTO,
  ControlAntropometricoDetalleDTO,
  AnguloFoto,
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
} from 'lucide-react';

export function ProgresoPage() {
  const { user, isDemoMode } = useAuth();
  const [evolucion, setEvolucion] = useState<EvolucionCorporalDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // D2: fallo de carga honesto (sin evolución demo fuera del modo demo).
  const [error, setError] = useState<string | null>(null);
  // D5: fallo de envío visible; el check-in no se declara exitoso si el server no lo aceptó.
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Progressive Disclosure: 'hub' (selector) | 'nuevo' | 'evolucion'
  const [vistaActiva, setVistaActiva] = useState<'hub' | 'nuevo' | 'evolucion'>('hub');

  // Form for remote athlete check-in
  const [pesoKg, setPesoKg] = useState('74.50');
  const [porcentajeGrasa, setPorcentajeGrasa] = useState('14.80');
  const [cinturaCm, setCinturaCm] = useState('81.00');
  const [brazoCm, setBrazoCm] = useState('37.50');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const cargarEvolucion = async () => {
    setIsLoading(true);
    setError(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): evolución de ejemplo solo con la bandera activa.
    if (isDemoMode) {
      const demoEvolucion: EvolucionCorporalDTO = {
        alumnoId: user?.id || 'demo-alumno',
        totalEvaluaciones: 3,
        // WU24b: total real de la serie; en el fixture coincide con las evaluaciones listadas.
        controlesTotal: 3,
        cambioNetoPesoKg: '-3.20',
        cambioNetoGrasaPorcentaje: '-2.40',
        rangoSeleccionado: '3M',
        evaluaciones: [
          {
            id: 'eval-1',
            alumnoId: user?.id || 'demo-alumno',
            fechaEvaluacion: '2026-07-01',
            pesoKg: '77.70',
            alturaCm: '178.00',
            porcentajeGrasa: '17.20',
            perimetros: { cinturaCm: '85.00', brazoCm: '36.00', pechoCm: '100.00' },
            modalidad: 'remoto' as any,
            origen: 'remoto_autoreporte' as any,
            registradoPor: user?.id || 'demo-alumno',
            estado: 'aprobado' as any,
            fotos: [
              {
                id: 'f-1',
                controlId: 'eval-1',
                angulo: AnguloFoto.FRONTAL,
                storageKey: 'antropometria/demo/2026/f1.webp',
                createdAtUtc: new Date().toISOString(),
              },
            ],
            createdAtUtc: new Date().toISOString(),
            updatedAtUtc: new Date().toISOString(),
          },
          {
            id: 'eval-2',
            alumnoId: user?.id || 'demo-alumno',
            fechaEvaluacion: '2026-08-01',
            pesoKg: '75.80',
            alturaCm: '178.00',
            porcentajeGrasa: '15.90',
            perimetros: { cinturaCm: '83.00', brazoCm: '36.80', pechoCm: '101.00' },
            modalidad: 'remoto' as any,
            origen: 'remoto_autoreporte' as any,
            registradoPor: user?.id || 'demo-alumno',
            estado: 'aprobado' as any,
            fotos: [],
            createdAtUtc: new Date().toISOString(),
            updatedAtUtc: new Date().toISOString(),
          },
          {
            id: 'eval-3',
            alumnoId: user?.id || 'demo-alumno',
            fechaEvaluacion: '2026-09-01',
            pesoKg: '74.50',
            alturaCm: '178.00',
            porcentajeGrasa: '14.80',
            perimetros: { cinturaCm: '81.00', brazoCm: '37.50', pechoCm: '102.00' },
            modalidad: 'remoto' as any,
            origen: 'remoto_autoreporte' as any,
            registradoPor: user?.id || 'demo-alumno',
            estado: 'aprobado' as any,
            fotos: [
              {
                id: 'f-2',
                controlId: 'eval-3',
                angulo: AnguloFoto.FRONTAL,
                storageKey: 'antropometria/demo/2026/f2.webp',
                createdAtUtc: new Date().toISOString(),
              },
            ],
            createdAtUtc: new Date().toISOString(),
            updatedAtUtc: new Date().toISOString(),
          },
        ],
      };
      setEvolucion(demoEvolucion);
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
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                    Cambio de Peso
                  </span>
                  <p className="text-xl font-black font-mono text-emerald-400 mt-0.5">
                    {evolucion.cambioNetoPesoKg} kg
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                    Grasa Corporal
                  </span>
                  <p className="text-xl font-black font-mono text-emerald-400 mt-0.5">
                    {evolucion.cambioNetoGrasaPorcentaje}%
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">
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
              onClick={() => setVistaActiva('nuevo')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setVistaActiva('nuevo')}
              className="group p-5 rounded-3xl bg-gradient-to-br from-card to-cyan-500/10 border-2 border-cyan-500/30 hover:border-cyan-500/70 transition-all duration-200 cursor-pointer shadow-md hover:shadow-cyan-500/5 active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3.5 rounded-2xl bg-cyan-500 text-cyan-950 shadow-md shadow-cyan-500/20">
                    <Camera className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground group-hover:text-cyan-400 transition-colors flex items-center gap-1.5">
                      Actualizar mis medidas y fotos
                      <ArrowUpRight className="h-4 w-4 text-cyan-400 opacity-80" />
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                      Registra tu peso actual, perímetros de cintura o brazo y envía tu check-in al coach.
                    </p>
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-secondary/80 text-foreground group-hover:text-cyan-400 group-hover:bg-cyan-500/15 transition-colors">
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
                <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
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
              onClick={() => setVistaActiva('nuevo')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nuevo Check-in</span>
            </button>
          </div>

          <div className="space-y-3">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground px-1">
              Registro Histórico Cronológico
            </h3>

            {evolucion?.evaluaciones && evolucion.evaluaciones.length > 0 ? (
              evolucion.evaluaciones.map((item) => (
                <div
                  key={item.id}
                  className="p-5 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-border/50 pb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="font-bold text-sm text-foreground">
                        {item.fechaEvaluacion}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 uppercase">
                        {item.estado}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground capitalize">
                      {item.origen.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-xl bg-secondary/30">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        Peso
                      </span>
                      <p className="font-mono font-bold text-sm text-foreground">{item.pesoKg} kg</p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-secondary/30">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        % Grasa
                      </span>
                      <p className="font-mono font-bold text-sm text-foreground">
                        {item.porcentajeGrasa ? `${item.porcentajeGrasa}%` : 'N/D'}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-secondary/30">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        Cintura
                      </span>
                      <p className="font-mono font-bold text-sm text-foreground">
                        {item.perimetros?.cinturaCm ? `${item.perimetros.cinturaCm} cm` : 'N/D'}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-xl bg-secondary/30">
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        Brazo
                      </span>
                      <p className="font-mono font-bold text-sm text-foreground">
                        {item.perimetros?.brazoCm ? `${item.perimetros.brazoCm} cm` : 'N/D'}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No hay evaluaciones registradas aún.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
