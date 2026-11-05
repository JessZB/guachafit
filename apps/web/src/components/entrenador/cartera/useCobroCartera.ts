/**
 * Prompt 73 (Ola 2, módulo `cartera`): estado y registro del cobro directo en efectivo (RN-01).
 *
 * Recorte verbatim de `CarteraPage.tsx:91-97,246-266,268-271,282-345` (clave de idempotencia
 * estable por alumno M5-L1B, validación de monto/fecha, demo local y POST idempotente con
 * mensaje de excedente RF-006 RN-05). Hook de datos: conserva el mecanismo (`apiClient`
 * directo, R9) y no toca JSX.
 */
import { useRef, useState } from 'react';
import { apiClient, generateIdempotencyKey } from '../../../lib/api-client';
import {
  construirPayloadCobroSala,
  errorTrasCambiarFecha,
  normalizarMontoCobro,
  validarFechaCobro,
} from '../../../lib/cobro-sala';
import { mensajeConExcedente } from '../../../lib/saldo-a-favor';
import { esErrorSinPlanAsignado } from '../../../lib/suscripcion-alumno';
import { fechaCalendarioLocal } from '../../../lib/date-format';
import { useFormatoNumero } from '../../../lib/use-formato-numero';
import { DECIMAL_STRING_REGEX, Moneda, type FilaCarteraDTO } from '@guachafit/shared';

export interface EstadoCobro {
  fila: FilaCarteraDTO;
  monto: string;
  moneda: Moneda;
  fechaOperacion: string;
  /**
   * M5-L1B (RNF-002): clave de idempotencia del cobro de este alumno. Se conserva hasta un cobro
   * confirmado (también si se cierra y reabre el modal), así un reintento tras una respuesta
   * perdida no cobra dos veces.
   */
  claveIdempotencia: string;
}

export interface UsoCobroCarteraOpciones {
  isDemoMode: boolean;
  setCobradosDemo: React.Dispatch<React.SetStateAction<string[]>>;
  recargar: () => void;
}

