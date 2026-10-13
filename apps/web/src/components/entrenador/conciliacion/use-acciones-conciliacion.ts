/**
 * Tray action state and mutations: approve (after confirmation) and reject with
 * a required reason, with honest failure handling (no fake success, the
 * transaction stays in the tray when the server does not confirm).
 */
import { useState } from 'react';
import type { TransaccionPagoDetalleDTO } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { mensajeConExcedente } from '../../../lib/saldo-a-favor';

export interface ResultadoAccionesConciliacion {
  rejectingTx: TransaccionPagoDetalleDTO | null;
  viewingComprobanteTx: TransaccionPagoDetalleDTO | null;
  comprobanteImgError: boolean;
  marcarImagenFallida: () => void;
  motivoRechazo: string;
  fijarMotivoRechazo: (valor: string) => void;
  actionSuccess: string | null;
  actionError: string | null;
  pagoPorAprobar: TransaccionPagoDetalleDTO | null;
  aprobando: boolean;
  iniciarRechazo: (tx: TransaccionPagoDetalleDTO) => void;
  cerrarRechazo: () => void;
  verComprobante: (tx: TransaccionPagoDetalleDTO) => void;
  cerrarVisor: () => void;
  rechazarDesdeVisor: (tx: TransaccionPagoDetalleDTO) => void;
  aprobarDesdeVisor: (tx: TransaccionPagoDetalleDTO) => void;
  iniciarAprobacion: (tx: TransaccionPagoDetalleDTO) => void;
  cancelarAprobacion: () => void;
  confirmarAprobacion: () => Promise<void>;
  confirmarRechazo: () => Promise<void>;
}

export function useAccionesConciliacion(
  marcarResuelta: (txId: string) => void
): ResultadoAccionesConciliacion {
  const [rejectingTx, setRejectingTx] = useState<TransaccionPagoDetalleDTO | null>(null);
  const [viewingComprobanteTx, setViewingComprobanteTx] = useState<TransaccionPagoDetalleDTO | null>(null);
  // The real URL can fail (TTL expiry); it is never replaced with a foreign image.
  const [comprobanteImgError, setComprobanteImgError] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  // Conciliation failure stays visible; the transaction does not vanish unconfirmed.
  const [actionError, setActionError] = useState<string | null>(null);
  // The payment approves only after confirmation; `aprobando` blocks double submit.
  const [pagoPorAprobar, setPagoPorAprobar] = useState<TransaccionPagoDetalleDTO | null>(null);
  const [aprobando, setAprobando] = useState(false);

  const handleAprobar = async (txId: string) => {
    setActionError(null);
    let excedenteUsd: string | undefined;
    try {
      const respuesta = await apiClient<{ transaccion?: { excedenteUsd?: string } } | null>(
        `/finanzas/transacciones/${txId}/conciliar`,
        {
          method: 'PATCH',
          body: JSON.stringify({ accion: 'aprobar' }),
        }
      );
      excedenteUsd = respuesta?.transaccion?.excedenteUsd;
    } catch (err: unknown) {
      setActionError(
        (err as Error)?.message || 'No se pudo aprobar la transacción. Revisa tu conexión e inténtalo de nuevo.'
      );
      return;
    }

    // The server rules: reload the current page (the hook clamps a shrunk total).
    // In demo the resolved id is recorded and the local slice recomputes.
    marcarResuelta(txId);
    // The surplus (API data) stays as credit balance for the student.
    setActionSuccess(mensajeConExcedente('Pago aprobado y descontado de la cuota.', excedenteUsd));
    setTimeout(() => setActionSuccess(null), 3000);
  };

  const handleConfirmarRechazo = async () => {
    if (!rejectingTx || !motivoRechazo.trim()) return;
    setActionError(null);

    try {
      await apiClient(`/finanzas/transacciones/${rejectingTx.id}/conciliar`, {
        method: 'PATCH',
        body: JSON.stringify({
          accion: 'rechazar',
          motivoRechazo,
        }),
      });
    } catch (err: unknown) {
      setActionError(
        (err as Error)?.message || 'No se pudo rechazar la transacción. Revisa tu conexión e inténtalo de nuevo.'
      );
      return;
    }

    // Same rule as approve: real reload, or the demo slice with the resolved id.
    marcarResuelta(rejectingTx.id);
    setRejectingTx(null);
    setMotivoRechazo('');
    setActionSuccess('Transacción rechazada con observaciones notificadas al alumno.');
    setTimeout(() => setActionSuccess(null), 3000);
  };

  return {
    rejectingTx,
    viewingComprobanteTx,
    comprobanteImgError,
    marcarImagenFallida: () => setComprobanteImgError(true),
    motivoRechazo,
    fijarMotivoRechazo: setMotivoRechazo,
    actionSuccess,
    actionError,
    pagoPorAprobar,
    aprobando,
    iniciarRechazo: setRejectingTx,
    cerrarRechazo: () => setRejectingTx(null),
    verComprobante: (tx) => {
      setComprobanteImgError(false);
      setViewingComprobanteTx(tx);
    },
    cerrarVisor: () => setViewingComprobanteTx(null),
    rechazarDesdeVisor: (tx) => {
      setViewingComprobanteTx(null);
      setRejectingTx(tx);
    },
    aprobarDesdeVisor: (tx) => {
      setPagoPorAprobar(tx);
      setViewingComprobanteTx(null);
    },
    iniciarAprobacion: setPagoPorAprobar,
    cancelarAprobacion: () => setPagoPorAprobar(null),
    confirmarAprobacion: async () => {
      if (!pagoPorAprobar || aprobando) return;
      setAprobando(true);
      try {
        await handleAprobar(pagoPorAprobar.id);
      } finally {
        setAprobando(false);
        setPagoPorAprobar(null);
      }
    },
    confirmarRechazo: handleConfirmarRechazo,
  };
}
