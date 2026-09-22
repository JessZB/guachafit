/**
 * Ola 4 · U4 — aviso discreto de versión nueva (actualización guiada).
 *
 * No es un modal ni interrumpe: es una franja en el flujo del layout (debajo del Header, sin
 * tapar la bottom nav). Mientras el usuario esté a mitad de un entrenamiento el aviso espera
 * ahí sin bloquear nada; solo se aplica y recarga si el usuario pulsa "Actualizar".
 */
import React, { useEffect, useState } from 'react';
import { ArrowUpCircle, RefreshCw } from 'lucide-react';
import {
  obtenerGestorActualizacion,
  type EstadoActualizacion,
} from '../../lib/pwa-actualizacion';

const ESTADO_INICIAL: EstadoActualizacion = {
  hayVersionNueva: false,
  aplicando: false,
  error: null,
};

export function ActualizacionDisponible() {
  const gestor = obtenerGestorActualizacion();
  const [estado, setEstado] = useState<EstadoActualizacion>(
    () => gestor?.estadoActual() ?? ESTADO_INICIAL
  );

  useEffect(() => {
    if (!gestor) return;
    return gestor.suscribir(setEstado);
  }, [gestor]);

  if (!gestor || !estado.hayVersionNueva) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-primary/10 border-b border-primary/25 text-primary px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs font-semibold"
    >
      <span className="flex items-center gap-2">
        <ArrowUpCircle className="h-4 w-4 shrink-0" />
        <span>Nueva versión disponible</span>
      </span>

      <button
        type="button"
        onClick={() => void gestor.aplicar()}
        disabled={estado.aplicando}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary text-primary-foreground font-bold text-[11px] shadow-sm shadow-primary/25 hover:brightness-110 active:scale-95 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 disabled:cursor-wait"
      >
        <RefreshCw className={`h-3 w-3 ${estado.aplicando ? 'animate-spin' : ''}`} />
        <span>{estado.aplicando ? 'Actualizando…' : 'Actualizar'}</span>
      </button>

      {estado.error && (
        <span role="alert" className="w-full text-center text-[11px] font-semibold text-destructive">
          {estado.error}
        </span>
      )}
    </div>
  );
}
