/**
 * Métricas financieras del alumno (organismo ÚNICO).
 *
 * Presentacional: recibe el resumen y no llama a la API (R1). Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-4). Debe montarse sobre `MetricCard`
 * existente en la consolidación D; hoy conserva el markup para no romper specs.
 * W-6: conserva `rounded-3xl` (los specs localizan la tarjeta de saldo con
 * `.closest('.rounded-3xl')`) y los textos (`Saldo Pendiente Actual`, `$40.00/$20.00`,
 * `Sin deudas activas`, `Saldo a favor: 10.00 USD` vía `textoSaldoAFavor`).
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura, estados honestos (sin resumen
 * real muestra "—"/"Dato no disponible", nunca cifras inventadas: D2).
 */
import type { ResumenFinancieroAlumnoDTO } from '@guachafit/shared';
import { textoSaldoAFavor, tieneSaldoAFavor } from '../../../lib/saldo-a-favor';

interface MetricasFinancierasAlumnoProps {
  finanzas: ResumenFinancieroAlumnoDTO | null;
}

export function MetricasFinancierasAlumno({ finanzas }: MetricasFinancierasAlumnoProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">
            Saldo Pendiente Actual
          </span>
          <span
            className={`h-2 w-2 rounded-full ${
              !finanzas
                ? 'bg-muted-foreground'
                : Number(finanzas.saldoPendienteTotalUsd || 0) > 0
                ? 'bg-danger animate-pulse'
                : 'bg-success'
            }`}
            title={
              !finanzas
                ? 'Dato no disponible'
                : Number(finanzas.saldoPendienteTotalUsd || 0) > 0
                ? 'Cuota en mora/pendiente'
                : 'Solvente'
            }
          />
        </div>
        <p
          className={`text-2xl font-bold font-mono tracking-tight ${
            !finanzas
              ? 'text-muted-foreground'
              : Number(finanzas.saldoPendienteTotalUsd || 0) > 0
              ? 'text-danger'
              : 'text-success'
          }`}
        >
          ${finanzas ? finanzas.saldoPendienteTotalUsd || '0.00' : '—'}{' '}
          <span className="text-xs font-bold text-muted-foreground">USD</span>
        </p>
        <span className="text-[11px] text-muted-foreground block">
          {!finanzas
            ? 'Dato no disponible'
            : Number(finanzas.saldoPendienteTotalUsd || 0) > 0
            ? 'Cuota pendiente de liquidar'
            : 'Sin deudas activas'}
        </span>
        {finanzas && tieneSaldoAFavor(finanzas.saldoAFavorUsd) && (
          <span className="text-xs font-semibold text-success block">
            {textoSaldoAFavor(finanzas.saldoAFavorUsd)}
          </span>
        )}
      </div>

      <div className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-1.5">
        <span className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider block">
          Pagado en Mes en Curso
        </span>
        <p className="text-2xl font-bold font-mono tracking-tight text-foreground">
          ${finanzas ? finanzas.totalPagadoMesActualUsd || '0.00' : '—'}{' '}
          <span className="text-xs font-bold text-muted-foreground">USD</span>
        </p>
        <span className="text-[11px] text-muted-foreground block">Abonos recibidos este periodo</span>
      </div>

      <div className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-1.5">
        <span className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider block">
          Histórico Total Acumulado
        </span>
        <p className="text-2xl font-bold font-mono tracking-tight text-primary">
          ${finanzas ? finanzas.totalPagadoHistoricoUsd || '0.00' : '—'}{' '}
          <span className="text-xs font-bold text-muted-foreground">USD</span>
        </p>
        <span className="text-[11px] text-muted-foreground block">Total abonado por este alumno</span>
      </div>
    </div>
  );
}
