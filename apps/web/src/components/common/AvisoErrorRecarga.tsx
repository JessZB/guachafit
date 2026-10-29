/**
 * Aviso inline de error de recarga con reintento (lote UX-05, §6.6).
 *
 * Se muestra sobre datos ya visibles cuando una recarga falla: la lista se conserva y este aviso
 * ofrece reintentar. El bloque de pantalla completa (`ui/EstadoError`) queda solo para el caso sin
 * datos previos.
 *
 * Promovido desde `alumnos/AvisoErrorDirectorio` en UX-05 porque Mis alumnos, Conciliación y
 * Cartera lo comparten. Mismo DOM que antes: `role="alert"` y reintento de 44px vía `BotonTactil`.
 * Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

import { AlertTriangle } from 'lucide-react';
import { BotonTactil } from '../ui/BotonTactil';

export interface AvisoErrorRecargaProps {
  mensaje: string;
  onReintentar: () => void;
}

export function AvisoErrorRecarga({ mensaje, onReintentar }: AvisoErrorRecargaProps) {
  return (
    <div
      role="alert"
      className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex flex-wrap items-center gap-2"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0">{mensaje}</span>
      <BotonTactil onClick={onReintentar}>Reintentar</BotonTactil>
    </div>
  );
}
