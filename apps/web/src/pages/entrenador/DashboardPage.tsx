import { AvisoDatosOffline } from '../../components/common/AvisoDatosOffline';
import { CargaConEsqueleto } from '../../components/ui/CargaConEsqueleto';
import { EsqueletoListaFilas, EsqueletoTarjetasKpi } from '../../components/ui/esqueletos';
import { EstadoError } from '../../components/ui/EstadoError';
import { useFrescuraOffline } from '../../lib/use-frescura-offline';
import { FranjaAtencionDashboard } from '../../components/entrenador/dashboard/FranjaAtencionDashboard';
import { KpisMacroDashboard } from '../../components/entrenador/dashboard/KpisMacroDashboard';
import { ListasAlertaTemprana } from '../../components/entrenador/dashboard/ListasAlertaTemprana';
import { useDashboardComando } from '../../components/entrenador/dashboard/use-dashboard-comando';
import { DESTINOS_ENTRENADOR } from '../../lib/etiquetas-dominio';

export function DashboardPage() {
  const { dashboard, isLoading, error, recargar } = useDashboardComando();
  const { isOnline } = useFrescuraOffline(null);
  const cargandoResumen = !dashboard && isLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-4 sm:p-6 rounded-3xl bg-card border border-border shadow-md space-y-2">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {DESTINOS_ENTRENADOR.panel.etiqueta}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cupos, cobros y entrenamiento de tus alumnos, en tiempo real.
          </p>
        </div>
      </div>

      {/* Sin conexión con datos guardados: aviso de frescura de la pantalla */}
      {dashboard && <AvisoDatosOffline url="/entrenador/dashboard-comando" />}

      {/* D2: error honesto con reintento (sin KPIs demo fuera del modo demo) */}
      {cargandoResumen ? null : !dashboard && error && !isOnline ? (
        <AvisoDatosOffline variante="sin-datos" />
      ) : !dashboard && error ? (
        <EstadoError
          titulo="No pudimos cargar el resumen"
          mensaje={error}
          onReintentar={recargar}
          nivelTitulo={2}
        />
      ) : null}

      {/* D4 (UX-13): lo que hay que atender hoy; visible también sin datos */}
      <FranjaAtencionDashboard dashboard={dashboard} />

      {/* Carga sin saltos: la franja no se mueve; el esqueleto ocupa el lugar de listas y KPIs */}
      {cargandoResumen && (
        <CargaConEsqueleto texto="Cargando el resumen">
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <EsqueletoListaFilas filas={3} />
              <EsqueletoListaFilas filas={3} />
            </div>
            <EsqueletoTarjetasKpi cantidad={3} />
          </div>
        </CargaConEsqueleto>
      )}

      {/* Listas de alerta temprana */}
      {dashboard && <ListasAlertaTemprana bandejas={dashboard.bandejasRapidas} />}

      {/* Contexto del negocio */}
      {dashboard && <KpisMacroDashboard kpisMacro={dashboard.kpisMacro} />}
    </div>
  );
}
