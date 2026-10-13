/**
 * Error honesto de carga de la evolución con reintento (SL2, fase B).
 *
 * De `ProgresoPage.tsx:493-506`: consume el átomo `ui/EstadoError`
 * (guía 48 §6 M5). Divergencias deliberadas del átomo: `role="alert"`
 * siempre y reintento con `BotonTactil` (`min-h-11`, corrige el WARNING del
 * inventario 44: el botón original medía ~36px). El texto del mensaje y el
 * "Reintentar" se conservan idénticos (R5). Presentacional, sin datos (R1).
 * §6: táctil 44px, 11px mínimo, estados honestos.
 */
import { EstadoError } from '../../ui/EstadoError';

interface AvisoErrorEvolucionProps {
  mensaje: string;
  onReintentar: () => void;
}

export function AvisoErrorEvolucion({ mensaje, onReintentar }: AvisoErrorEvolucionProps) {
  return <EstadoError mensaje={mensaje} onReintentar={onReintentar} />;
}
