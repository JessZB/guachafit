/**
 * RF-010 Escenario 1 (WU Admin): panel de éxito del alta con el enlace de activación.
 *
 * Componente presentacional puro (sin datos): muestra el mensaje real del servidor, la ficha
 * del entrenador creado y el enlace para compartir (o el texto honesto cuando el alta quedó
 * activa sin token). Recorte verbatim de `AdminPage`.
 */
import React from 'react';
import { Check, ClipboardCopy, Clock } from 'lucide-react';
import type { EntrenadorCreadoDTO } from '@guachafit/shared';
import {
  mensajeCorreoBienvenida,
  VIGENCIA_ACTIVACION_TEXTO,
} from '../../../lib/onboarding-links';

export interface ResultadoAltaEntrenadorProps {
  creado: EntrenadorCreadoDTO;
  enlaceActivacion: string | null;
  copiado: boolean;
  errorCopia: string | null;
  onCopiar: () => void;
}

export function ResultadoAltaEntrenador({
  creado,
  enlaceActivacion,
  copiado,
  errorCopia,
  onCopiar,
}: ResultadoAltaEntrenadorProps) {
  return (
    <div className="p-4 rounded-xl bg-success/10 border border-success/30 space-y-3">
      <div className="flex items-center gap-2 text-success text-sm font-bold">
        <Check className="h-4 w-4" />
        <span>{creado.mensaje}</span>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>
          <span className="font-semibold text-foreground">
            {creado.nombres} {creado.apellidos}
          </span>{' '}
          — {creado.email}
        </p>
        <p>
          Código de entrenador:{' '}
          <span className="font-mono font-bold text-foreground">{creado.coachCode}</span>
        </p>
      </div>
      {enlaceActivacion ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {mensajeCorreoBienvenida(creado.correoEnviado, 'entrenador')} Es válido por{' '}
            {VIGENCIA_ACTIVACION_TEXTO}.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono break-all px-2.5 py-2 rounded-lg bg-background border border-border text-foreground">
              {enlaceActivacion}
            </code>
            <button
              type="button"
              onClick={onCopiar}
              className="min-h-11 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              {copiado ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
              <span>{copiado ? 'Copiado' : 'Copiar'}</span>
            </button>
          </div>
          {errorCopia && (
            <p role="alert" className="text-xs font-semibold text-destructive">
              {errorCopia}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          La cuenta quedó activa con la contraseña definida.
        </p>
      )}
    </div>
  );
}
