/**
 * Diálogo de reversión de un pago aprobado (organismo ÚNICO).
 *
 * Presentacional: la acción de reversión solo existe en la ficha (la vista del atleta solo
 * muestra el resultado). Extraído de `pages/entrenador/AlumnoDetallePage.tsx` (SL-4).
 * Conserva idénticos `¿Revertir este pago?`, `Motivo de la reversión`, `Revertir pago`
 * (deshabilitado en vacío) y el `label` + control hermanos que consultan los specs.
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura, error honesto (`role="alert"`).
 */
import { DialogoConfirmacion } from '../../common/DialogoConfirmacion';
import { etiquetaMetodoPago } from '../../../lib/conciliacion-filtros';
import type { PagoPorRevertir } from './use-reversion-pago';

export interface DialogoRevertirPagoProps {
  pago: PagoPorRevertir | null;
  motivo: string;
  procesando: boolean;
  error: string | null;
  onCambiarMotivo: (valor: string) => void;
  onCancelar: () => void;
  onConfirmar: () => void;
}

export function DialogoRevertirPago({
  pago,
  motivo,
  procesando,
  error,
  onCambiarMotivo,
  onCancelar,
  onConfirmar,
}: DialogoRevertirPagoProps) {
  return (
    <DialogoConfirmacion
      abierto={pago !== null}
      idTitulo="ficha-confirmar-reversion"
      titulo="¿Revertir este pago?"
      detalle={
        <div className="space-y-2">
          {pago && (
            <p className="font-semibold text-foreground">
              {`Pago de ${pago.montoUsd} USD · ${etiquetaMetodoPago(
                pago.metodoPago
              )}${pago.referencia ? ` · Ref: ${pago.referencia}` : ''}`}
            </p>
          )}
          <p>
            La cuota volverá a mostrar ese monto como pendiente y el alumno recibirá un aviso
            con el motivo.
          </p>
          <label htmlFor="ficha-motivo-reversion" className="block font-semibold text-foreground">
            Motivo de la reversión
          </label>
          <textarea
            id="ficha-motivo-reversion"
            value={motivo}
            onChange={(e) => onCambiarMotivo(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
          />
          {error && (
            <p role="alert" className="text-destructive font-semibold">
              {error}
            </p>
          )}
        </div>
      }
      textoConfirmar="Revertir pago"
      variante="peligro"
      procesando={procesando}
      confirmarDeshabilitado={!motivo.trim()}
      onCancelar={onCancelar}
      onConfirmar={onConfirmar}
    />
  );
}
