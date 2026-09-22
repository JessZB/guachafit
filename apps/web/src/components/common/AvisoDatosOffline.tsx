/**
 * Ola 4 · U4 — aviso honesto de datos servidos desde la caché del Service Worker.
 *
 * Dos variantes:
 * - `guardados`: chip discreto "Sin conexión · datos guardados" (+ edad si se pudo datar).
 *   Se monta solo cuando la pantalla YA tiene datos para mostrar.
 * - `sin-datos`: estado vacío "Sin conexión y sin datos guardados", mismo patrón que el
 *   estado honesto de Entrenamiento.
 *
 * En ambos casos se auto-oculta con conexión: la ausencia de señal se anuncia una sola vez
 * en el Header (badge offline) y este aviso solo añade el contexto de la pantalla.
 */
import React from 'react';
import { WifiOff } from 'lucide-react';
import { formatearEdadFrescura } from '../../lib/frescura-cache';
import { useFrescuraOffline } from '../../lib/use-frescura-offline';

export interface AvisoDatosOfflineProps {
  /** URL del GET cuya copia en Cache Storage se quiere datar (opcional). */
  url?: string | null;
  /** `guardados` (por defecto) | `sin-datos`. */
  variante?: 'guardados' | 'sin-datos';
  className?: string;
}

export function AvisoDatosOffline({
  url = null,
  variante = 'guardados',
  className = '',
}: AvisoDatosOfflineProps) {
  const { isOnline, frescura } = useFrescuraOffline(url);

  if (isOnline) return null;

  if (variante === 'sin-datos') {
    return (
      <div
        role="status"
        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-warning/10 border border-warning/30 text-warning text-xs font-semibold ${className}`}
      >
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>Sin conexión y sin datos guardados</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-secondary/70 border border-border text-muted-foreground text-xs font-semibold ${className}`}
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>
        Sin conexión · datos guardados
        {frescura ? ` · actualizado ${formatearEdadFrescura(frescura.edadMinutos)}` : ''}
      </span>
    </div>
  );
}
