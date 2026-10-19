/**
 * Módulo `alumnos` (fase B, prompt 53) · diálogo "Invitar": enlace de captación del coach.
 *
 * Mis alumnos (2026-10-19): reemplaza el banner de captación de la cabecera. Mismo copy y mismos
 * fallos que el banner (C31-C33): enlace real del coach, aviso si la copia falla y estado honesto si
 * el perfil no carga (la copia queda deshabilitada). El error de carga va en su propio `role="alert"`
 * para que un lector de pantalla lo anuncie al abrir el diálogo.
 *
 * Cascarón con `role="dialog"`, `aria-modal` y `aria-labelledby`; Escape y foco los gobierna
 * `useDialogoAccesible` desde el contenedor (el `ref` se adjunta aquí). Cierre con "Cerrar" y backdrop.
 * §6: controles de 44px (`min-h-11`), texto ≥ 12px, peso ≤ 700.
 * Presentacional: solo props (R1).
 */

import type { RefObject } from 'react';
import { Check, Copy, MessageSquare, Share2, X } from 'lucide-react';

export interface ModalEnlaceCaptacionProps {
  refDialogo: RefObject<HTMLDivElement | null>;
  onCerrar: () => void;
  registrationUrl: string | null;
  coachCode: string | null;
  coachCodeError: string | null;
  isDemoMode: boolean;
  copiado: boolean;
  errorCopia: string | null;
  onCopiar: () => void;
}

export function ModalEnlaceCaptacion({
  refDialogo,
  onCerrar,
  registrationUrl,
  coachCode,
  coachCodeError,
  isDemoMode,
  copiado,
  errorCopia,
  onCopiar,
}: ModalEnlaceCaptacionProps) {
  // Con error de carga la descripción queda vacía: el aviso de error ya explica la situación.
  const descripcion = registrationUrl
    ? 'Comparte este enlace con tus prospectos para que se autorregistren y se vinculen automáticamente a tu cartera.'
    : coachCodeError
      ? null
      : isDemoMode
        ? 'En la demo no se muestra tu código real; inicia sesión con tu cuenta para ver tu enlace.'
        : 'Cargando tu enlace personalizado...';

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-invitacion-title"
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 id="modal-invitacion-title" className="font-bold text-base text-foreground">
              Invitar alumnos
            </h3>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-2">
          <p className="font-bold text-xs text-primary">Tu enlace de registro para alumnos</p>
          {descripcion && (
            <p className="text-xs text-muted-foreground leading-relaxed">{descripcion}</p>
          )}
          {coachCodeError && (
            <p role="alert" className="text-xs font-semibold text-destructive">
              {coachCodeError}
            </p>
          )}
          {registrationUrl && (
            <p className="text-xs font-mono break-all rounded-xl bg-secondary/60 border border-border px-3 py-2 text-foreground">
              {registrationUrl}
            </p>
          )}
          {coachCode && (
            <p className="text-xs text-muted-foreground font-mono">
              Tu código: <span className="text-primary font-bold">{coachCode}</span>
            </p>
          )}
          {errorCopia && (
            <p role="alert" className="text-xs font-semibold text-destructive">
              {errorCopia}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCopiar}
            disabled={!registrationUrl}
            className="min-h-11 py-2 px-3.5 rounded-xl bg-card hover:bg-secondary text-foreground text-xs font-bold border border-border flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary"
          >
            {copiado ? (
              <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            )}
            <span>{copiado ? '¡Enlace copiado!' : 'Copiar enlace'}</span>
          </button>

          {registrationUrl ? (
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `¡Hola! Para inscribirte conmigo en Guachafit y comenzar tu planificación deportiva, completa tu registro aquí: ${registrationUrl}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-11 py-2 px-3.5 rounded-xl bg-success-strong hover:bg-success-strong/90 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-success-strong/20 transition-all active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-success"
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Compartir por WhatsApp</span>
            </a>
          ) : (
            <span className="min-h-11 inline-flex items-center py-2 px-3.5 rounded-xl bg-card/60 text-muted-foreground text-xs font-bold border border-border">
              Enlace no disponible
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
