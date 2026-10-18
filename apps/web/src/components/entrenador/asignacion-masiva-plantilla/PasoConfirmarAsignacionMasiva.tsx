/**
 * Lote E10 · módulo `asignacion-masiva-plantilla` (presentacional).
 *
 * Paso 3 de la asignación masiva: modo (añadir/reemplazar), frase de resumen y error de envío.
 * El botón de asignar vive en la barra de navegación. No pide datos. Tras un fallo ambiguo
 * (`intentoCongelado`) el modo queda bloqueado y el error explica cómo seguir.
 */
import type { ModoAsignacionPlantilla } from '@guachafit/shared';
import { AlertCircle } from 'lucide-react';
import { resumenAsignacionMasiva } from '../../../lib/asignacion-pasos';
import { SelectorModoAsignacion } from './SelectorModoAsignacion';

const MENSAJE_CONGELADO =
  'Para cambiar alumnos, ajustes o modo, cierra y comprueba primero si la asignación se aplicó.';

export function PasoConfirmarAsignacionMasiva({
  plantillaNombre,
  cantidad,
  nombreUnico,
  numeroAjustes,
  modo,
  errorAsignacion,
  intentoCongelado = false,
  onCambiarModo,
}: {
  plantillaNombre: string;
  cantidad: number;
  nombreUnico?: string;
  numeroAjustes: number;
  modo: ModoAsignacionPlantilla;
  errorAsignacion: string | null;
  /** Tras un fallo ambiguo: el modo se bloquea y el error explica cómo seguir. */
  intentoCongelado?: boolean;
  onCambiarModo: (modo: ModoAsignacionPlantilla) => void;
}) {
  return (
    <>
      <SelectorModoAsignacion
        modo={modo}
        onCambiarModo={onCambiarModo}
        deshabilitado={intentoCongelado}
      />

      <p className="text-sm text-foreground">
        {resumenAsignacionMasiva({ plantillaNombre, cantidad, nombreUnico, numeroAjustes, modo })}
      </p>

      {errorAsignacion && (
        <div
          role="alert"
          className="p-3 rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <span className="block">{errorAsignacion}</span>
            {intentoCongelado && <span className="block">{MENSAJE_CONGELADO}</span>}
          </div>
        </div>
      )}
    </>
  );
}
