/**
 * Prompt 73 (Ola 2, módulo `cartera`): KPIs del RF-009 (cartera completa, no la página).
 *
 * Recorte verbatim de `CarteraPage.tsx`. Presentacional puro: recibe el resumen y lo muestra
 * con `MetricCard` (common, solo importado). ÚNICO (R3): métricas propias de la cartera.
 */
import { AlertTriangle, CalendarClock, DollarSign, Receipt } from 'lucide-react';
import { MetricCard } from '../../common/MetricCard';
import { pluralizar } from '../../../lib/pluralizar';
import { useFormatoNumero } from '../../../lib/use-formato-numero';
import type { ResumenCarteraDTO } from '@guachafit/shared';

export function ResumenCartera({ resumen }: { resumen: ResumenCarteraDTO }) {
  const { formatMonto } = useFormatoNumero();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <MetricCard
        title="Recaudado del mes"
        value={formatMonto(resumen.recaudadoMesUsd, 'USD')}
        subtitle="Pagos aprobados del mes en curso"
        icon={DollarSign}
      />
      <MetricCard
        title="Total en mora"
        value={formatMonto(resumen.totalEnMoraUsd, 'USD')}
        subtitle={`${pluralizar(
          resumen.alumnosEnMora,
          'alumno con cuota vencida',
          'alumnos con cuotas vencidas'
        )}`}
        icon={AlertTriangle}
        badge={{
          text: resumen.alumnosEnMora > 0 ? 'Cobrar' : 'Al día',
          variant: resumen.alumnosEnMora > 0 ? 'warning' : 'success',
        }}
      />
      <MetricCard
        title="Próximos a vencer"
        value={resumen.proximosAVencer}
        subtitle={`${formatMonto(resumen.totalPorVencerUsd, 'USD', { conCodigo: true })} vencen en los próximos 5 días`}
        icon={CalendarClock}
      />
      <MetricCard
        title="Pagos por validar"
        value={resumen.pagosPorValidar}
        subtitle="Comprobantes esperando tu confirmación"
        icon={Receipt}
        badge={{ text: 'Ir a la bandeja', variant: 'info' }}
        enlace={{ to: '/coach/conciliacion' }}
      />
    </div>
  );
}