export function useCobroCartera({
  isDemoMode,
  setCobradosDemo,
  recargar,
}: UsoCobroCarteraOpciones) {
  const [cobro, setCobro] = useState<EstadoCobro | null>(null);
  const [enviandoCobro, setEnviandoCobro] = useState(false);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);
  const [cobroSinPlan, setCobroSinPlan] = useState(false);
  /** Claves pendientes por alumno (`alumnoUsuarioId`); se borran al confirmar el cobro. */
  const clavesCobroPendientesRef = useRef(new Map<string, string>());
  const [exitoCobro, setExitoCobro] = useState<string | null>(null);
  const { formatMonto } = useFormatoNumero();

  const claveCobroPendiente = (alumnoUsuarioId: string): string => {
    const pendientes = clavesCobroPendientesRef.current;
    const existente = pendientes.get(alumnoUsuarioId);
    if (existente) return existente;
    const nueva = generateIdempotencyKey();
    pendientes.set(alumnoUsuarioId, nueva);
    return nueva;
  };

  const abrirCobro = (fila: FilaCarteraDTO) => {
    setErrorCobro(null);
    setCobroSinPlan(false);
    setExitoCobro(null);
    setCobro({
      fila,
      monto: fila.saldoPendienteUsd ?? '',
      moneda: Moneda.USD,
      fechaOperacion: fechaCalendarioLocal(),
      claveIdempotencia: claveCobroPendiente(fila.alumnoUsuarioId),
    });
  };

  const cerrarModalCobro = () => setCobro(null);

  const cambiarMonto = (monto: string) =>
    setCobro((actual) => (actual ? { ...actual, monto } : actual));

  // D1 (2026-10-29): cambiar la moneda borra el monto escrito; nunca se convierte en silencio.
  // El error de la moneda anterior deja de ser cierto, salvo el de falta de plan (no depende de ella).
  const cambiarMoneda = (moneda: Moneda) => {
    if (cobro && cobro.moneda !== moneda && !cobroSinPlan) setErrorCobro(null);
    setCobro((actual) => {
      if (!actual || actual.moneda === moneda) return actual;
      return { ...actual, moneda, monto: '' };
    });
  };

  const cambiarFecha = (fechaOperacion: string) => {
    setCobro((actual) => (actual ? { ...actual, fechaOperacion } : actual));
    setErrorCobro(errorTrasCambiarFecha);
  };

  const handleRegistrarCobro = async () => {
    if (!cobro) return;
    // El coach escribe con coma (35,50); la API recibe punto y hasta 2 decimales.
    const montoNormalizado = normalizarMontoCobro(cobro.monto);
    if (!DECIMAL_STRING_REGEX.test(montoNormalizado)) {
      setErrorCobro('Escribe el monto con hasta 2 decimales, por ejemplo 35,50.');
      return;
    }
    if (!(Number(montoNormalizado) > 0)) {
      setErrorCobro('El monto debe ser mayor a 0.00.');
      return;
    }
    const errorFecha = validarFechaCobro(cobro.fechaOperacion, fechaCalendarioLocal());
    if (errorFecha) {
      setErrorCobro(errorFecha);
      return;
    }
    setEnviandoCobro(true);
    setErrorCobro(null);
    setCobroSinPlan(false);

    if (isDemoMode) {
      setCobradosDemo((actuales) =>
        actuales.includes(cobro.fila.alumnoUsuarioId)
          ? actuales
          : [...actuales, cobro.fila.alumnoUsuarioId]
      );
      const montoDemo = formatMonto(montoNormalizado, cobro.moneda === Moneda.VES ? 'VES' : 'USD', {
        conCodigo: true,
      });
      setExitoCobro(
        `Cobro de ${montoDemo} registrado para ${cobro.fila.alumnoNombre} (modo demo). El saldo se actualizó.`
      );
      setEnviandoCobro(false);
      return;
    }

    try {
      const respuesta = await apiClient<{ transaccion?: { excedenteUsd?: string } } | null>(
        `/finanzas/clientes/${cobro.fila.alumnoUsuarioId}/cobro-directo-inteligente`,
        {
          method: 'POST',
          body: JSON.stringify(
            construirPayloadCobroSala({
              monto: montoNormalizado,
              moneda: cobro.moneda,
              hoyLocal: cobro.fechaOperacion,
            })
          ),
          // Clave estable: una nueva tras una respuesta perdida podría cobrar dos veces; la API devuelve el cobro original.
          idempotencyKey: cobro.claveIdempotencia,
        }
      );
      // Cobro confirmado: el próximo cobro de este alumno usará una clave nueva. El mensaje no
      // repite el monto del formulario: un reintento idempotente devuelve el cobro original.
      clavesCobroPendientesRef.current.delete(cobro.fila.alumnoUsuarioId);
      // RF-006 RN-05: si el cobro excedió la deuda, el API dice cuánto quedó a favor.
      setExitoCobro(
        mensajeConExcedente(
          `Cobro registrado y auto-aprobado para ${cobro.fila.alumnoNombre}. El saldo del alumno quedó actualizado.`,
          respuesta?.transaccion?.excedenteUsd
        )
      );
      recargar();
    } catch (err: any) {
      setCobroSinPlan(esErrorSinPlanAsignado(err));
      setErrorCobro(
        err?.message || 'No se pudo registrar el cobro. Revisa los datos e inténtalo de nuevo.'
      );
    } finally {
      setEnviandoCobro(false);
    }
  };

  return {
    cobro,
    enviandoCobro,
    errorCobro,
    cobroSinPlan,
    exitoCobro,
    abrirCobro,
    cerrarModalCobro,
    cambiarMonto,
    cambiarMoneda,
    cambiarFecha,
    handleRegistrarCobro,
  };
}

export type UsoCobroCartera = ReturnType<typeof useCobroCartera>;
