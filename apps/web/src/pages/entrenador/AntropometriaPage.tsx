import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';
import {
  ControlAntropometricoDetalleDTO,
  AnguloFoto,
  ComparativaAngularDTO,
} from '@guachafit/shared';
import {
  Camera,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Sliders,
  Calendar,
  AlertCircle,
  Eye,
  ShieldCheck,
  Scale,
} from 'lucide-react';

export function AntropometriaPage() {
  const { isDemoMode } = useAuth();
  const [pendientes, setPendientes] = useState<ControlAntropometricoDetalleDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pendientes' | 'comparador'>('pendientes');
  // D2: fallo de carga honesto (sin cola demo fuera del modo demo).
  const [error, setError] = useState<string | null>(null);
  // D5: fallo de conciliación visible; la tarjeta no desaparece si el server no confirmó.
  const [actionError, setActionError] = useState<string | null>(null);

  // Comparator State
  const [angulo, setAngulo] = useState<AnguloFoto>(AnguloFoto.FRONTAL);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const cargarPendientes = async () => {
    setIsLoading(true);
    setError(null);
    setActionError(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): cola de ejemplo solo con la bandera activa.
    if (isDemoMode) {
      const demoPendientes: ControlAntropometricoDetalleDTO[] = [
        {
          id: 'ctrl-p1',
          alumnoId: 'al-002',
          fechaEvaluacion: '2026-09-06',
          pesoKg: '68.20',
          alturaCm: '165.00',
          porcentajeGrasa: '21.50',
          perimetros: { cinturaCm: '72.00', caderaCm: '98.00', musloCm: '55.00' },
          modalidad: 'remoto' as any,
          origen: 'remoto_autoreporte' as any,
          registradoPor: 'al-002',
          estado: 'pendiente_aprobacion' as any,
          fotos: [
            {
              id: 'fp-1',
              controlId: 'ctrl-p1',
              angulo: AnguloFoto.FRONTAL,
              storageKey: 'antropometria/demo/2026/frontal.webp',
              createdAtUtc: new Date().toISOString(),
            },
          ],
          createdAtUtc: new Date().toISOString(),
          updatedAtUtc: new Date().toISOString(),
        },
      ];
      setPendientes(demoPendientes);
      setIsLoading(false);
      return;
    }

    try {
      const data = await apiClient<ControlAntropometricoDetalleDTO[]>('/antropometria/pendientes');
      setPendientes(Array.isArray(data) ? data : []);
    } catch (err: any) {
      // D2: sin cola demo en sesión real; error visible con reintento.
      setPendientes([]);
      setError(
        err?.message || 'No se pudieron cargar las evaluaciones pendientes. Inténtalo de nuevo.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarPendientes();
  }, [isDemoMode]);

  const handleConciliar = async (id: string, accion: 'aprobar' | 'rechazar') => {
    setActionError(null);

    try {
      await apiClient(`/antropometria/${id}/conciliar`, {
        method: 'PATCH',
        body: JSON.stringify({
          accion,
          observacionesCoach: accion === 'aprobar' ? 'Progreso validado por coach' : 'Fotos borrosas',
          motivoRechazo: accion === 'rechazar' ? 'Por favor repetir fotos con mejor luz' : undefined,
        }),
      });
    } catch (err: any) {
      // D5: sin éxito falso ni desaparición optimista; la evaluación sigue pendiente.
      setActionError(
        err?.message || 'No se pudo conciliar la evaluación. Revisa tu conexión e inténtalo de nuevo.'
      );
      return;
    }

    setPendientes((prev) => prev.filter((p) => p.id !== id));
    setActionSuccess(
      accion === 'aprobar'
        ? 'Evaluación aprobada y consolidada en las curvas del alumno.'
        : 'Evaluación rechazada.'
    );
    setTimeout(() => setActionSuccess(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
              <Camera className="h-4 w-4" />
              <span>Medidas y Fotos</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-1">
              Evaluaciones Físicas
            </h1>
            <p className="text-xs text-muted-foreground">
              Revisa las medidas y fotos de progreso que subieron tus alumnos.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-secondary/60 p-1 rounded-2xl border border-border">
            <button
              onClick={() => setActiveTab('pendientes')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'pendientes'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Por revisar ({pendientes.length})
            </button>
            <button
              onClick={() => setActiveTab('comparador')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'comparador'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Comparador Antes / Después
            </button>
          </div>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2">
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

      {!isLoading && error ? (
        <div className="p-8 rounded-3xl bg-card border border-destructive/30 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => cargarPendientes()}
            className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      ) : activeTab === 'pendientes' ? (
        /* Review Queue */
        <div className="space-y-4">
          {pendientes.length === 0 ? (
            <div className="p-12 text-center space-y-3 bg-card rounded-3xl border border-border">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <h3 className="font-bold text-base text-foreground">Sin Evaluaciones Pendientes</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Todos los check-ins antropométricos remotos han sido validados.
              </p>
            </div>
          ) : (
            pendientes.map((ctrl) => (
              <div
                key={ctrl.id}
                className="p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-4"
              >
                <div className="flex items-center justify-between border-b border-border/50 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-foreground">
                      Fecha de Toma: {ctrl.fechaEvaluacion}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 uppercase">
                      Pendiente Aprobación
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    ID Alumno: {ctrl.alumnoId.slice(0, 8)}...
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-2xl bg-secondary/30">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Peso
                    </span>
                    <p className="font-mono font-bold text-base text-foreground">{ctrl.pesoKg} kg</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-secondary/30">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      % Grasa
                    </span>
                    <p className="font-mono font-bold text-base text-foreground">
                      {ctrl.porcentajeGrasa ? `${ctrl.porcentajeGrasa}%` : 'N/D'}
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-secondary/30">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Cintura
                    </span>
                    <p className="font-mono font-bold text-base text-foreground">
                      {ctrl.perimetros?.cinturaCm ? `${ctrl.perimetros.cinturaCm} cm` : 'N/D'}
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-secondary/30">
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Fotos Adjuntas
                    </span>
                    <p className="font-mono font-bold text-base text-foreground">
                      {ctrl.fotos.length} foto(s)
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span>Fotos protegidas: se muestran con un enlace temporal seguro.</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleConciliar(ctrl.id, 'rechazar')}
                      className="py-2 px-4 rounded-xl border border-destructive/40 text-destructive hover:bg-destructive/10 font-bold text-xs transition-colors"
                    >
                      Rechazar
                    </button>
                    <button
                      onClick={() => handleConciliar(ctrl.id, 'aprobar')}
                      className="py-2 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md hover:brightness-110 active:scale-95 transition-all"
                    >
                      Aprobar y Consolidar
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : isDemoMode ? (
        /* Photo Comparator (solo demo: las cifras de ejemplo viven tras isDemoMode) */
        <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div>
              <h2 className="font-black text-lg text-foreground">
                Comparativa Visual Lado a Lado
              </h2>
              <p className="text-xs text-muted-foreground">
                Analiza la recomposición corporal entre dos fechas de control.
              </p>
            </div>

            {/* Angle Selector */}
            <div className="flex items-center gap-1.5 bg-secondary/60 p-1 rounded-2xl border border-border">
              {[AnguloFoto.FRONTAL, AnguloFoto.LATERAL, AnguloFoto.POSTERIOR].map((a) => (
                <button
                  key={a}
                  onClick={() => setAngulo(a)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${
                    angulo === a
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Comparison Stage */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Control A (Before) */}
            <div className="p-5 rounded-3xl bg-secondary/30 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase">
                  Toma A (01 Julio 2026)
                </span>
                <span className="font-mono font-bold text-xs text-foreground">77.70 kg</span>
              </div>
              <div className="aspect-3/4 rounded-2xl bg-background/60 border border-border flex flex-col items-center justify-center text-muted-foreground space-y-2 p-6 text-center">
                <Camera className="h-10 w-10 text-primary/60" />
                <span className="text-xs font-semibold">Perspectiva {angulo}</span>
                <span className="text-[10px] text-muted-foreground">
                  Grasa: 17.20% • Cintura: 85 cm
                </span>
              </div>
            </div>

            {/* Control B (After) */}
            <div className="p-5 rounded-3xl bg-primary/5 border border-primary/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-primary uppercase">
                  Toma B (01 Septiembre 2026)
                </span>
                <span className="font-mono font-bold text-xs text-foreground">74.50 kg</span>
              </div>
              <div className="aspect-3/4 rounded-2xl bg-background/60 border border-border flex flex-col items-center justify-center text-muted-foreground space-y-2 p-6 text-center">
                <Camera className="h-10 w-10 text-primary" />
                <span className="text-xs font-semibold text-foreground">Perspectiva {angulo}</span>
                <span className="text-[10px] text-emerald-400 font-bold">
                  Grasa: 14.80% (-2.40%) • Cintura: 81 cm (-4 cm)
                </span>
              </div>
            </div>
          </div>

          {/* Delta Summary Pill */}
          <div className="p-4 rounded-2xl bg-secondary/50 border border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              <span className="text-xs font-bold text-foreground">
                Cambio Neto Total en el Periodo:
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono font-bold">
              <span className="text-emerald-400">Δ Peso: -3.20 kg</span>
              <span className="text-emerald-400">Δ Grasa: -2.40%</span>
            </div>
          </div>
        </div>
      ) : (
        /* D2: en sesión real no se muestran cifras de comparación inventadas */
        <div className="p-10 rounded-3xl bg-card border border-dashed border-border text-center space-y-3">
          <Camera className="h-10 w-10 text-muted-foreground mx-auto opacity-40" />
          <h3 className="font-bold text-base text-foreground">Sin evaluaciones comparables</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Cuando existan al menos dos evaluaciones aprobadas podrás comparar la evolución
            fotográfica lado a lado.
          </p>
        </div>
      )}
    </div>
  );
}
