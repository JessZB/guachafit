import type { DashboardComandoDTO } from '@guachafit/shared';
import { Users, DollarSign, Activity, AlertTriangle, UserX } from 'lucide-react';
import { MetricCard } from '../../common/MetricCard';
import { clasificarTasaAdherencia, etiquetaSemaforo } from '../../../lib/adherencia';

export interface KpisMacroDashboardProps {
  kpisMacro: DashboardComandoDTO['kpisMacro'];
}

/** Cifras macro del Dashboard del entrenador. Solo presentación: recibe datos reales, no los pide. */
export function KpisMacroDashboard({ kpisMacro }: KpisMacroDashboardProps) {
  // RF-013: el badge de adherencia se deriva del dato real, nunca de un texto fijo.
  const semaforoAdherencia = clasificarTasaAdherencia(kpisMacro.tasaAdherenciaSemanal);
  const etiquetaAdherencia = etiquetaSemaforo(semaforoAdherencia);
  const sinDatoAdherencia = kpisMacro.tasaAdherenciaSemanal === null;
  const varianteBadgeAdherencia =
    etiquetaAdherencia.tono === 'success'
      ? 'success'
      : etiquetaAdherencia.tono === 'warning'
      ? 'warning'
      : etiquetaAdherencia.tono === 'danger'
      ? 'danger'
      : 'info';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <MetricCard
        title="Alumnos Activos"
        value={`${kpisMacro.alumnosActivos}/${kpisMacro.capacidadMaxima}`}
        subtitle={`${kpisMacro.porcentajeOcupacion}% de cupos ocupados`}
        icon={Users}
        badge={{
          text: `${Math.max(0, kpisMacro.capacidadMaxima - kpisMacro.alumnosActivos)} cupos`,
          variant: 'info',
        }}
      />

      <MetricCard
        title="Cobros del Mes"
        value={`$${kpisMacro.cobranzaMesUsd}`}
        subtitle={
          kpisMacro.metaCobranzaMesUsd !== null
            ? `Meta: $${kpisMacro.metaCobranzaMesUsd} USD (${kpisMacro.porcentajeCobranza}%)`
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
        value={kpisMacro.tasaAdherenciaSemanal !== null ? `${kpisMacro.tasaAdherenciaSemanal}%` : '—'}
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
        value={kpisMacro.alumnosEnRiesgoDeportivo}
        subtitle="Cumplimiento bajo o 4+ días sin entrenar"
        icon={UserX}
        badge={{
          text: kpisMacro.alumnosEnRiesgoDeportivo > 0 ? 'Requiere atención' : 'Sin alertas',
          variant: kpisMacro.alumnosEnRiesgoDeportivo > 0 ? 'danger' : 'success',
        }}
      />

      <MetricCard
        title="Pagos Vencidos"
        value={kpisMacro.alumnosEnMoraFinanciera}
        subtitle="Cuotas vencidas o saldo pendiente"
        icon={AlertTriangle}
        badge={{
          text: kpisMacro.alumnosEnMoraFinanciera > 0 ? 'Cobrar' : 'Al día',
          variant: kpisMacro.alumnosEnMoraFinanciera > 0 ? 'warning' : 'success',
        }}
      />
    </div>
  );
}
