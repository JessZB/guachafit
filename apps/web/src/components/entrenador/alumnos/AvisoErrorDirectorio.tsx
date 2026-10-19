/**
 * Módulo `alumnos` (fase B, prompt 53) · aviso inline de error del directorio con la lista en pantalla.
 *
 * Mis alumnos (2026-10-19): si una consulta del directorio falla cuando ya hay datos visibles (p. ej.
 * al recargar tras una acción), la lista se conserva y este aviso ofrece reintentar. El bloque de
 * pantalla completa (`EstadoErrorDirectorio`) queda solo para el caso sin datos previos.
 *
 * Mismo patrón de error que `ui/EstadoError` (`role="alert"` y reintento de 44px vía `BotonTactil`).
 * Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

import { AlertTriangle } from 'lucide-react';
import { BotonTactil } from '../../ui/BotonTactil';

export interface AvisoErrorDirectorioProps {
  mensaje: string;
  onReintentar: () => void;
}

export function AvisoErrorDirectorio({ mensaje, onReintentar }: AvisoErrorDirectorioProps) {
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
