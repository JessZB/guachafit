/**
 * Hook de reversión de un pago aprobado por error (RF-007, motivo obligatorio).
 *
 * Mismo mecanismo que hoy (`apiClient` + estado local; R9). Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-4). Tras revertir, recarga la página vigente
 * del historial mediante el callback recibido (el conteo lo posee el otro hook).
 */
import { useState } from 'react';
import { apiClient } from '../../../lib/api-client';

export interface PagoPorRevertir {
  id: string;
  montoUsd: string;
  metodoPago: string;
  referencia?: string;
}

export interface ParametrosReversionPago {
  recargarTransacciones: () => Promise<void>;
}

export function useReversionPago({ recargarTransacciones }: ParametrosReversionPago) {
  // RF-007: reversión de un pago aprobado por error (motivo obligatorio).
  const [pagoPorRevertir, setPagoPorRevertir] = useState<PagoPorRevertir | null>(null);
  const [motivoReversion, setMotivoReversion] = useState('');
  const [revirtiendo, setRevirtiendo] = useState(false);
  const [errorReversion, setErrorReversion] = useState<string | null>(null);
  const [reversionExitoMsg, setReversionExitoMsg] = useState<string | null>(null);

  const solicitarReversion = (pago: PagoPorRevertir) => {
    setPagoPorRevertir(pago);
    setMotivoReversion('');
    setErrorReversion(null);
    setReversionExitoMsg(null);
  };

  const cancelarReversion = () => {
    setPagoPorRevertir(null);
    setMotivoReversion('');
    setErrorReversion(null);
  };

  const confirmarReversion = async () => {
    if (!pagoPorRevertir || !motivoReversion.trim() || revirtiendo) return;
    setRevirtiendo(true);
    setErrorReversion(null);
    try {
      const respuesta = await apiClient.post<{ mensaje?: string } | null>(
        `/finanzas/transacciones/${pagoPorRevertir.id}/revertir`,
        { motivo: motivoReversion.trim() }
      );
      setReversionExitoMsg(respuesta?.mensaje ?? 'Pago revertido.');
      setPagoPorRevertir(null);
      setMotivoReversion('');
      await recargarTransacciones();
    } catch (err: unknown) {
      // El diálogo sigue abierto: p. ej. el saldo a favor que generó ya se gastó (409).
      setErrorReversion(
        err instanceof Error
          ? err.message
          : 'No se pudo revertir el pago. Inténtalo de nuevo en unos minutos.'
      );
    } finally {
      setRevirtiendo(false);
    }
  };

  return {
    pagoPorRevertir,
    motivoReversion,
    setMotivoReversion,
    revirtiendo,
    errorReversion,
    reversionExitoMsg,
    solicitarReversion,
    cancelarReversion,
    confirmarReversion,
  };
}

export type RetornoReversionPago = ReturnType<typeof useReversionPago>;
