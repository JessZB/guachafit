import type { DashboardComandoDTO } from '@guachafit/shared';
import { Users, DollarSign, Activity } from 'lucide-react';
import { MetricCard } from '../../common/MetricCard';
import { clasificarTasaAdherencia, etiquetaSemaforo } from '../../../lib/adherencia';
import { useFormatoNumero } from '../../../lib/use-formato-numero';

export interface KpisMacroDashboardProps {
  kpisMacro: DashboardComandoDTO['kpisMacro'];
}

/** Contexto del negocio del Dashboard: cupos, cobros y cumplimiento. Solo presentación. */
export function KpisMacroDashboard({ kpisMacro }: KpisMacroDashboardProps) {
  const { formatMonto, formatDecimal } = useFormatoNumero();

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

  const subtituloMeta =
    kpisMacro.metaCobranzaMesUsd !== null
      ? `Meta: ${formatMonto(kpisMacro.metaCobranzaMesUsd, 'USD', { conCodigo: true })}${
          kpisMacro.porcentajeCobranza !== null
            ? ` (${formatDecimal(kpisMacro.porcentajeCobranza, { decimales: 0 })}%)`
            : ''
        }`
      : 'Sin meta de cobranza configurada';

  return (
    <section className="space-y-3">
      <h2 className="font-bold text-base text-foreground">Contexto del negocio</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Alumnos Activos"
          value={`${kpisMacro.alumnosActivos}/${kpisMacro.capacidadMaxima}`}
          subtitle={`${formatDecimal(kpisMacro.porcentajeOcupacion, { decimales: 0 })}% de cupos ocupados`}
          icon={Users}
          enlace={{ to: '/coach/alumnos' }}
          badge={{
            text: `${Math.max(0, kpisMacro.capacidadMaxima - kpisMacro.alumnosActivos)} cupos`,
            variant: 'info',
          }}
        />

        <MetricCard
          title="Cobros del Mes"
          value={formatMonto(kpisMacro.cobranzaMesUsd, 'USD')}
          subtitle={subtituloMeta}
          icon={DollarSign}
          enlace={{ to: '/coach/cartera' }}
        />

        {/* RF-013: el badge de semáforo se deriva del dato real. */}
        <MetricCard
          title="Cumplimiento Semanal"
          value={kpisMacro.tasaAdherenciaSemanal !== null ? `${kpisMacro.tasaAdherenciaSemanal}%` : '—'}
          subtitle={
            sinDatoAdherencia
              ? 'Sin rutinas asignadas esta semana'
              : 'Entrenamientos completados vs. planificados'
          }
          icon={Activity}
          enlace={{ to: '/coach/monitor-adherencia' }}
          badge={{
            text: sinDatoAdherencia ? 'Sin dato' : `Semáforo ${etiquetaAdherencia.texto}`,
            variant: varianteBadgeAdherencia,
          }}
        />
      </div>
    </section>
  );
}
