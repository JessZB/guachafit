/**
 * Tray action state and mutations: approve (after confirmation) and reject with
 * a required reason, with honest failure handling (no fake success, the
 * transaction stays in the tray when the server does not confirm).
 */
import { useEffect, useRef, useState } from 'react';
import type { TransaccionPagoDetalleDTO } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { mensajeConExcedente, tieneSaldoAFavor } from '../../../lib/saldo-a-favor';

/** Tiempo de vida de un aviso de éxito sin saldo a favor. */
const VIDA_EXITO_MS = 8000;

export interface ResultadoAccionesConciliacion {
  rejectingTx: TransaccionPagoDetalleDTO | null;
  viewingComprobanteTx: TransaccionPagoDetalleDTO | null;
  comprobanteImgError: boolean;
  marcarImagenFallida: () => void;
  motivoRechazo: string;
  fijarMotivoRechazo: (valor: string) => void;
  /** `true` while the rejection PATCH is in flight: blocks close and double submit. */
  rechazando: boolean;
  /** Rejection failure, shown inside the rejection modal (never on the page). */
  errorRechazo: string | null;
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
  /** Retira el aviso de éxito de inmediato (botón "Cerrar aviso"). */
  cerrarExito: () => void;
}

/**
 * `onConciliado` se llama solo tras un éxito confirmado por el servidor (o el cambio local demo),
 * para que la página invalide lo que la mutación cambia. Es opcional.
 */
export function useAccionesConciliacion(
  marcarResuelta: (txId: string) => void,
  onConciliado?: () => void
): ResultadoAccionesConciliacion {
  const [rejectingTx, setRejectingTx] = useState<TransaccionPagoDetalleDTO | null>(null);
  const [viewingComprobanteTx, setViewingComprobanteTx] = useState<TransaccionPagoDetalleDTO | null>(null);
  // The real URL can fail (TTL expiry); it is never replaced with a foreign image.
  const [comprobanteImgError, setComprobanteImgError] = useState(false);
  // COB-03: a draft reason must never reach another student, so every opening clears it.
  const [motivoRechazo, setMotivoRechazo] = useState('');
  // Rejection failure stays inside the modal, so the reason draft survives the retry.
  const [errorRechazo, setErrorRechazo] = useState<string | null>(null);
  // `rechazando` blocks closing the modal and a second submit while the PATCH travels.
  const [rechazando, setRechazando] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  // Conciliation failure stays visible; the transaction does not vanish unconfirmed.
  const [actionError, setActionError] = useState<string | null>(null);
  // The payment approves only after confirmation; `aprobando` blocks double submit.
  const [pagoPorAprobar, setPagoPorAprobar] = useState<TransaccionPagoDetalleDTO | null>(null);
  const [aprobando, setAprobando] = useState(false);
  // Timer of the success notice: one at a time, cleared on replacement, close and unmount.
  const temporizadorExitoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (temporizadorExitoRef.current !== null) clearTimeout(temporizadorExitoRef.current);
    },
    []
  );

  const limpiarTemporizadorExito = () => {
    if (temporizadorExitoRef.current !== null) {
      clearTimeout(temporizadorExitoRef.current);
      temporizadorExitoRef.current = null;
    }
  };

  // A success retires any earlier error. A notice with surplus credit stays until closed,
  // because the coach has to read that the student now has a balance in favour.
  const mostrarExito = (mensaje: string, persistente: boolean) => {
    limpiarTemporizadorExito();
    setActionError(null);
    setActionSuccess(mensaje);
    if (persistente) return;
    temporizadorExitoRef.current = setTimeout(() => {
      temporizadorExitoRef.current = null;
      setActionSuccess(null);
    }, VIDA_EXITO_MS);
  };

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
      // Error and success never coexist: a failed approval retires any visible success notice.
      limpiarTemporizadorExito();
      setActionSuccess(null);
      setActionError(
        (err as Error)?.message || 'No se pudo aprobar la transacción. Revisa tu conexión e inténtalo de nuevo.'
      );
      return;
    }

    // The server rules: reload the current page (the hook clamps a shrunk total).
    // In demo the resolved id is recorded and the local slice recomputes.
    marcarResuelta(txId);
    onConciliado?.();
    // The surplus (API data) stays as credit balance for the student.
    mostrarExito(
      mensajeConExcedente('Pago aprobado y descontado de la cuota.', excedenteUsd),
      tieneSaldoAFavor(excedenteUsd)
    );
  };

  const handleConfirmarRechazo = async () => {
    if (!rejectingTx || !motivoRechazo.trim() || rechazando) return;
    setRechazando(true);
    setErrorRechazo(null);

    try {
      await apiClient(`/finanzas/transacciones/${rejectingTx.id}/conciliar`, {
        method: 'PATCH',
        body: JSON.stringify({
          accion: 'rechazar',
          motivoRechazo,
        }),
      });
    } catch (err: unknown) {
      // The modal stays open with the reason, so the coach can retry without retyping.
      setErrorRechazo(
        (err as Error)?.message || 'No se pudo rechazar la transacción. Revisa tu conexión e inténtalo de nuevo.'
      );
      return;
    } finally {
      setRechazando(false);
    }

    // Same rule as approve: real reload, or the demo slice with the resolved id.
    marcarResuelta(rejectingTx.id);
    onConciliado?.();
    setRejectingTx(null);
    setMotivoRechazo('');
    mostrarExito('Transacción rechazada con observaciones notificadas al alumno.', false);
  };

  // COB-03 is enforced by abrirRechazo: no draft reason survives into a new rejection.
  // A rejection opened from the page retires the page-level error and any success notice.
  const abrirRechazo = (tx: TransaccionPagoDetalleDTO) => {
    limpiarTemporizadorExito();
    setActionSuccess(null);
    setActionError(null);
    setMotivoRechazo('');
    setErrorRechazo(null);
    setRejectingTx(tx);
  };

  return {
    rejectingTx,
    viewingComprobanteTx,
    comprobanteImgError,
    marcarImagenFallida: () => setComprobanteImgError(true),
    motivoRechazo,
    fijarMotivoRechazo: setMotivoRechazo,
    rechazando,
    errorRechazo,
    actionSuccess,
    actionError,
    pagoPorAprobar,
    aprobando,
    iniciarRechazo: abrirRechazo,
    cerrarRechazo: () => {
      if (rechazando) return;
      setRejectingTx(null);
      setMotivoRechazo('');
      setErrorRechazo(null);
    },
    verComprobante: (tx) => {
      setComprobanteImgError(false);
      setViewingComprobanteTx(tx);
    },
    cerrarVisor: () => setViewingComprobanteTx(null),
    rechazarDesdeVisor: (tx) => {
      setViewingComprobanteTx(null);
      abrirRechazo(tx);
    },
    aprobarDesdeVisor: (tx) => {
      // Error and success never coexist: opening an approval retires both notices.
      limpiarTemporizadorExito();
      setActionSuccess(null);
      setActionError(null);
      setPagoPorAprobar(tx);
      setViewingComprobanteTx(null);
    },
    iniciarAprobacion: (tx) => {
      // Error and success never coexist: opening an approval retires both notices.
      limpiarTemporizadorExito();
      setActionSuccess(null);
      setActionError(null);
      setPagoPorAprobar(tx);
    },
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
    cerrarExito: () => {
      limpiarTemporizadorExito();
      setActionSuccess(null);
    },
  };
}
