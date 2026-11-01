/**
 * RF-018 · Ajustes del entrenador: tasa de cambio y calculadora USD↔VES (ADR-003).
 *
 * Mismo mecanismo que hoy (R9): `apiClient` + `useState` con carga eager al montar. Sin TanStack.
 * El estado vive en la página (no en la pestaña) para que lo escrito sobreviva al cambio de pestaña.
 *
 * UX-19: los campos se editan como texto con el separador del formato (`38,50`); se validan antes
 * de enviar; los errores de guardado van en `errorGuardado` (sin diálogos nativos) y un guardado
 * en curso no admite otro (`guardandoRef`). La calculadora usa siempre la tasa GUARDADA.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { TasaCambioVigenteDTO } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { triggerHaptic } from '../../../lib/haptics';
import { useFormatoNumero } from '../../../lib/use-formato-numero';
import {
  MENSAJE_ERROR_GUARDAR_TASA,
  MENSAJE_TASA_GUARDADA,
  aTextoEntrada,
  calcularUsdDesdeVes,
  calcularVesDesdeUsd,
  construirPayloadTasa,
  erroresTasa,
  fuenteFormularioDesde,
  hayCambiosTasa,
  normalizarTasa,
  resolverTasaFinal,
  tasaGuardadaDe,
  type EntradasTasa,
  type ErroresTasa,
  type FuenteTasaAjustes,
} from '../../../lib/ajustes-entrenador-tasas';
import { tasaDemo } from '../../../lib/ajustes-entrenador-demo';

/** Dos textos son la misma tasa si ambos son válidos y valen lo mismo. */
function mismaTasa(a: string, b: string): boolean {
  const normalizadaA = normalizarTasa(a);
  const normalizadaB = normalizarTasa(b);
  return normalizadaA !== null && normalizadaB !== null && Number(normalizadaA) === Number(normalizadaB);
}

