/**
 * Hook de estado del reporte de pago del módulo `pagos` (fase B, prompt 54).
 *
 * Movido tal cual desde `pages/atleta/PagosPage.tsx` (form state L204–228,
 * archivo L419–448, submit L450–523): estado del formulario, validación de
 * archivo (MIME/5MB + preview) y envío del reporte con comprobante (D2/ADR-007).
 *
 * R9: mismo mecanismo (`apiClient` directo, sin TanStack). La transición
 * post-éxito (limpiar éxito + volver al historial a los 1800 ms) se conserva;
 * el destino lo decide el contenedor vía `alReportarExito`.
 *
 * §6: validación honesta (fecha futura bloqueada con `MENSAJE_FECHA_PAGO_FUTURA`,
 * sin éxito falso D5) y MIME/size validados antes de preparar la subida.
 */
import { useRef, useState, type ChangeEvent, type FormEvent, type RefObject } from 'react';
import { MetodoPago, Moneda, MENSAJE_FECHA_PAGO_FUTURA } from '@guachafit/shared';
import type { CuotaDetalleDTO, TasaCambioVigenteDTO } from '@guachafit/shared';
import { useAuth } from '../../../context/auth-context';
import { apiClient } from '../../../lib/api-client';
import { errorTrasCambiarFecha, validarFechaCobro } from '../../../lib/cobro-sala';
import { prepararComprobanteParaSubida, subirComprobantePago } from '../../../lib/comprobante-pago';
import { fechaCalendarioLocal } from '../../../lib/date-format';
import {
  contravalorUsd as calcularContravalorUsd,
  pagoVesBloqueadoPorFaltaTasa,
  tasaEfectivaNumerica,
} from '../../../lib/pagos-montos';

export interface OpcionesReportePago {
  cuota: CuotaDetalleDTO | null;
  tasa: TasaCambioVigenteDTO | null;
  tasaError: boolean;
  /** El contenedor decide el destino tras el éxito (la vista vuelve al historial). */
  alReportarExito: () => void;
}

export interface EstadoReportePago {
  metodoPago: MetodoPago;
  setMetodoPago: (metodo: MetodoPago) => void;
  moneda: Moneda;
  setMoneda: (moneda: Moneda) => void;
  montoOriginal: string;
  setMontoOriginal: (monto: string) => void;
  referenciaBancaria: string;
  setReferenciaBancaria: (referencia: string) => void;
  fechaOperacion: string;
  alCambiarFecha: (valor: string) => void;
  mostrarErrorFechaFutura: () => void;
  isSubmitting: boolean;
  formSuccess: string | null;
  formError: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  selectedFile: File | null;
  previewUrl: string | null;
  handleFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleRemoveFile: () => void;
  handleReportarPago: (e: FormEvent) => void;
  pagoVesSinTasa: boolean;
  contravalorUsd: string;
}

export function useReportePago({
  cuota,
  tasa,
  tasaError,
  alReportarExito,
}: OpcionesReportePago): EstadoReportePago {
  const { user } = useAuth();

  // Form State
  const [metodoPago, setMetodoPago] = useState<MetodoPago>(MetodoPago.PAGO_MOVIL);
  const [moneda, setMoneda] = useState<Moneda>(Moneda.VES);
  const [montoOriginal, setMontoOriginal] = useState('1300.00');
  const [referenciaBancaria, setReferenciaBancaria] = useState('');
  const [fechaOperacion, setFechaOperacion] = useState(fechaCalendarioLocal);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // File Upload State (RF-007, ADR-007)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const pagoVesSinTasa = pagoVesBloqueadoPorFaltaTasa(moneda, tasa?.tasaEfectiva, tasaError);
  const contravalorUsd = calcularContravalorUsd(
    moneda,
    montoOriginal,
    tasaEfectivaNumerica(tasa?.tasaEfectiva)
  );

  const alCambiarFecha = (valor: string) => {
    setFechaOperacion(valor);
    setFormError(errorTrasCambiarFecha);
  };

  // Hallazgo 6 (contrato 9): el navegador bloquea la fecha futura por `max`; se muestra
  // el mensaje propio en lugar de su burbuja (los demás campos conservan la validación nativa).
  const mostrarErrorFechaFutura = () => {
    setFormError(MENSAJE_FECHA_PAGO_FUTURA);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Formato inválido. Por favor selecciona una imagen JPG, PNG o WebP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFormError('El archivo excede el límite máximo de 5 MB.');
      return;
    }

    setFormError(null);
    setSelectedFile(file);
    const objUrl = URL.createObjectURL(file);
    setPreviewUrl(objUrl);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleReportarPago = async (e: FormEvent) => {
    e.preventDefault();
    // RF-007: un pago de días anteriores se puede reportar; uno con fecha futura no.
    const errorFecha = validarFechaCobro(fechaOperacion, fechaCalendarioLocal());
    if (errorFecha) {
      setFormError(errorFecha);
      return;
    }
    setIsSubmitting(true);
    setFormError(null);

    let finalStorageKey: string | undefined = undefined;

    if (selectedFile) {
      if (!user?.id) {
        setFormError(
          'No se pudo identificar tu sesión. Vuelve a iniciar sesión e inténtalo de nuevo.'
        );
        setIsSubmitting(false);
        return;
      }
      try {
        // D2/ADR-007: la imagen se prepara (WebP/JPEG) ANTES de firmar; la presign y el PUT llevan
        // el MISMO MIME y la subida solo se da por buena con `respuesta.ok`. Sin clave no hay reporte.
        const archivoPreparado = await prepararComprobanteParaSubida(selectedFile);
        finalStorageKey = await subirComprobantePago(archivoPreparado, user.id, {
          apiClient,
          fetchFn: fetch,
        });
      } catch (err: any) {
        // D2: sin storageKey fabricado; si el comprobante no se pudo subir, el reporte no se envía.
        setFormError(
          err?.message ||
            'No se pudo subir el comprobante. Revisa tu conexión e inténtalo de nuevo.'
        );
        setIsSubmitting(false);
        return;
      }
    }

    if (!cuota) {
      setFormError('No tienes una cuota vigente para reportar el pago. Contacta a tu coach.');
      setIsSubmitting(false);
      return;
    }

    try {
      await apiClient(`/finanzas/cuotas/${cuota.id}/reportar-pago`, {
        method: 'POST',
        body: JSON.stringify({
          montoOriginal,
          monedaOriginal: moneda,
          metodoPago,
          referenciaBancaria: referenciaBancaria || undefined,
          fechaOperacion,
          comprobanteStorageKey: finalStorageKey,
        }),
      });

      setFormSuccess('¡Pago reportado con éxito! Tu coach lo validará en la bandeja.');
      handleRemoveFile();
      setTimeout(() => {
        setFormSuccess(null);
        alReportarExito();
      }, 1800);
    } catch (err: any) {
      // D5: sin éxito falso; el pago solo queda reportado si el servidor lo aceptó.
      setFormError(
        err?.message || 'No se pudo reportar el pago. Revisa los datos e inténtalo de nuevo.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    metodoPago,
    setMetodoPago,
    moneda,
    setMoneda,
    montoOriginal,
    setMontoOriginal,
    referenciaBancaria,
    setReferenciaBancaria,
    fechaOperacion,
    alCambiarFecha,
    mostrarErrorFechaFutura,
    isSubmitting,
    formSuccess,
    formError,
    fileInputRef,
    selectedFile,
    previewUrl,
    handleFileChange,
    handleRemoveFile,
    handleReportarPago,
    pagoVesSinTasa,
    contravalorUsd,
  };
}
