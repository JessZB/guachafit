/**
 * Módulo `alumnos` (fase B, prompt 53) · pantalla de éxito del alta manual.
 *
 * Extraída de `pages/entrenador/AlumnosPage.tsx:1100-1152`.
 * Clasificación: ÚNICO (pantalla de éxito con enlace de activación, solo de esta
 * vista; inventario 42 §3).
 *
 * R5: conserva "{nombres} {apellidos} fue registrado en tu cartera.", el label
 * "Enlace para crear su contraseña...", "Copiar enlace"/"¡Copiado!", el aviso de
 * copia en `role="alert"` y "Listo".
 * §6: CTAs de 44px, texto ≥ 12px. Presentacional: solo props (R1).
 */

import { Check, CheckCircle2, Copy } from 'lucide-react';
import { mensajeCorreoBienvenida, VIGENCIA_ACTIVACION_TEXTO } from '../../../lib/onboarding-links';
import type { AlumnoCreadoVista } from './use-alta-manual-alumno';

export interface ExitoAltaManualAlumnoProps {
  alumnoCreado: AlumnoCreadoVista;
  copiado: boolean;
  errorCopia: string | null;
  onCopiar: () => void;
  onListo: () => void;
}

export function ExitoAltaManualAlumno({
  alumnoCreado,
  copiado,
  errorCopia,
  onCopiar,
  onListo,
}: ExitoAltaManualAlumnoProps) {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-success/10 border border-success/30 text-center space-y-1.5">
        <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
        <p className="text-sm font-bold text-foreground">
          {alumnoCreado.nombres} {alumnoCreado.apellidos} fue registrado en tu cartera.
        </p>
        <p className="text-xs text-muted-foreground">
          {mensajeCorreoBienvenida(alumnoCreado.correoEnviado, 'alumno')}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="alta-enlace-activacion" className="text-xs font-semibold text-muted-foreground">
          Enlace para crear su contraseña (se usa una vez y vence en {VIGENCIA_ACTIVACION_TEXTO})
        </label>
        <div className="flex items-center gap-2">
          <input
            id="alta-enlace-activacion"
            type="text"
            readOnly
            value={alumnoCreado.linkActivacion}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border font-mono text-xs text-foreground focus:outline-hidden focus:border-primary"
          />
          <button
            type="button"
            onClick={onCopiar}
            className="shrink-0 min-h-11 py-2 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            {copiado ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copiado ? '¡Copiado!' : 'Copiar enlace'}</span>
          </button>
        </div>
        {errorCopia && (
          <p role="alert" className="text-xs font-semibold text-destructive">
            {errorCopia}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onListo}
        className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-secondary text-foreground font-bold text-sm border border-border hover:bg-secondary/80 active:scale-98 transition-all cursor-pointer"
      >
        Listo
      </button>
    </div>
  );
}
