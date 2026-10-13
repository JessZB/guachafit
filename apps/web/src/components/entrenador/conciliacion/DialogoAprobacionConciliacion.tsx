/**
 * Approval confirmation dialog: the payment is only approved after confirming
 * here, showing the amount to discount plus the surplus warning when it applies.
 *
 * Presentational: wraps the shared `DialogoConfirmacion`; every value and
 * callback arrives as props.
 */
import type { TransaccionPagoDetalleDTO } from '@guachafit/shared';
import { DialogoConfirmacion } from '../../common/DialogoConfirmacion';
import { avisoExcedenteAprobacion } from '../../../lib/saldo-a-favor';

export interface DialogoAprobacionConciliacionProps {
  pago: TransaccionPagoDetalleDTO | null;
  aprobando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}

export function DialogoAprobacionConciliacion({
  pago,
  aprobando,
  onCancelar,
  onConfirmar,
}: DialogoAprobacionConciliacionProps) {
  return (
    <DialogoConfirmacion
      abierto={pago !== null}
      idTitulo="conciliacion-confirmar-aprobacion"
      titulo={`¿Aprobar el pago de ${pago?.clienteNombre ?? 'este alumno'}?`}
      detalle={
        <>
          <p>{`Se descontarán ${pago?.montoEquivalenteUsd ?? ''} USD de su cuota.`}</p>
          {pago &&
            avisoExcedenteAprobacion(
              pago.montoEquivalenteUsd,
              pago.saldoPendienteCuotaUsd
            ) && (
              <p className="mt-1 font-semibold text-foreground">
                {avisoExcedenteAprobacion(
                  pago.montoEquivalenteUsd,
                  pago.saldoPendienteCuotaUsd
                )}
              </p>
            )}
        </>
      }
      textoConfirmar="Aprobar pago"
      procesando={aprobando}
      onCancelar={onCancelar}
      onConfirmar={onConfirmar}
    />
  );
}
