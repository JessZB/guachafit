/**
 * Fila de una transacción del historial financiero (molécula de dominio).
 *
 * CANDIDATO a `common/` o dominio finanzas (fase D, matriz 48 fila 8): entidad "transacción"
 * en 2+ vistas, copia atleta en `pages/atleta/PagosPage.tsx:1044-1086` (R3.3). Compone
 * `BadgeEstado` + `etiquetaMetodoPago`/`etiquetaEstadoTransaccion` al promover; hoy conserva
 * el markup porque la sustitución no es mecánica. W-6: conserva `rounded-2xl` en el contenedor
 * (las filas se localizan con `.closest('.rounded-2xl')` desde `Ref:`) y el `aria-label`
 * `Revertir pago de <monto> USD`.
 *
 * §6: `min-h-11` en la acción de reversión, 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import { EstadoConciliacion, type ResumenFinancieroAlumnoDTO } from '@guachafit/shared';
import { etiquetaMetodoPago } from '../../../lib/conciliacion-filtros';
import {
  etiquetaEstadoTransaccion,
  normalizarEstadoTransaccion,
} from '../../../lib/pagos-historial-filtros';
import { formatFechaHoraLocal } from '../../../lib/date-format';

type TransaccionFila = ResumenFinancieroAlumnoDTO['transacciones'][number];

interface FilaTransaccionProps {
  tx: TransaccionFila;
  /** En demo no se puede revertir (sin endpoint real). */
  demo: boolean;
  onSolicitarReversion: (pago: {
    id: string;
    montoUsd: string;
    metodoPago: string;
    referencia?: string;
  }) => void;
}

export function FilaTransaccion({ tx, demo, onSolicitarReversion }: FilaTransaccionProps) {
  return (
    <div
      className="p-3.5 rounded-2xl bg-secondary/20 border border-border/60 flex items-center justify-between gap-3 text-xs"
    >
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground capitalize">
            {etiquetaMetodoPago(tx.metodoPago)}
          </span>
          {tx.referencia && (
            <span className="font-mono text-[11px] text-muted-foreground">
              • Ref: {tx.referencia}
            </span>
          )}
          <span className="text-[11px] font-semibold text-muted-foreground">
            {etiquetaEstadoTransaccion(tx.estado)}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground font-mono">
          {formatFechaHoraLocal(tx.createdAtUtc) ?? '—'}
        </span>
        {!demo &&
          normalizarEstadoTransaccion(tx.estado) === EstadoConciliacion.APROBADO && (
            <button
              type="button"
              aria-label={`Revertir pago de ${tx.montoUsd} USD`}
              onClick={() => {
                onSolicitarReversion({
                  id: tx.id,
                  montoUsd: tx.montoUsd,
                  metodoPago: tx.metodoPago,
                  referencia: tx.referencia,
                });
              }}
              className="mt-1 min-h-11 px-3 rounded-xl border border-destructive/40 text-destructive text-[11px] font-bold hover:bg-destructive/10 cursor-pointer"
            >
              Revertir pago
            </button>
          )}
      </div>

      <div className="text-right">
        <p className="font-mono font-bold text-sm text-success">
          +${tx.montoUsd} USD
        </p>
        {tx.montoBs && (
          <span className="text-[11px] text-muted-foreground font-mono">
            ({tx.montoBs} VES)
          </span>
        )}
      </div>
    </div>
  );
}
