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
import { edadEnMinutos, formatearEdadFrescura } from '../../lib/frescura-cache';
import { useFrescuraOffline } from '../../lib/use-frescura-offline';

export interface AvisoDatosOfflineProps {
  /** URL del GET cuya copia en Cache Storage se quiere datar (opcional). */
  url?: string | null;
  /** `guardados` (por defecto) | `sin-datos`. */
  variante?: 'guardados' | 'sin-datos';
  /**
   * D2: marca de guardado local (epoch ms) cuando los datos vienen de IndexedDB en lugar de
   * Cache Storage. Tiene prioridad sobre la edad calculada desde `url`.
   */
  actualizadoEn?: number | null;
  /**
   * D2: mostrar también con conexión (p. ej. el servidor no respondió y se usó lo guardado).
   * Con conexión el texto dice "Conexión inestable" en lugar de "Sin conexión".
   */
  mostrarConConexion?: boolean;
  className?: string;
}

export function AvisoDatosOffline({
  url = null,
  variante = 'guardados',
  actualizadoEn = null,
  mostrarConConexion = false,
  className = '',
}: AvisoDatosOfflineProps) {
  const { isOnline, frescura } = useFrescuraOffline(actualizadoEn !== null ? null : url);

  if (isOnline && !mostrarConConexion) return null;

  const edadLocal =
    actualizadoEn !== null && Number.isFinite(actualizadoEn)
      ? edadEnMinutos(new Date(actualizadoEn).toISOString())
      : null;
  const estadoConexion = isOnline ? 'Conexión inestable' : 'Sin conexión';

  if (variante === 'sin-datos') {
    return (
      <div
        role="status"
        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-warning/10 border border-warning/30 text-warning text-xs font-semibold ${className}`}
      >
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>{estadoConexion} y sin datos guardados</span>
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
        {estadoConexion} · datos guardados
        {edadLocal !== null
          ? ` · ${formatearEdadFrescura(edadLocal)}`
          : frescura
          ? ` · actualizado ${formatearEdadFrescura(frescura.edadMinutos)}`
          : ''}
      </span>
    </div>
  );
}
