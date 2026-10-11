import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';
import { MetricCard } from '../../components/common/MetricCard';
import { clasificarTasaAdherencia, etiquetaSemaforo } from '../../lib/adherencia';
import { pluralizar } from '../../lib/pluralizar';
import { DashboardComandoDTO } from '@guachafit/shared';
import {
  LayoutDashboard,
  Users,
  DollarSign,
  Activity,
  AlertTriangle,
  Receipt,
  Camera,
  ArrowRight,
  ShieldCheck,
  UserX,
} from 'lucide-react';

/** WU20: tope de filas visibles por bandeja de riesgo; el resto se ve en su sección completa. */
const TOPE_FILAS_RIESGO = 5;

export function DashboardPage() {
  const { isDemoMode } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardComandoDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarDashboard = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient<DashboardComandoDTO>('/entrenador/dashboard-comando');
      setDashboard(data);
    } catch (err: any) {
      // D2: sin datos demo fuera del modo demo; estado de error honesto con reintento.
      setDashboard(null);
      setError(
        err?.message || 'No se pudo cargar el dashboard del negocio. Inténtalo de nuevo.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // MODO DEMO EXPLÍCITO (isDemoMode): KPIs de ejemplo solo con la bandera activa y
    // sin llamadas contra la API real. En sesión real, un fallo es un error visible.
    if (isDemoMode) {
      setDashboard({
        kpisMacro: {
          alumnosActivos: 38,
          capacidadMaxima: 50,
          porcentajeOcupacion: '76.00',
          cobranzaMesUsd: '1900.00',
          metaCobranzaMesUsd: '2500.00',
          porcentajeCobranza: '76.00',
          tasaAdherenciaSemanal: '84.50',
          alumnosEnRiesgoDeportivo: 4,
          alumnosEnMoraFinanciera: 2,
          alumnosEnRiesgo: 4,
        },
        bandejasRapidas: {
          pagosPorConciliar: 3,
          checkinsAntropometricosPendientes: 2,
          alumnosEnMora: [
            {
              alumnoId: 'a1',
              nombre: 'Carlos Mendoza',
              cuotaId: 'c1',
              saldoPendienteUsd: '30.00',
              diasVencido: 5,
            },
            {
              alumnoId: 'a2',
              nombre: 'Mariana Pérez',
              cuotaId: 'c2',
              saldoPendienteUsd: '50.00',
              diasVencido: 2,
            },
          ],
          alumnosInactivosEntrenamiento: [
            {
              alumnoId: 'a3',
              nombre: 'Andrés Silva',
              diasSinEntrenar: 6,
            },
            {
              alumnoId: 'a4',
              nombre: 'Elena Gómez',
              diasSinEntrenar: 5,
            },
          ],
        },
      });
      setIsLoading(false);
      return;
    }

    cargarDashboard();
  }, [isDemoMode]);

  // RF-013: el badge de adherencia se deriva del dato real, nunca de un texto fijo.
  const semaforoAdherencia = dashboard
    ? clasificarTasaAdherencia(dashboard.kpisMacro.tasaAdherenciaSemanal)
    : null;
  const etiquetaAdherencia = etiquetaSemaforo(semaforoAdherencia);
  const sinDatoAdherencia = dashboard?.kpisMacro.tasaAdherenciaSemanal === null;
  const varianteBadgeAdherencia =
    etiquetaAdherencia.tono === 'success'
      ? 'success'
      : etiquetaAdherencia.tono === 'warning'
      ? 'warning'
      : etiquetaAdherencia.tono === 'danger'
      ? 'danger'
      : 'info';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          <LayoutDashboard className="h-4 w-4" />
          <span>Panel administrativo</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Resumen del Negocio
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cupos, cobros y entrenamiento de tus alumnos, en tiempo real.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-success/15 text-success border border-success/20 uppercase">
              Operación Activa
            </span>
          </div>
        </div>
      </div>

      {/* D2: error honesto con reintento (sin KPIs demo fuera del modo demo) */}
      {!isLoading && error && (
        <div className="p-6 rounded-3xl bg-card border border-destructive/30 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => cargarDashboard()}
            className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Macro KPIs Grid */}
      {dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricCard
            title="Alumnos Activos"
            value={`${dashboard.kpisMacro.alumnosActivos}/${dashboard.kpisMacro.capacidadMaxima}`}
            subtitle={`${dashboard.kpisMacro.porcentajeOcupacion}% de cupos ocupados`}
            icon={Users}
            badge={{
              text: `${Math.max(
                0,
                dashboard.kpisMacro.capacidadMaxima - dashboard.kpisMacro.alumnosActivos
              )} cupos`,
              variant: 'info',
            }}
          />

          <MetricCard
            title="Cobros del Mes"
            value={`$${dashboard.kpisMacro.cobranzaMesUsd}`}
            subtitle={
              dashboard.kpisMacro.metaCobranzaMesUsd !== null
                ? `Meta: $${dashboard.kpisMacro.metaCobranzaMesUsd} USD (${dashboard.kpisMacro.porcentajeCobranza}%)`
                : 'Sin meta de cobranza configurada'
            }
            icon={DollarSign}
            badge={{
              text: 'Montos en USD',
              variant: 'success',
            }}
          />

          <MetricCard
            title="Cumplimiento Semanal"
            value={
              dashboard.kpisMacro.tasaAdherenciaSemanal !== null
                ? `${dashboard.kpisMacro.tasaAdherenciaSemanal}%`
                : '—'
            }
            subtitle={
              sinDatoAdherencia
                ? 'Sin rutinas asignadas esta semana'
                : 'Entrenamientos completados vs. planificados'
            }
            icon={Activity}
            badge={{
              text: sinDatoAdherencia ? 'Sin dato' : `Semáforo ${etiquetaAdherencia.texto}`,
              variant: varianteBadgeAdherencia,
            }}
          />

          <MetricCard
            title="Alumnos en Riesgo"
            value={dashboard.kpisMacro.alumnosEnRiesgoDeportivo}
            subtitle="Cumplimiento bajo o 4+ días sin entrenar"
            icon={UserX}
            badge={{
              text: dashboard.kpisMacro.alumnosEnRiesgoDeportivo > 0 ? 'Requiere atención' : 'Sin alertas',
              variant: dashboard.kpisMacro.alumnosEnRiesgoDeportivo > 0 ? 'danger' : 'success',
            }}
          />

          <MetricCard
            title="Pagos Vencidos"
            value={dashboard.kpisMacro.alumnosEnMoraFinanciera}
            subtitle="Cuotas vencidas o saldo pendiente"
            icon={AlertTriangle}
            badge={{
              text: dashboard.kpisMacro.alumnosEnMoraFinanciera > 0 ? 'Cobrar' : 'Al día',
              variant: dashboard.kpisMacro.alumnosEnMoraFinanciera > 0 ? 'warning' : 'success',
            }}
          />
        </div>
      )}

      {/* Quick Action Inboxes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payments Inbox Card */}
        <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Receipt className="h-5 w-5 text-primary shrink-0" />
              <h2 className="font-bold text-base text-foreground">Pagos por Revisar</h2>
            </div>
            <span className="shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/20">
              {dashboard?.bandejasRapidas.pagosPorConciliar || 0} pendientes
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Pagos en bolívares o dólares que tus alumnos reportaron y esperan tu confirmación.
          </p>

          <Link
            to="/coach/conciliacion"
            className="w-full py-2.5 px-4 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 font-bold text-xs flex items-center justify-between transition-colors"
          >
            <span>Revisar pagos</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Anthropometry Inbox Card */}
        <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Camera className="h-5 w-5 text-primary shrink-0" />
              <h2 className="font-bold text-base text-foreground">Evaluaciones por Revisar</h2>
            </div>
            <span className="shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
              {dashboard?.bandejasRapidas.checkinsAntropometricosPendientes || 0} por validar
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Medidas y fotos de progreso que subieron tus alumnos.
          </p>

          <Link
            to="/coach/antropometria"
            className="w-full py-2.5 px-4 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 font-bold text-xs flex items-center justify-between transition-colors"
          >
            <span>Revisar evaluaciones</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Early Risk Monitoring Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mora List */}
        <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <span>Alumnos con Pagos Vencidos</span>
          </h3>

          {dashboard && dashboard.bandejasRapidas.alumnosEnMora.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Sin pagos vencidos por ahora 🎉
            </p>
          )}

          <div className="space-y-2">
            {dashboard?.bandejasRapidas.alumnosEnMora.slice(0, TOPE_FILAS_RIESGO).map((mora) => (
              <div
                key={mora.alumnoId}
                className="p-3 rounded-2xl bg-secondary/40 border border-border flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-bold text-xs text-foreground truncate">{mora.nombre}</p>
                  <p className="text-[11px] text-destructive font-semibold">
                    {pluralizar(mora.diasVencido, 'día de atraso', 'días de atraso')}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono font-bold text-sm text-foreground">
                    ${mora.saldoPendienteUsd} USD
                  </span>
                </div>
              </div>
            ))}
          </div>

          {dashboard && dashboard.bandejasRapidas.alumnosEnMora.length > TOPE_FILAS_RIESGO && (
            <Link
              to="/coach/cartera?pestana=mora"
              className="w-full py-2 px-3 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground font-bold text-[11px] flex items-center justify-between transition-colors"
            >
              <span>Ver todos ({dashboard.bandejasRapidas.alumnosEnMora.length})</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {/* Inactivity List */}
        <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <UserX className="h-4 w-4 text-destructive shrink-0" />
            <span>Alumnos sin Entrenar</span>
          </h3>

          {dashboard && dashboard.bandejasRapidas.alumnosInactivosEntrenamiento.length === 0 && (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Sin alumnos inactivos por ahora 🎉
            </p>
          )}

          <div className="space-y-2">
            {dashboard?.bandejasRapidas.alumnosInactivosEntrenamiento
              .slice(0, TOPE_FILAS_RIESGO)
              .map((inac) => (
                <div
                  key={inac.alumnoId}
                  className="p-3 rounded-2xl bg-secondary/40 border border-border flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-xs text-foreground truncate">{inac.nombre}</p>
                    <p className="text-[11px] text-muted-foreground">Sin registrar series</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-bold text-xs text-destructive">
                      {pluralizar(inac.diasSinEntrenar, 'día sin entrenar', 'días sin entrenar')}
                    </span>
                  </div>
                </div>
              ))}
          </div>

          {dashboard &&
            dashboard.bandejasRapidas.alumnosInactivosEntrenamiento.length > TOPE_FILAS_RIESGO && (
              <Link
                to="/coach/monitor-adherencia"
                className="w-full py-2 px-3 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground font-bold text-[11px] flex items-center justify-between transition-colors"
              >
                <span>
                  Ver todos ({dashboard.bandejasRapidas.alumnosInactivosEntrenamiento.length})
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
        </div>
      </div>
    </div>
  );
}
