/**
 * Pestaña Finanzas del alumno (contenedor de pestaña ÚNICO).
 *
 * Compone el aviso sin resumen, las métricas, la tarjeta de cuota, el diálogo de reversión
 * y el historial. Recibe los hooks de dominio con interfaces estrechas (solo lo que pinta)
 * y conecta sus datos con los hijos. Extraída de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-4, recompuesta en SL-8).
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura, estados honestos.
 */
import { AlertCircle } from 'lucide-react';
import type { ResumenFinancieroAlumnoDTO } from '@guachafit/shared';
import type { PropsPanel } from '../../../lib/use-tabs-accesibles';
import { MetricasFinancierasAlumno } from './MetricasFinancierasAlumno';
import { TarjetaCuotaMensual } from './TarjetaCuotaMensual';
import { DialogoRevertirPago } from './DialogoRevertirPago';
import { HistorialTransaccionesAlumno } from './HistorialTransaccionesAlumno';
import type { PagoPorRevertir } from './use-reversion-pago';

export interface FinanzasTxPestana {
  finanzas: ResumenFinancieroAlumnoDTO | null;
  transaccionesError: string | null;
  paginaTx: number;
  tamanoTx: number;
  isCargandoTx: boolean;
  cambiarPaginaTx: (pagina: number) => void;
  cambiarTamanoTx: (tamano: number) => void;
}

export interface ReversionPestana {
  pagoPorRevertir: PagoPorRevertir | null;
  motivoReversion: string;
  setMotivoReversion: (valor: string) => void;
  revirtiendo: boolean;
  errorReversion: string | null;
  reversionExitoMsg: string | null;
  solicitarReversion: (pago: PagoPorRevertir) => void;
  cancelarReversion: () => void;
  confirmarReversion: () => void;
}

interface PestanaFinanzasAlumnoProps {
  propsPanel: PropsPanel;
  tx: FinanzasTxPestana;
  reversion: ReversionPestana;
  /** En demo no se puede revertir (sin endpoint real). */
  demo: boolean;
  onRegistrarCobro: () => void;
}

export function PestanaFinanzasAlumno({
  propsPanel,
  tx,
  reversion,
  demo,
  onRegistrarCobro,
}: PestanaFinanzasAlumnoProps) {
  const { finanzas } = tx;
  return (
    <div {...propsPanel} className="space-y-6 animate-in fade-in-50 duration-200 slide-in-from-bottom-1">
      {/* D2: sin resumen financiero real no se muestran cifras inventadas */}
      {!finanzas && (
        <div
          role="status"
          className="p-3 rounded-2xl bg-warning/10 border border-warning/30 text-warning text-xs flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            No se pudo cargar el historial financiero del alumno. Las cifras no están
            disponibles; reintenta recargando el expediente.
          </span>
        </div>
      )}

      {/* Métricas Financieras del Alumno */}
      <MetricasFinancierasAlumno finanzas={finanzas} />

      {/* Cuota del Mes y Botón de Cobro Directo */}
      <TarjetaCuotaMensual finanzas={finanzas} onRegistrarCobro={onRegistrarCobro} />

      {/* RF-007: confirmación de la reversión de un pago aprobado */}
      <DialogoRevertirPago
        pago={reversion.pagoPorRevertir}
        motivo={reversion.motivoReversion}
        procesando={reversion.revirtiendo}
        error={reversion.errorReversion}
        onCambiarMotivo={reversion.setMotivoReversion}
        onCancelar={reversion.cancelarReversion}
        onConfirmar={() => void reversion.confirmarReversion()}
      />

      {/* Historial de Transacciones y Comprobantes */}
      <HistorialTransaccionesAlumno
        finanzas={finanzas}
        errorCarga={tx.transaccionesError}
        mensajeReversion={reversion.reversionExitoMsg}
        demo={demo}
        pagina={tx.paginaTx}
        tamano={tx.tamanoTx}
        cargando={tx.isCargandoTx}
        onCambiarPagina={tx.cambiarPaginaTx}
        onCambiarTamano={tx.cambiarTamanoTx}
        onSolicitarReversion={reversion.solicitarReversion}
      />
    </div>
  );
}
