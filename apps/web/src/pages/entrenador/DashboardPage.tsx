import { AvisoDatosOffline } from '../../components/common/AvisoDatosOffline';
import { EstadoCarga } from '../../components/ui/EstadoCarga';
import { EstadoError } from '../../components/ui/EstadoError';
import { useFrescuraOffline } from '../../lib/use-frescura-offline';
import { KpisMacroDashboard } from '../../components/entrenador/dashboard/KpisMacroDashboard';
import { BandejaRapidaCard } from '../../components/entrenador/dashboard/BandejaRapidaCard';
import { ListasAlertaTemprana } from '../../components/entrenador/dashboard/ListasAlertaTemprana';
import { useDashboardComando } from '../../components/entrenador/dashboard/use-dashboard-comando';
import { LayoutDashboard, Receipt, Camera } from 'lucide-react';

export function DashboardPage() {
  const { dashboard, isLoading, error, recargar } = useDashboardComando();
  const { isOnline } = useFrescuraOffline(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          <LayoutDashboard className="h-4 w-4" />
          <span>Panel administrativo</span>
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Resumen del Negocio
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cupos, cobros y entrenamiento de tus alumnos, en tiempo real.
          </p>
        </div>
      </div>

      {/* Sin conexión con datos guardados: aviso de frescura de la pantalla */}
      {dashboard && <AvisoDatosOffline url="/entrenador/dashboard-comando" />}

      {/* D2: error honesto con reintento (sin KPIs demo fuera del modo demo) */}
      {!dashboard && isLoading ? (
        <EstadoCarga texto="Cargando el resumen" claseContenedor="min-h-[200px]" />
      ) : !dashboard && error && !isOnline ? (
        <AvisoDatosOffline variante="sin-datos" />
      ) : !dashboard && error ? (
        <EstadoError
          titulo="No pudimos cargar el resumen"
          mensaje={error}
          onReintentar={recargar}
          nivelTitulo={2}
        />
      ) : null}

      {/* Macro KPIs Grid */}
      {dashboard && <KpisMacroDashboard kpisMacro={dashboard.kpisMacro} />}

      {/* Quick Action Inboxes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payments Inbox Card */}
        <BandejaRapidaCard
          icono={Receipt}
          titulo="Pagos por Revisar"
          descripcion="Pagos en bolívares o dólares que tus alumnos reportaron y esperan tu confirmación."
          conteo={dashboard ? dashboard.bandejasRapidas.pagosPorConciliar : null}
          unidadConteo="pendientes"
          tono="warning"
          enlace={{ to: '/coach/conciliacion', texto: 'Revisar pagos' }}
        />

        {/* Anthropometry Inbox Card */}
        <BandejaRapidaCard
          icono={Camera}
          titulo="Evaluaciones por Revisar"
          descripcion="Medidas y fotos de progreso que subieron tus alumnos."
          conteo={dashboard ? dashboard.bandejasRapidas.checkinsAntropometricosPendientes : null}
          unidadConteo="por validar"
          tono="primary"
          enlace={{ to: '/coach/antropometria', texto: 'Revisar evaluaciones' }}
        />
      </div>

      {/* Early Risk Monitoring Lists */}
      {dashboard && <ListasAlertaTemprana bandejas={dashboard.bandejasRapidas} />}
    </div>
  );
}
