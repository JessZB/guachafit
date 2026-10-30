import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';
import { AvisoDatosOffline } from '../../components/common/AvisoDatosOffline';
import { EstadoCarga } from '../../components/ui/EstadoCarga';
import { EstadoError } from '../../components/ui/EstadoError';
import { useFrescuraOffline } from '../../lib/use-frescura-offline';
import { KpisMacroDashboard } from '../../components/entrenador/dashboard/KpisMacroDashboard';
import { BandejaRapidaCard } from '../../components/entrenador/dashboard/BandejaRapidaCard';
import { ListasAlertaTemprana } from '../../components/entrenador/dashboard/ListasAlertaTemprana';
import { DashboardComandoDTO } from '@guachafit/shared';
import { LayoutDashboard, Receipt, Camera } from 'lucide-react';

export function DashboardPage() {
  const { isDemoMode } = useAuth();
  const [dashboard, setDashboard] = useState<DashboardComandoDTO | null>(null);
  // En modo demo no hay petición: arranca sin estado de carga.
  const [isLoading, setIsLoading] = useState(() => !isDemoMode);
  const [error, setError] = useState<string | null>(null);
  const { isOnline } = useFrescuraOffline(null);

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
          onReintentar={() => cargarDashboard()}
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
