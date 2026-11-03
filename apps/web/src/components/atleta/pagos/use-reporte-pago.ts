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
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type RefObject } from 'react';
import { MetodoPago, Moneda, MENSAJE_FECHA_PAGO_FUTURA } from '@guachafit/shared';
import type { CuotaDetalleDTO, TasaCambioVigenteDTO, TransaccionPagoDetalleDTO } from '@guachafit/shared';
import { useAuth } from '../../../context/auth-context';
import { apiClient } from '../../../lib/api-client';
import { errorTrasCambiarFecha, validarFechaCobro } from '../../../lib/cobro-sala';
import { prepararComprobanteParaSubida, subirComprobantePago } from '../../../lib/comprobante-pago';
import { fechaCalendarioLocal } from '../../../lib/date-format';
import {
  contravalorUsd as calcularContravalorUsd,
  esErrorEnvioPagoAmbiguo,
  generarClaveIdempotenciaPago,
  MENSAJE_ERROR_RED_AMBIGUO_PAGO,
  normalizarMontoPago,
  pagoVesBloqueadoPorFaltaTasa,
  tasaEfectivaNumerica,
  validarMontoPago,
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
  errorMonto: string | null;
  errorFecha: string | null;
  errorArchivo: string | null;
  iniciarNuevoPago: () => void;
  iniciarCorreccionPago: (tx: TransaccionPagoDetalleDTO) => void;
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
  const [metodoPago, setMetodoPagoState] = useState<MetodoPago>(MetodoPago.PAGO_MOVIL);
  const [moneda, setMonedaState] = useState<Moneda>(Moneda.VES);
  const [montoOriginal, setMontoOriginalState] = useState('');
  const [referenciaBancaria, setReferenciaBancariaState] = useState('');
  const [fechaOperacion, setFechaOperacion] = useState(fechaCalendarioLocal);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Errores por canal (C1, C3, ALU-01, ALU-04, ALU-10)
  const [errorMonto, setErrorMonto] = useState<string | null>(null);
  const [errorFecha, setErrorFecha] = useState<string | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);

  // File Upload State (RF-007, ADR-007)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ALU-07 / D8: idempotencia, comprobante en caché y temporizador seguro
  const comprobanteSubidoKeyRef = useRef<string | null>(null);
  const idempotencyKeyRef = useRef<string>(generarClaveIdempotenciaPago());
  const temporizadorExitoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVueloRef = useRef(false);
  const montadoRef = useRef(true);

  const limpiarTemporizadorExito = () => {
    if (temporizadorExitoRef.current !== null) {
      clearTimeout(temporizadorExitoRef.current);
      temporizadorExitoRef.current = null;
    }
  };

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      limpiarTemporizadorExito();
    };
  }, []);

  const pagoVesSinTasa = pagoVesBloqueadoPorFaltaTasa(moneda, tasa?.tasaEfectiva, tasaError);
  const contravalorUsd = calcularContravalorUsd(
    moneda,
    montoOriginal,
    tasaEfectivaNumerica(tasa?.tasaEfectiva)
  );

  // F3: renovar idempotencyKeyRef cuando el usuario edita datos del pago
  const setMetodoPago = (metodo: MetodoPago) => {
    idempotencyKeyRef.current = generarClaveIdempotenciaPago();
    setMetodoPagoState(metodo);
  };

  const setMoneda = (nuevaMoneda: Moneda) => {
    idempotencyKeyRef.current = generarClaveIdempotenciaPago();
    setMonedaState(nuevaMoneda);
  };

  const setReferenciaBancaria = (referencia: string) => {
    idempotencyKeyRef.current = generarClaveIdempotenciaPago();
    setReferenciaBancariaState(referencia);
  };

  const setMontoOriginal = (monto: string) => {
    idempotencyKeyRef.current = generarClaveIdempotenciaPago();
    setMontoOriginalState(monto);
    setErrorMonto(null);
    setFormError(null);
  };

  const alCambiarFecha = (valor: string) => {
    idempotencyKeyRef.current = generarClaveIdempotenciaPago();
    setFechaOperacion(valor);
    setErrorFecha((prev) => errorTrasCambiarFecha(prev));
    setFormError((prev) => errorTrasCambiarFecha(prev));
  };

  // Hallazgo 6 (contrato 9): el navegador bloquea la fecha futura por `max`; se muestra
  // el mensaje propio en errorFecha en lugar de su burbuja (no duplicar en formError).
  const mostrarErrorFechaFutura = () => {
    setErrorFecha(MENSAJE_FECHA_PAGO_FUTURA);
  };

  const handleRemoveFile = () => {
    idempotencyKeyRef.current = generarClaveIdempotenciaPago();
    comprobanteSubidoKeyRef.current = null;
    setSelectedFile(null);
    setErrorArchivo(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    comprobanteSubidoKeyRef.current = null;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      handleRemoveFile();
      setErrorArchivo('Formato inválido. Por favor selecciona una imagen JPG, PNG o WebP.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      handleRemoveFile();
      setErrorArchivo('El archivo excede el límite máximo de 5 MB.');
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setErrorArchivo(null);
    idempotencyKeyRef.current = generarClaveIdempotenciaPago();
    setSelectedFile(file);
    const objUrl = URL.createObjectURL(file);
    setPreviewUrl(objUrl);
  };

  const iniciarNuevoPago = () => {
    limpiarTemporizadorExito();
    idempotencyKeyRef.current = generarClaveIdempotenciaPago();
    setMetodoPagoState(MetodoPago.PAGO_MOVIL);
    setMonedaState(Moneda.VES);
    setMontoOriginalState('');
    setReferenciaBancariaState('');
    setFechaOperacion(fechaCalendarioLocal());
    setFormError(null);
    setFormSuccess(null);
    setErrorMonto(null);
    setErrorFecha(null);
    setErrorArchivo(null);
    handleRemoveFile();
  };

  const iniciarCorreccionPago = (tx: TransaccionPagoDetalleDTO) => {
    limpiarTemporizadorExito();
    idempotencyKeyRef.current = generarClaveIdempotenciaPago();
    setMetodoPagoState(tx.metodoPago);
    setMonedaState(tx.monedaOriginal);
    setMontoOriginalState(tx.montoOriginal);
    setReferenciaBancariaState(tx.referenciaBancaria ?? '');
    setFechaOperacion((tx.fechaOperacion || '').slice(0, 10));
    setFormError(null);
    setFormSuccess(null);
    setErrorMonto(null);
    setErrorFecha(null);
    setErrorArchivo(null);
    handleRemoveFile();
  };

  const handleReportarPago = async (e: FormEvent) => {
    e.preventDefault();
    if (enVueloRef.current || pagoVesSinTasa) {
      return;
    }
    setFormError(null);

    // RF-007: un pago de días anteriores se puede reportar; uno con fecha futura no.
    const errFecha = validarFechaCobro(fechaOperacion, fechaCalendarioLocal());
    if (errFecha) {
      setErrorFecha(errFecha);
      return;
    }
    setErrorFecha(null);

    // ALU-01: validación honesta del monto pagado > 0
    const errMonto = validarMontoPago(montoOriginal);
    if (errMonto) {
      setErrorMonto(errMonto);
      return;
    }
    setErrorMonto(null);

    if (errorArchivo) {
      return;
    }

    if (!cuota) {
      setFormError('No tienes una cuota vigente para reportar el pago. Contacta a tu entrenador.');
      return;
    }

    enVueloRef.current = true;
    setIsSubmitting(true);

    let finalStorageKey: string | undefined = undefined;

    if (selectedFile) {
      if (comprobanteSubidoKeyRef.current) {
        finalStorageKey = comprobanteSubidoKeyRef.current;
      } else {
        if (!user?.id) {
          setFormError(
            'No se pudo identificar tu sesión. Vuelve a iniciar sesión e inténtalo de nuevo.'
          );
          enVueloRef.current = false;
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
          comprobanteSubidoKeyRef.current = finalStorageKey;
        } catch (err: any) {
          // D2: sin storageKey fabricado; si el comprobante no se pudo subir, el reporte no se envía.
          setFormError(
            err?.message ||
              'No se pudo subir el comprobante. Revisa tu conexión e inténtalo de nuevo.'
          );
          enVueloRef.current = false;
          setIsSubmitting(false);
          return;
        }
      }
    }

    try {
      const claveIdempotencia = idempotencyKeyRef.current;
      await apiClient(`/finanzas/cuotas/${cuota.id}/reportar-pago`, {
        method: 'POST',
        idempotencyKey: claveIdempotencia,
        body: JSON.stringify({
          idempotencyKey: claveIdempotencia,
          montoOriginal: normalizarMontoPago(montoOriginal),
          monedaOriginal: moneda,
          metodoPago,
          referenciaBancaria: referenciaBancaria || undefined,
          fechaOperacion,
          comprobanteStorageKey: finalStorageKey,
        }),
      });

      setFormSuccess('¡Pago reportado con éxito! Tu entrenador lo revisará pronto.');
      idempotencyKeyRef.current = generarClaveIdempotenciaPago();
      setMontoOriginalState('');
      setReferenciaBancariaState('');
      handleRemoveFile();
      limpiarTemporizadorExito();
      if (montadoRef.current) {
        temporizadorExitoRef.current = setTimeout(() => {
          temporizadorExitoRef.current = null;
          setFormSuccess(null);
          alReportarExito();
        }, 1800);
      }
    } catch (err: any) {
      // D5 / ALU-07c: sin éxito falso; distingue error ambiguo de red de rechazo determinista.
      if (esErrorEnvioPagoAmbiguo(err)) {
        setFormError(MENSAJE_ERROR_RED_AMBIGUO_PAGO);
      } else {
        setFormError(
          err?.message || 'No se pudo reportar el pago. Revisa los datos e inténtalo de nuevo.'
        );
      }
    } finally {
      enVueloRef.current = false;
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
    errorMonto,
    errorFecha,
    errorArchivo,
    iniciarNuevoPago,
    iniciarCorreccionPago,
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
