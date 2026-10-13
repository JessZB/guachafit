/**
 * Módulo `detalle-sesion-entrenamiento` · formato de contratos (lógica pura).
 *
 * Extraído verbatim de `components/entrenador/DetalleSesionEntrenamiento.tsx:77-91`.
 * Convierte los contratos de texto del API (`'85.00'`, `'28.00'`) a copy humano
 * (WU18) con estados honestos: `null` cuando falta el dato, nunca un invento.
 */
import { formatearPesoConUnidad } from './weight-unit';

/** Porcentaje decimal del contrato ('85.00') a texto corto ('85%'); null si no es numérico. */
export function porcentajeLegible(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;
  return `${Math.round(numero * 100) / 100}%`;
}

/** Peso del contrato en kg legible; null si falta el dato. 0 se muestra como carga corporal. */
export function pesoLegible(peso: string | null | undefined): string | null {
  if (peso === null || peso === undefined || peso === '') return null;
  const numero = Number(peso);
  if (!Number.isFinite(numero)) return null;
  if (numero === 0) return 'Corporal';
  return formatearPesoConUnidad(peso, 'kg');
}
