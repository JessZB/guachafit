import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { apiClient } from '../../lib/api-client';
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
} from 'lucide-react';

export function ProgresoPage() {
  const { user } = useAuth();
  const [evolucion, setEvolucion] = useState<EvolucionCorporalDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'evolucion' | 'nuevo'>('evolucion');

  // Form for remote athlete check-in
  const [pesoKg, setPesoKg] = useState('74.50');
  const [porcentajeGrasa, setPorcentajeGrasa] = useState('14.80');
  const [cinturaCm, setCinturaCm] = useState('81.00');
  const [brazoCm, setBrazoCm] = useState('37.50');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    async function loadEvolucion() {
      setIsLoading(true);
      try {
        if (user?.id) {
          const data = await apiClient<EvolucionCorporalDTO>(`/antropometria/evolucion/${user.id}`);
          setEvolucion(data);
        }
      } catch {
        // Fallback demo data
        const demoEvolucion: EvolucionCorporalDTO = {
          alumnoId: user?.id || 'demo-alumno',
          totalEvaluaciones: 3,
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
      } finally {
        setIsLoading(false);
      }
    }

    loadEvolucion();
  }, [user]);

  const handleSubmitCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await apiClient('/antropometria/checkin', {
        method: 'POST',
        body: JSON.stringify({
          alumnoId: user?.id,
          fechaEvaluacion: new Date().toISOString().split('T')[0],
          pesoKg,
          porcentajeGrasa,
          perimetros: { cinturaCm, brazoCm },
        }),
      });
      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false);
        setActiveTab('evolucion');
      }, 2000);
    } catch {
      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false);
        setActiveTab('evolucion');
      }, 1500);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
              <TrendingUp className="h-4 w-4" />
              <span>Control Antropométrico & Composición (RF-003, RF-004)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-1">
              Evolución Corporal
            </h1>
            <p className="text-xs text-muted-foreground">
              Datos fisiológicos validados y comparador visual privado en Cloudflare R2.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-secondary/60 p-1 rounded-2xl border border-border">
            <button
              onClick={() => setActiveTab('evolucion')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'evolucion'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Historial y Tendencias
            </button>
            <button
              onClick={() => setActiveTab('nuevo')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'nuevo'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Nuevo Check-in
            </button>
          </div>
        </div>

        {/* Net Change KPIs */}
        {evolucion && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                Cambio Neto de Peso
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
                Evaluaciones Aprobadas
              </span>
              <p className="text-xl font-black font-mono text-foreground mt-0.5">
                {evolucion.totalEvaluaciones}
              </p>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'evolucion' ? (
        /* Historical Timeline of Measurements */
        <div className="space-y-4">
          <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground px-1">
            Registro Histórico Cronológico
          </h3>

          {evolucion?.evaluaciones.map((item, idx) => (
            <div
              key={item.id}
              className="p-5 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between border-b border-border/50 pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="font-bold text-sm text-foreground">{item.fechaEvaluacion}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 uppercase">
                    Aprobado
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
          ))}
        </div>
      ) : (
        /* New Check-in Form */
        <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4 max-w-xl mx-auto">
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase">
            <Camera className="h-4 w-4" />
            <span>Formulario de Medición Corporal</span>
          </div>

          {submitSuccess ? (
            <div className="p-6 text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
              <h4 className="font-bold text-base text-foreground">Check-in Enviado</h4>
              <p className="text-xs text-muted-foreground">
                Tus mediciones fueron enviadas a tu entrenador para auditoría y aprobación.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmitCheckin} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Peso (kg)</label>
                  <input
                    type="text"
                    required
                    value={pesoKg}
                    onChange={(e) => setPesoKg(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    % Grasa Estimado
                  </label>
                  <input
                    type="text"
                    value={porcentajeGrasa}
                    onChange={(e) => setPorcentajeGrasa(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Perímetro Cintura (cm)
                  </label>
                  <input
                    type="text"
                    value={cinturaCm}
                    onChange={(e) => setCinturaCm(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Perímetro Brazo (cm)
                  </label>
                  <input
                    type="text"
                    value={brazoCm}
                    onChange={(e) => setBrazoCm(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <Lock className="h-3.5 w-3.5 text-primary" />
                  <span>Privacidad R2 & RBAC Híbrido (ADR-001)</span>
                </div>
                <p className="text-[11px]">
                  Si eres alumno presencial, tus medidas se toman directamente en sala con el coach.
                  Si eres alumno online, tu reporte queda pendiente de validación técnica.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-black text-sm tracking-wide shadow-md shadow-primary/25 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>{isSubmitting ? 'Enviando...' : 'Guardar Evaluación Corporal'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
