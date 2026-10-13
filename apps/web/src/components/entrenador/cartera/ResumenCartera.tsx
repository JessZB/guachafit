/**
 * Prompt 73 (Ola 2, módulo `cartera`): KPIs del RF-009 (cartera completa, no la página).
 *
 * Recorte verbatim de `CarteraPage.tsx`. Presentacional puro: recibe el resumen y lo muestra
 * con `MetricCard` (common, solo importado). ÚNICO (R3): métricas propias de la cartera.
 */
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, DollarSign, Receipt } from 'lucide-react';
import { MetricCard } from '../../common/MetricCard';
import { pluralizar } from '../../../lib/pluralizar';
import type { ResumenCarteraDTO } from '@guachafit/shared';

export function ResumenCartera({ resumen }: { resumen: ResumenCarteraDTO }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <MetricCard
        title="Recaudado del Mes"
        value={`$${resumen.recaudadoMesUsd}`}
        subtitle="Pagos aprobados del mes en curso"
        icon={DollarSign}
        badge={{ text: 'USD', variant: 'success' }}
      />
      <MetricCard
        title="Total en Mora"
        value={`$${resumen.totalEnMoraUsd}`}
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
        title="Próximos a Vencer"
        value={resumen.proximosAVencer}
        subtitle={`$${resumen.totalPorVencerUsd} USD vencen en los próximos 5 días`}
        icon={CalendarClock}
        badge={{
          text: '≤ 5 días',
          variant: resumen.proximosAVencer > 0 ? 'warning' : 'success',
        }}
      />
      <Link to="/coach/conciliacion" className="block">
        <MetricCard
          title="Pagos por Validar"
          value={resumen.pagosPorValidar}
          subtitle="Comprobantes esperando tu confirmación"
          icon={Receipt}
          badge={{ text: 'Ir a la bandeja', variant: 'info' }}
        />
      </Link>
    </div>
  );
}
