/**
 * Hook del cobro directo inteligente en sala (M5-L1B RNF-002, RF-006 RN-05, RF-007/RF-009).
 *
 * Mismo mecanismo que hoy (`apiClient` + estado local; R9). Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-7).
 *
 * La clave de idempotencia se renueva SOLO tras un cobro confirmado: si la respuesta se
 * perdió, cerrar y reabrir el modal reintenta con la misma clave y la API no cobra dos veces.
 */
import { useEffect, useRef, useState } from 'react';
import { Moneda, type TasaCambioVigenteDTO } from '@guachafit/shared';
import { apiClient, generateIdempotencyKey } from '../../../lib/api-client';
import { fechaCalendarioLocal } from '../../../lib/date-format';
import {
  construirPayloadCobroSala,
  errorTrasCambiarFecha,
  validarFechaCobro,
} from '../../../lib/cobro-sala';
import { MENSAJE_FECHA_PAGO_FUTURA } from '@guachafit/shared';
import { mensajeConExcedente } from '../../../lib/saldo-a-favor';
import { esErrorSinPlanAsignado } from '../../../lib/suscripcion-alumno';

export interface ParametrosCobroSala {
  alumnoId: string | undefined;
  isDemoMode: boolean;
  usuarioId: string | undefined;
  /** Recarga el expediente tras un cobro confirmado (el modal se cierra solo). */
  onCobroConfirmado: () => Promise<void>;
  /** WU-J (RF-005): entradas para precargar el precio efectivo (override > plan del catálogo). */
  precioOverrideVigente?: string | null;
  selectedPlanId?: string;
  planesCatalogo?: Array<{ id: string; precioBaseUsd: string }>;
  planActivoId?: string | null;
}

