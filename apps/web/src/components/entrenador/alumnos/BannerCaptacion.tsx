/**
 * Módulo `alumnos` (fase B, prompt 53) · banner de captación con enlace del coach.
 *
 * Extraído de `pages/entrenador/AlumnosPage.tsx:584-640`.
 * Clasificación: ÚNICO (copy y flujo exclusivos: único "Compartir por WhatsApp" de
 * `apps/web/src`; inventario 42 §3).
 *
 * R5: conserva idénticos "Tu enlace de registro para alumnos", "Tu código:",
 * "Copiar enlace"/"¡Enlace copiado!", fallo de copia en `role="alert"`,
 * "Compartir por WhatsApp"/"Enlace no disponible" y el mensaje demo sin código.
 * §6: CTAs de 44px (`min-h-11`), texto ≥ 12px, peso ≤ 700.
 * Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

import { Check, Copy, MessageSquare, Share2 } from 'lucide-react';

export interface BannerCaptacionProps {
  registrationUrl: string | null;
  coachCode: string | null;
  coachCodeError: string | null;
  isDemoMode: boolean;
  copiado: boolean;
  errorCopia: string | null;
  onCopiar: () => void;
}

export function BannerCaptacion({
  registrationUrl,
  coachCode,
  coachCodeError,
  isDemoMode,
  copiado,
  errorCopia,
  onCopiar,
}: BannerCaptacionProps) {
  return (
    <div className="p-5 rounded-3xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-primary font-bold text-xs">
          <Share2 className="h-4 w-4" />
          <span>Tu enlace de registro para alumnos</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {registrationUrl
            ? 'Comparte este enlace con tus prospectos para que se autorregistren y se vinculen automáticamente a tu cartera.'
            : coachCodeError ||
              (isDemoMode
                ? 'En la demo no se muestra tu código real; inicia sesión con tu cuenta para ver tu enlace.'
                : 'Cargando tu enlace personalizado...')}
        </p>
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

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onCopiar}
          disabled={!registrationUrl}
          className="min-h-11 py-2 px-3.5 rounded-xl bg-card hover:bg-secondary text-foreground text-xs font-bold border border-border flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {copiado ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5 text-primary" />}
          <span>{copiado ? '¡Enlace copiado!' : 'Copiar enlace'}</span>
        </button>

        {registrationUrl ? (
          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              `¡Hola! Para inscribirte conmigo en Guachafit y comenzar tu planificación deportiva, completa tu registro aquí: ${registrationUrl}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-11 py-2 px-3.5 rounded-xl bg-success-strong hover:bg-success-strong/90 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-success-strong/20 transition-all active:scale-95 cursor-pointer"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Compartir por WhatsApp</span>
          </a>
        ) : (
          <span className="py-2 px-3.5 rounded-xl bg-card/60 text-muted-foreground text-xs font-bold border border-border">
            Enlace no disponible
          </span>
        )}
      </div>
    </div>
  );
}
