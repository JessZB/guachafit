/**
 * RF-018 · Ajustes del entrenador: tasa de cambio y conversor USD↔VES (ADR-003).
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx:104-125,177-240,348-384`.
 * Mismo mecanismo que hoy (R9): `apiClient` + `useState` con carga eager al montar.
 * Sin TanStack.
 */
import { useCallback, useState } from 'react';
import type { TasaCambioVigenteDTO } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { triggerHaptic } from '../../../lib/haptics';
import {
  calcularUsdDesdeVes,
  calcularVesDesdeUsd,
  construirPayloadTasa,
  resolverTasaFinal,
  type FuenteTasaAjustes,
} from '../../../lib/ajustes-entrenador-tasas';
import { tasaDemo } from '../../../lib/ajustes-entrenador-demo';

export type { FuenteTasaAjustes };

export function useTasasCambio(isDemoMode: boolean) {
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
  const [isSavingTasa, setIsSavingTasa] = useState(false);
  const [tasaSuccessMsg, setTasaSuccessMsg] = useState<string | null>(null);

  // Conversor interactivo rápido
  const [calculadoraUsd, setCalculadoraUsd] = useState('40.00');
  const [calculadoraVes, setCalculadoraVes] = useState('');

  const cargarTasas = useCallback(async () => {
    setIsLoadingTasas(true);
    setTasasError(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): tasa de ejemplo solo con la bandera activa.
    if (isDemoMode) {
      const demo = tasaDemo();
      setTasaVigente(demo);
      setTasaOficialBcvInput(demo.tasaOficialBcv ?? '');
      setTasaParaleloInput(demo.tasaParalelo ?? '');
      setTasaActivaInput(demo.tasaActivaEntrenador ?? '');
      setCalculadoraVes(calcularVesDesdeUsd(demo.tasaEfectiva ?? '', calculadoraUsd));
      setIsLoadingTasas(false);
      return;
    }

    try {
      const data = await apiClient<TasaCambioVigenteDTO>('/finanzas/tasas/vigente');
      setTasaVigente(data);
      // D6: la API devuelve `null` cuando no hay tasa configurada; se limpian los campos en vez
      // de conservar defaults ficticios.
      setTasaOficialBcvInput(data.tasaOficialBcv ?? '');
      setTasaParaleloInput(data.tasaParalelo ?? '');
      setTasaActivaInput(data.tasaActivaEntrenador ?? '');
      if (data.tasaEfectiva) {
        setCalculadoraVes(calcularVesDesdeUsd(data.tasaEfectiva, calculadoraUsd));
      } else {
        setCalculadoraVes('');
      }
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
  }, [isDemoMode, calculadoraUsd]);

  const guardarTasa = useCallback(async (): Promise<boolean> => {
    setIsSavingTasa(true);
    setTasaSuccessMsg(null);
    try {
      const { tasaFinal, tasaActivaSincronizada } = resolverTasaFinal(fuenteSeleccionada, {
        tasaOficialBcv: tasaOficialBcvInput,
        tasaParalelo: tasaParaleloInput,
        tasaActiva: tasaActivaInput,
      });
      setTasaActivaInput(tasaActivaSincronizada);

      const res = await apiClient<TasaCambioVigenteDTO>('/finanzas/tasas', {
        method: 'PUT',
        body: JSON.stringify(
          construirPayloadTasa(
            {
              tasaOficialBcv: tasaOficialBcvInput,
              tasaParalelo: tasaParaleloInput,
              tasaActiva: tasaActivaInput,
            },
            tasaFinal,
            fuenteSeleccionada
          )
        ),
      });

      setTasaVigente(res);
      setCalculadoraVes(calcularVesDesdeUsd(res.tasaEfectiva ?? '', calculadoraUsd));
      setTasaSuccessMsg('Tasa activa guardada. Se aplicará a todos los cobros y cuotas de tus alumnos.');
      triggerHaptic('success');
      return true;
    } catch (err) {
      alert(
        err instanceof Error && err.message ? err.message : 'Error al actualizar la tasa de cambio'
      );
      return false;
    } finally {
      setIsSavingTasa(false);
    }
  }, [fuenteSeleccionada, tasaOficialBcvInput, tasaParaleloInput, tasaActivaInput, calculadoraUsd]);

  const seleccionarFuente = useCallback(
    (fuente: FuenteTasaAjustes) => {
      triggerHaptic('selection');
      setFuenteSeleccionada(fuente);
      if (fuente === 'oficial_bcv') setTasaActivaInput(tasaOficialBcvInput);
      if (fuente === 'paralelo') setTasaActivaInput(tasaParaleloInput);
    },
    [tasaOficialBcvInput, tasaParaleloInput]
  );

  const cambiarTasaOficial = useCallback(
    (valor: string) => {
      setTasaOficialBcvInput(valor);
      if (fuenteSeleccionada === 'oficial_bcv') {
        setTasaActivaInput(valor);
        setCalculadoraVes(calcularVesDesdeUsd(valor, calculadoraUsd));
      }
    },
    [fuenteSeleccionada, calculadoraUsd]
  );

  const cambiarTasaParalelo = useCallback(
    (valor: string) => {
      setTasaParaleloInput(valor);
      if (fuenteSeleccionada === 'paralelo') {
        setTasaActivaInput(valor);
        setCalculadoraVes(calcularVesDesdeUsd(valor, calculadoraUsd));
      }
    },
    [fuenteSeleccionada, calculadoraUsd]
  );

  const cambiarTasaActiva = useCallback(
    (valor: string) => {
      setTasaActivaInput(valor);
      setFuenteSeleccionada('manual');
      setCalculadoraVes(calcularVesDesdeUsd(valor, calculadoraUsd));
    },
    [calculadoraUsd]
  );

  const cambiarMontoUsd = useCallback(
    (valor: string) => {
      setCalculadoraUsd(valor);
      setCalculadoraVes(calcularVesDesdeUsd(tasaActivaInput, valor));
    },
    [tasaActivaInput]
  );

  const cambiarMontoVes = useCallback(
    (valor: string) => {
      setCalculadoraVes(valor);
      setCalculadoraUsd((usdPrevio) => calcularUsdDesdeVes(tasaActivaInput, valor, usdPrevio));
    },
    [tasaActivaInput]
  );

  return {
    tasaVigente,
    isLoadingTasas,
    tasasError,
    tasaOficialBcvInput,
    tasaParaleloInput,
    tasaActivaInput,
    fuenteSeleccionada,
    isSavingTasa,
    tasaSuccessMsg,
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