export function useCobroSala({
  alumnoId,
  isDemoMode,
  usuarioId,
  onCobroConfirmado,
  precioOverrideVigente,
  selectedPlanId,
  planesCatalogo,
  planActivoId,
}: ParametrosCobroSala) {
  // Cobro Directo Modal State
  const [isCobroModalOpen, setIsCobroModalOpen] = useState(false);
  const [cobroMonto, setCobroMonto] = useState('40.00');
  const [cobroMoneda, setCobroMoneda] = useState<Moneda>(Moneda.USD);
  // RF-007/RF-009: el cobro admite fechas anteriores (hoy por defecto y como máximo).
  const [cobroFecha, setCobroFecha] = useState(() => fechaCalendarioLocal());
  // Tasa con la que se convertirá un cobro en bolívares (la vigente del alumno al registrar).
  const [tasaCobro, setTasaCobro] = useState<string | null>(null);
  const [cobroNotas, setCobroNotas] = useState('');
  // M5-L1B (RNF-002): clave de idempotencia del cobro en sala de este alumno.
  // La clave se renueva SOLO tras un cobro confirmado: si la respuesta se perdió, cerrar y
  // reabrir el modal reintenta con la misma clave y la API no cobra dos veces.
  const [claveCobro, setClaveCobro] = useState(() => generateIdempotencyKey());
  const temporizadorCobroRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cobroSinPlan, setCobroSinPlan] = useState(false);
  const [isSubmittingCobro, setIsSubmittingCobro] = useState(false);
  const [cobroSuccessMsg, setCobroSuccessMsg] = useState<string | null>(null);
  const [cobroErrorMsg, setCobroErrorMsg] = useState<string | null>(null);

  // M5-L1B: el cierre automático del modal de cobro no dispara tras salir de la ficha.
  useEffect(
    () => () => {
      if (temporizadorCobroRef.current) clearTimeout(temporizadorCobroRef.current);
    },
    []
  );

  // Al abrir el cobro en sala: hoy como fecha por defecto y la tasa vigente del alumno (sin demo).
  useEffect(() => {
    if (!isCobroModalOpen) return;
    setCobroFecha(fechaCalendarioLocal());
    if (isDemoMode || !usuarioId) {
      setTasaCobro(null);
      return;
    }
    let vigente = true;
    apiClient<TasaCambioVigenteDTO>(`/finanzas/tasas/vigente?clienteId=${usuarioId}`)
      .then((tasa) => {
        if (vigente) setTasaCobro(tasa?.tasaEfectiva ?? null);
      })
      .catch(() => {
        if (vigente) setTasaCobro(null);
      });
    return () => {
      vigente = false;
    };
  }, [isCobroModalOpen, isDemoMode, usuarioId]);

  /** Abre el modal precargando el precio efectivo (override > plan del catálogo) para
   * que el cobro en sala coincida con la deuda que el servidor emite. */
  const abrirCobro = () => {
    const precioEfectivo =
      precioOverrideVigente ??
      planesCatalogo?.find((pl) => pl.id === selectedPlanId)?.precioBaseUsd ??
      planesCatalogo?.find((pl) => pl.id === planActivoId)?.precioBaseUsd;
    if (precioEfectivo) setCobroMonto(precioEfectivo);
    if (temporizadorCobroRef.current) clearTimeout(temporizadorCobroRef.current);
    setCobroSuccessMsg(null);
    setCobroErrorMsg(null);
    setCobroSinPlan(false);
    setIsCobroModalOpen(true);
  };

  /** Al cambiar la fecha, un error que hablaba de la fecha deja de ser cierto: se borra. */
  const cambiarFechaCobro = (valor: string) => {
    setCobroFecha(valor);
    setCobroErrorMsg(errorTrasCambiarFecha);
  };

  /** El navegador bloquea la fecha futura por `max`: se muestra nuestro mensaje en lugar de
   * su burbuja (los demás campos conservan la validación nativa). */
  const manejarFechaInvalida = (e: React.FormEvent<HTMLInputElement>) => {
    if (!e.currentTarget.validity.rangeOverflow) return;
    e.preventDefault();
    setCobroErrorMsg(MENSAJE_FECHA_PAGO_FUTURA);
  };

  // Enviar Cobro Directo Inteligente en Sala
  const registrarCobro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alumnoId) return;
    const errorFecha = validarFechaCobro(cobroFecha, fechaCalendarioLocal());
    if (errorFecha) {
      setCobroErrorMsg(errorFecha);
      return;
    }
    setIsSubmittingCobro(true);
    setCobroSuccessMsg(null);
    setCobroErrorMsg(null);
    setCobroSinPlan(false);

    // M5-L1B: solo efectivo (método según la moneda) y la fecha elegida (día LOCAL, hoy o anterior).
    const payload = construirPayloadCobroSala({
      monto: cobroMonto,
      moneda: cobroMoneda,
      notas: cobroNotas,
      hoyLocal: cobroFecha,
    });

    // MODO DEMO EXPLÍCITO: sin llamadas reales; el éxito dice que es una demostración.
    if (isDemoMode) {
      setCobroSuccessMsg(
        `Cobro de ${payload.montoOriginal} ${payload.monedaOriginal} registrado (demo): no se envió nada al servidor.`
      );
      setIsSubmittingCobro(false);
      temporizadorCobroRef.current = setTimeout(() => {
        setIsCobroModalOpen(false);
        setCobroSuccessMsg(null);
      }, 1500);
      return;
    }

    try {
      const respuesta = await apiClient.post<{ transaccion?: { excedenteUsd?: string } } | null>(
        `/finanzas/clientes/${alumnoId}/cobro-directo-inteligente`,
        payload,
        { idempotencyKey: claveCobro }
      );
      // RF-006 RN-05: si el cobro excedió la deuda, el API dice cuánto quedó a favor.
      setCobroSuccessMsg(
        mensajeConExcedente(
          'Cobro directo registrado y liquidado con éxito.',
          respuesta?.transaccion?.excedenteUsd
        )
      );
      // Cobro confirmado: el siguiente cobro de este alumno usará una clave nueva.
      setClaveCobro(generateIdempotencyKey());
      temporizadorCobroRef.current = setTimeout(() => {
        temporizadorCobroRef.current = null;
        setIsCobroModalOpen(false);
        setCobroSuccessMsg(null);
        void onCobroConfirmado();
      }, 1500);
    } catch (err: unknown) {
      // D5: sin éxito falso ni transacción optimista; el cobro solo existe si el server lo aceptó.
      setCobroSinPlan(esErrorSinPlanAsignado(err));
      setCobroErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo registrar el cobro. Verifica los datos e inténtalo de nuevo.'
      );
    } finally {
      setIsSubmittingCobro(false);
    }
  };

  return {
    isCobroModalOpen,
    setIsCobroModalOpen,
    cobroMonto,
    setCobroMonto,
    cobroMoneda,
    setCobroMoneda,
    cobroFecha,
    setCobroFecha,
    tasaCobro,
    cobroNotas,
    setCobroNotas,
    cobroSinPlan,
    isSubmittingCobro,
    cobroSuccessMsg,
    setCobroSuccessMsg,
    cobroErrorMsg,
    setCobroErrorMsg,
    abrirCobro,
    cambiarFechaCobro,
    manejarFechaInvalida,
    registrarCobro,
  };
}

export type RetornoCobroSala = ReturnType<typeof useCobroSala>;
