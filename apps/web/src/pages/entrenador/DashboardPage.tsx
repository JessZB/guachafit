import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { MetricCard } from '../../components/common/MetricCard';
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

export function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardComandoDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setIsLoading(true);
      try {
        const data = await apiClient<DashboardComandoDTO>('/entrenador/dashboard-comando');
        setDashboard(data);
      } catch {
        // Fallback demo data
        const demoData: DashboardComandoDTO = {
          kpisMacro: {
            alumnosActivos: 38,
            capacidadMaxima: 50,
            porcentajeOcupacion: '76.00',
            cobranzaMesUsd: '1900.00',
            metaCobranzaMesUsd: '2500.00',
            porcentajeCobranza: '76.00',
            tasaAdherenciaSemanal: '84.50',
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
        };
        setDashboard(demoData);
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          <LayoutDashboard className="h-4 w-4" />
          <span>Comando Central del Negocio (RF-013)</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Dashboard de Operaciones
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Control de capacidad, cobranza bimonetaria y adherencia deportiva en tiempo real.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 uppercase">
              Operación Activa
            </span>
          </div>
        </div>
      </div>

      {/* Macro KPIs Grid */}
      {dashboard && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Ocupación de Alumnos"
            value={`${dashboard.kpisMacro.alumnosActivos}/${dashboard.kpisMacro.capacidadMaxima}`}
            subtitle={`${dashboard.kpisMacro.porcentajeOcupacion}% de capacidad asignada`}
            icon={Users}
            badge={{
              text: `${50 - dashboard.kpisMacro.alumnosActivos} cupos`,
              variant: 'info',
            }}
          />

          <MetricCard
            title="Cobranza Mensual"
            value={`$${dashboard.kpisMacro.cobranzaMesUsd}`}
            subtitle={`Meta: $${dashboard.kpisMacro.metaCobranzaMesUsd} USD (${dashboard.kpisMacro.porcentajeCobranza}%)`}
            icon={DollarSign}
            badge={{
              text: 'Deuda Maestra USD',
              variant: 'success',
            }}
          />

          <MetricCard
            title="Adherencia Semanal"
            value={`${dashboard.kpisMacro.tasaAdherenciaSemanal}%`}
            subtitle="Sesiones completadas vs prescritas"
            icon={Activity}
            badge={{
              text: 'Semáforo Verde',
              variant: 'success',
            }}
          />

          <MetricCard
            title="Alumnos en Riesgo"
            value={dashboard.kpisMacro.alumnosEnRiesgo}
            subtitle="Inactividad >4 días o mora activa"
            icon={AlertTriangle}
            badge={{
              text: 'Atención requerida',
              variant: 'warning',
            }}
          />
        </div>
      )}

      {/* Quick Action Inboxes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payments Inbox Card */}
        <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-base text-foreground">Bandeja de Pagos por Conciliar</h2>
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
              {dashboard?.bandejasRapidas.pagosPorConciliar || 0} pendientes
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Abonos en Bolívares y Dólares reportados por atletas que requieren verificación bancaria.
          </p>

          <Link
            to="/coach/conciliacion"
            className="w-full py-2.5 px-4 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 font-bold text-xs flex items-center justify-between transition-colors"
          >
            <span>Abrir bandeja FIFO de conciliación</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Anthropometry Inbox Card */}
        <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-base text-foreground">Auditoría Antropométrica</h2>
            </div>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
              {dashboard?.bandejasRapidas.checkinsAntropometricosPendientes || 0} por validar
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Autoreportes de clientes online con fotografías de progreso privadas en Cloudflare R2.
          </p>

          <Link
            to="/coach/antropometria"
            className="w-full py-2.5 px-4 rounded-xl bg-secondary text-foreground hover:bg-secondary/80 font-bold text-xs flex items-center justify-between transition-colors"
          >
            <span>Revisar evaluaciones y comparador</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Early Risk Monitoring Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mora List */}
        <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span>Alumnos en Mora Financiera</span>
          </h3>

          <div className="space-y-2">
            {dashboard?.bandejasRapidas.alumnosEnMora.map((mora) => (
              <div
                key={mora.alumnoId}
                className="p-3 rounded-2xl bg-secondary/40 border border-border flex items-center justify-between"
              >
                <div>
                  <p className="font-bold text-xs text-foreground">{mora.nombre}</p>
                  <p className="text-[10px] text-destructive font-semibold">
                    {mora.diasVencido} días vencido
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-mono font-black text-sm text-foreground">
                    ${mora.saldoPendienteUsd} USD
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Inactivity List */}
        <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <UserX className="h-4 w-4 text-destructive" />
            <span>Alumnos Inactivos en Gimnasio</span>
          </h3>

          <div className="space-y-2">
            {dashboard?.bandejasRapidas.alumnosInactivosEntrenamiento.map((inac) => (
              <div
                key={inac.alumnoId}
                className="p-3 rounded-2xl bg-secondary/40 border border-border flex items-center justify-between"
              >
                <div>
                  <p className="font-bold text-xs text-foreground">{inac.nombre}</p>
                  <p className="text-[10px] text-muted-foreground">Sin registrar series</p>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-xs text-destructive">
                    {inac.diasSinEntrenar} días inactivo
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
