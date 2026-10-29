/**
 * Hook de formato numérico para las vistas (§6.17 de `00_Reglas_Desarrollo_SDD.md`).
 *
 * Punto único de inyección del formato: las vistas usan este hook y nunca llaman a
 * `formatMonto` o `formatDecimal` directamente.
 *
 * Decisión del dueño (2026-10-28): formato venezolano por defecto. A futuro, la preferencia
 * del usuario se leerá AQUÍ (por ejemplo, desde la sesión), sin tocar las vistas.
 *
 * Las funciones puras de `formato-monto.ts` siguen recibiendo el formato como parámetro; este
 * hook solo lo fija y lo pasa a ellas.
 */
import { useMemo } from 'react';
import {
  FORMATO_NUMERO_POR_DEFECTO,
  formatDecimal,
  formatMonto,
  type FormatoNumero,
  type MonedaMonto,
} from './formato-monto';

export interface FormatoNumeroVista {
  formato: FormatoNumero;
  formatMonto: (
    valor: string | number | null | undefined,
    moneda: MonedaMonto,
    opciones?: { conCodigo?: boolean }
  ) => string;
  formatDecimal: (
    valor: string | number | null | undefined,
    opciones?: { decimales?: number }
  ) => string;
}

/** Devuelve los formateadores de la vista ya ligados al formato vigente. */
export function useFormatoNumero(): FormatoNumeroVista {
  const formato = FORMATO_NUMERO_POR_DEFECTO;

  return useMemo(
    () => ({
      formato,
      formatMonto: (valor, moneda, opciones) => formatMonto(valor, moneda, { formato, ...opciones }),
      formatDecimal: (valor, opciones) => formatDecimal(valor, { formato, ...opciones }),
    }),
    [formato]
  );
}
