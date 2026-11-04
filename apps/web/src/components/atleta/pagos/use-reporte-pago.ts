/**
 * Hook de estado del reporte de pago del módulo `pagos` (fase B, prompt 54). Movido desde
 * `pages/atleta/PagosPage.tsx`: estado del formulario y envío del reporte con comprobante
 * (D2/ADR-007). El archivo (MIME/5MB, preview) y su subida viven en `use-comprobante-pago.ts`.
 *
 * R9: mismo mecanismo (`apiClient` directo, sin TanStack). Tras el éxito se limpia el mensaje
 * y se vuelve al historial a los 1800 ms; el destino lo decide el contenedor (`alReportarExito`).
 *
 * §6: validación honesta (fecha futura bloqueada con `MENSAJE_FECHA_PAGO_FUTURA`, sin éxito falso
 * D5); MIME/size y referencia se validan antes de la subida. D11: moneda según método (sugerida,
 * editable a mano). D15: al corregir un rechazo se expone el motivo del entrenador. La fecha y
 * `hoyLocal` usan la zona del perfil (ADR-025).
 */
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type RefObject } from 'react';
import { useComprobantePago } from './use-comprobante-pago';
import { MetodoPago, Moneda, MENSAJE_FECHA_PAGO_FUTURA } from '@guachafit/shared';
import type { CuotaDetalleDTO, TasaCambioVigenteDTO, TransaccionPagoDetalleDTO } from '@guachafit/shared';
import { useAuth } from '../../../context/auth-context';
import { apiClient } from '../../../lib/api-client';
import { errorTrasCambiarFecha, validarFechaCobro } from '../../../lib/cobro-sala';
import { fechaCalendarioEnZona } from '../../../lib/zona-horaria';
import { useZonaPerfil } from '../../../lib/use-zona-perfil';
import {
  contravalorUsd as calcularContravalorUsd,
  esErrorEnvioPagoAmbiguo,
  generarClaveIdempotenciaPago,
  MENSAJE_ERROR_RED_AMBIGUO_PAGO,
  monedaSugeridaPorMetodo,
  montoParaEditarPago,
  normalizarMontoPago,
  pagoVesBloqueadoPorFaltaTasa,
  tasaEfectivaNumerica,
  validarMontoPago,
  validarReferenciaPago,
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
  /** Hoy (YYYY-MM-DD) en la zona del perfil: tope del campo fecha. */
  hoyLocal: string;
  alCambiarFecha: (valor: string) => void;
  mostrarErrorFechaFutura: () => void;
  isSubmitting: boolean;
  formSuccess: string | null;
  formError: string | null;
  errorMonto: string | null;
  errorFecha: string | null;
  errorArchivo: string | null;
  errorReferencia: string | null;
  motivoRechazoCorreccion: string | null; // D15: motivo del entrenador al corregir un rechazo
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
  const zonaPerfil = useZonaPerfil();
  const hoyLocal = fechaCalendarioEnZona(zonaPerfil);

  // Form State
  const [metodoPago, setMetodoPagoState] = useState<MetodoPago>(MetodoPago.PAGO_MOVIL);
  const [moneda, setMonedaState] = useState<Moneda>(Moneda.VES);
  const [montoOriginal, setMontoOriginalState] = useState('');
  const [referenciaBancaria, setReferenciaBancariaState] = useState('');
  const [fechaOperacion, setFechaOperacion] = useState(hoyLocal);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Errores por canal (C1, C3, ALU-01, ALU-04, ALU-10)
  const [errorMonto, setErrorMonto] = useState<string | null>(null);
  const [errorFecha, setErrorFecha] = useState<string | null>(null);
  const [errorReferencia, setErrorReferencia] = useState<string | null>(null);
  const [motivoRechazoCorreccion, setMotivoRechazoCorreccion] = useState<string | null>(null);

  // ALU-07 / D8: idempotencia y temporizador seguro
  const idempotencyKeyRef = useRef<string>(generarClaveIdempotenciaPago());
  const temporizadorExitoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVueloRef = useRef(false);
  const montadoRef = useRef(true);

  // Comprobante (RF-007, ADR-007): archivo, preview y subida en caché; al cambiar renueva la clave.
  const {
    fileInputRef,
    selectedFile,
    previewUrl,
    errorArchivo,
    setErrorArchivo,
    handleFileChange,
    handleRemoveFile,
    asegurarComprobanteSubido,
  } = useComprobantePago(() => {
    idempotencyKeyRef.current = generarClaveIdempotenciaPago();
  });

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
    setMonedaState(monedaSugeridaPorMetodo(metodo)); // D11: sugerida, aún editable a mano
    setErrorReferencia(null);
  };

  const setMoneda = (nuevaMoneda: Moneda) => {
    idempotencyKeyRef.current = generarClaveIdempotenciaPago();
    setMonedaState(nuevaMoneda);
  };

  const setReferenciaBancaria = (referencia: string) => {
    idempotencyKeyRef.current = generarClaveIdempotenciaPago();
    setReferenciaBancariaState(referencia);
    setErrorReferencia(null);
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

  const limpiarMensajes = () => {
    setFormError(null);
    setFormSuccess(null);
    setErrorMonto(null);
    setErrorFecha(null);
    setErrorArchivo(null);
    setErrorReferencia(null);
  };

  const iniciarNuevoPago = () => {
    limpiarTemporizadorExito();
    idempotencyKeyRef.current = generarClaveIdempotenciaPago();
    setMetodoPagoState(MetodoPago.PAGO_MOVIL);
    setMonedaState(Moneda.VES);
    setMontoOriginalState('');
    setReferenciaBancariaState('');
    setFechaOperacion(fechaCalendarioEnZona(zonaPerfil));
    setMotivoRechazoCorreccion(null);
    limpiarMensajes();
    handleRemoveFile();
  };

  const iniciarCorreccionPago = (tx: TransaccionPagoDetalleDTO) => {
    limpiarTemporizadorExito();
    idempotencyKeyRef.current = generarClaveIdempotenciaPago();
    setMetodoPagoState(tx.metodoPago);
    setMonedaState(tx.monedaOriginal);
    setMontoOriginalState(montoParaEditarPago(tx.montoOriginal));
    setReferenciaBancariaState(tx.referenciaBancaria ?? '');
    setFechaOperacion((tx.fechaOperacion || '').slice(0, 10));
    setMotivoRechazoCorreccion(tx.motivoRechazo?.trim() || null);
    limpiarMensajes();
    handleRemoveFile();
  };

  const handleReportarPago = async (e: FormEvent) => {
    e.preventDefault();
    if (enVueloRef.current || pagoVesSinTasa) {
      return;
    }
    setFormError(null);

    // RF-007: un pago de días anteriores se puede reportar; uno con fecha futura no.
    const errFecha = validarFechaCobro(fechaOperacion, fechaCalendarioEnZona(zonaPerfil));
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

    const errReferencia = validarReferenciaPago(metodoPago, referenciaBancaria);
    setErrorReferencia(errReferencia);
    if (errReferencia) return;

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
      try {
        finalStorageKey = await asegurarComprobanteSubido(user?.id);
      } catch (err: any) {
        setFormError(err.message);
        enVueloRef.current = false;
        setIsSubmitting(false);
        return;
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
          referenciaBancaria: referenciaBancaria.trim() || undefined,
          fechaOperacion,
          comprobanteStorageKey: finalStorageKey,
        }),
      });

      setFormSuccess('¡Pago reportado con éxito! Tu entrenador lo revisará pronto.');
      idempotencyKeyRef.current = generarClaveIdempotenciaPago();
      setMontoOriginalState('');
      setReferenciaBancariaState('');
      setMotivoRechazoCorreccion(null);
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
    hoyLocal,
    alCambiarFecha,
    mostrarErrorFechaFutura,
    isSubmitting,
    formSuccess,
    formError,
    errorMonto,
    errorFecha,
    errorArchivo,
    errorReferencia,
    motivoRechazoCorreccion,
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