export function useTasasCambio(isDemoMode: boolean) {
  const { formato } = useFormatoNumero();
  const [tasaVigente, setTasaVigente] = useState<TasaCambioVigenteDTO | null>(null);
  const [isLoadingTasas, setIsLoadingTasas] = useState(true);
  // D2: error honesto de tasas (sin tasa demo fuera del modo demo).
  const [tasasError, setTasasError] = useState<string | null>(null);
  // D6: en sesión real los campos arrancan vacíos; solo el modo demo (y la carga real de una
  // tasa existente) los rellena.
  const [tasaOficialBcvInput, setTasaOficialBcvInput] = useState('');
  const [tasaParaleloInput, setTasaParaleloInput] = useState('');
  const [tasaActivaInput, setTasaActivaInput] = useState('');
  const [fuenteSeleccionada, setFuenteSeleccionada] =
    useState<FuenteTasaAjustes>('oficial_bcv');
  const [erroresCampos, setErroresCampos] = useState<ErroresTasa>({});
  const [isSavingTasa, setIsSavingTasa] = useState(false);
  const [tasaSuccessMsg, setTasaSuccessMsg] = useState<string | null>(null);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  // Guarda síncrona: bloquea un segundo envío aunque el re-render aún no haya llegado.
  const guardandoRef = useRef(false);
  // Fuente que tenía el formulario antes de que escribir en «Tasa activa» la pasara a
  // personalizada: si lo escrito vuelve a coincidir con esa fuente, se restaura.
  const fuenteBaseRef = useRef<FuenteTasaAjustes | null>(null);

  // Calculadora: arranca vacía y convierte con la tasa guardada, nunca con el borrador.
  const [calculadoraUsd, setCalculadoraUsd] = useState('');
  const [calculadoraVes, setCalculadoraVes] = useState('');
  // Una tasa guardada en 0 o ilegible cuenta como «sin tasa» (la calculadora queda sin tasa).
  const tasaGuardada = tasaGuardadaDe(tasaVigente) ?? '';

  /**
   * Fija la tasa vigente y deja los campos y la fuente iguales a lo guardado. Con `null` (la API
   * puede resolver sin cuerpo) no hay tasa: campos vacíos y fuente por defecto.
   */
  const aplicarTasaVigente = useCallback(
    (tasa: TasaCambioVigenteDTO | null) => {
      setTasaVigente(tasa);
      setTasaOficialBcvInput(aTextoEntrada(tasa?.tasaOficialBcv, formato));
      setTasaParaleloInput(aTextoEntrada(tasa?.tasaParalelo, formato));
      setTasaActivaInput(aTextoEntrada(tasa?.tasaActivaEntrenador, formato));
      setFuenteSeleccionada(fuenteFormularioDesde(tasa?.fuente));
      fuenteBaseRef.current = null;
    },
    [formato]
  );

  const cargarTasas = useCallback(async () => {
    setIsLoadingTasas(true);
    setTasasError(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): tasa de ejemplo solo con la bandera activa.
    if (isDemoMode) {
      aplicarTasaVigente(tasaDemo());
      setIsLoadingTasas(false);
      return;
    }

    try {
      const data = await apiClient<TasaCambioVigenteDTO | null>('/finanzas/tasas/vigente');
      // D6: sin tasa configurada la API responde un DTO con las tasas en `null` (o ningún cuerpo):
      // los campos quedan vacíos en vez de conservar defaults ficticios.
      aplicarTasaVigente(data ?? null);
    } catch (err) {
      // D2: sin tasa demo en sesión real; error visible con reintento.
      setTasaVigente(null);
      setTasasError(
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo cargar la tasa vigente. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setIsLoadingTasas(false);
    }
  }, [isDemoMode, aplicarTasaVigente]);

  const guardarTasa = useCallback(async (): Promise<boolean> => {
    if (guardandoRef.current) return false;
    setErrorGuardado(null);
    setTasaSuccessMsg(null);

    const entradas: EntradasTasa = {
      tasaOficialBcv: tasaOficialBcvInput,
      tasaParalelo: tasaParaleloInput,
      tasaActiva: tasaActivaInput,
    };
    const { tasaFinal, tasaActivaSincronizada } = resolverTasaFinal(fuenteSeleccionada, entradas);
    setTasaActivaInput(tasaActivaSincronizada);
    const entradasFinales: EntradasTasa = { ...entradas, tasaActiva: tasaActivaSincronizada };

    const errores = erroresTasa(entradasFinales, fuenteSeleccionada);
    if (Object.keys(errores).length > 0) {
      setErroresCampos(errores);
      return false;
    }
    setErroresCampos({});

    guardandoRef.current = true;
    setIsSavingTasa(true);
    try {
      const res = await apiClient<TasaCambioVigenteDTO | null>('/finanzas/tasas', {
        method: 'PUT',
        body: JSON.stringify(construirPayloadTasa(entradasFinales, tasaFinal, fuenteSeleccionada)),
      });

      // Sin cuerpo no hay nada confirmado: es un error de guardado y se conserva lo escrito.
      if (!res) {
        setErrorGuardado(MENSAJE_ERROR_GUARDAR_TASA);
        return false;
      }

      aplicarTasaVigente(res);
      if (calculadoraUsd.trim() !== '') {
        setCalculadoraVes(
          aTextoEntrada(calcularVesDesdeUsd(tasaGuardadaDe(res) ?? '', calculadoraUsd), formato)
        );
      }
      setTasaSuccessMsg(MENSAJE_TASA_GUARDADA);
      triggerHaptic('success');
      return true;
    } catch (err) {
      setErrorGuardado(err instanceof Error && err.message ? err.message : MENSAJE_ERROR_GUARDAR_TASA);
      return false;
    } finally {
      guardandoRef.current = false;
      setIsSavingTasa(false);
    }
  }, [
    fuenteSeleccionada,
    tasaOficialBcvInput,
    tasaParaleloInput,
    tasaActivaInput,
    calculadoraUsd,
    formato,
    aplicarTasaVigente,
  ]);

  /**
   * Editar un campo o la fuente borra el aviso de éxito, el error de guardado anterior y los
   * errores de esos campos.
   */
  const limpiarAvisosDe = useCallback((...campos: (keyof EntradasTasa)[]) => {
    setTasaSuccessMsg(null);
    setErrorGuardado(null);
    setErroresCampos((prev) => {
      if (campos.every((campo) => prev[campo] === undefined)) return prev;
      const siguiente = { ...prev };
      for (const campo of campos) delete siguiente[campo];
      return siguiente;
    });
  }, []);

  const seleccionarFuente = useCallback(
    (fuente: FuenteTasaAjustes) => {
      triggerHaptic('selection');
      setFuenteSeleccionada(fuente);
      fuenteBaseRef.current = null;
      if (fuente === 'oficial_bcv') setTasaActivaInput(tasaOficialBcvInput);
      if (fuente === 'paralelo') setTasaActivaInput(tasaParaleloInput);
      limpiarAvisosDe('tasaActiva');
    },
    [tasaOficialBcvInput, tasaParaleloInput, limpiarAvisosDe]
  );

  const cambiarTasaOficial = useCallback(
    (valor: string) => {
      setTasaOficialBcvInput(valor);
      if (fuenteSeleccionada === 'oficial_bcv') {
        setTasaActivaInput(valor);
        limpiarAvisosDe('tasaOficialBcv', 'tasaActiva');
      } else {
        limpiarAvisosDe('tasaOficialBcv');
      }
    },
    [fuenteSeleccionada, limpiarAvisosDe]
  );

  const cambiarTasaParalelo = useCallback(
    (valor: string) => {
      setTasaParaleloInput(valor);
      if (fuenteSeleccionada === 'paralelo') {
        setTasaActivaInput(valor);
        limpiarAvisosDe('tasaParalelo', 'tasaActiva');
      } else {
        limpiarAvisosDe('tasaParalelo');
      }
    },
    [fuenteSeleccionada, limpiarAvisosDe]
  );

  const cambiarTasaActiva = useCallback(
    (valor: string) => {
      setTasaActivaInput(valor);
      // Escribir la activa la vuelve personalizada, salvo que vuelva a coincidir con la fuente
      // de la que venía (así deshacer lo escrito deja de contar como cambio).
      const base =
        fuenteBaseRef.current ?? (fuenteSeleccionada === 'manual' ? null : fuenteSeleccionada);
      if (base === null || base === 'manual') {
        setFuenteSeleccionada('manual');
      } else {
        fuenteBaseRef.current = base;
        const referencia = base === 'oficial_bcv' ? tasaOficialBcvInput : tasaParaleloInput;
        setFuenteSeleccionada(mismaTasa(valor, referencia) ? base : 'manual');
      }
      limpiarAvisosDe('tasaActiva');
    },
    [fuenteSeleccionada, tasaOficialBcvInput, tasaParaleloInput, limpiarAvisosDe]
  );

  const cambiarMontoUsd = useCallback(
    (valor: string) => {
      setCalculadoraUsd(valor);
      setCalculadoraVes(
        valor.trim() === '' ? '' : aTextoEntrada(calcularVesDesdeUsd(tasaGuardada, valor), formato)
      );
    },
    [tasaGuardada, formato]
  );

  const cambiarMontoVes = useCallback(
    (valor: string) => {
      setCalculadoraVes(valor);
      if (valor.trim() === '') {
        setCalculadoraUsd('');
        return;
      }
      setCalculadoraUsd((usdPrevio) =>
        aTextoEntrada(calcularUsdDesdeVes(tasaGuardada, valor, usdPrevio), formato) || usdPrevio
      );
    },
    [tasaGuardada, formato]
  );

  const hayCambios = useMemo(
    () =>
      hayCambiosTasa(
        tasaVigente,
        {
          tasaOficialBcv: tasaOficialBcvInput,
          tasaParalelo: tasaParaleloInput,
          tasaActiva: tasaActivaInput,
        },
        fuenteSeleccionada
      ),
    [tasaVigente, tasaOficialBcvInput, tasaParaleloInput, tasaActivaInput, fuenteSeleccionada]
  );

  return {
    tasaVigente,
    isLoadingTasas,
    tasasError,
    tasaOficialBcvInput,
    tasaParaleloInput,
    tasaActivaInput,
    fuenteSeleccionada,
    erroresCampos,
    isSavingTasa,
    tasaSuccessMsg,
    errorGuardado,
    hayCambios,
    calculadoraUsd,
    calculadoraVes,
    cargarTasas,
    guardarTasa,
    seleccionarFuente,
    cambiarTasaOficial,
    cambiarTasaParalelo,
    cambiarTasaActiva,
    cambiarMontoUsd,
    cambiarMontoVes,
  };
}

/** Resultado del hook, para las props de la pestaña. */
export type ResultadoTasasCambio = ReturnType<typeof useTasasCambio>;
