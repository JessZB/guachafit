/**
 * RF-010 Escenario 1 (WU Admin): sección de alta de entrenadores.
 *
 * Componente presentacional puro (sin datos): marco de la sección, error honesto del alta, panel
 * de éxito con el enlace y formulario. Compone `ResultadoAltaEntrenador` y
 * `FormularioAltaEntrenador`. Recorte verbatim de `AdminPage`.
 */
import React from 'react';
import { UserPlus } from 'lucide-react';
import type { EntrenadorCreadoDTO } from '@guachafit/shared';
import type { FormularioAltaEntrenador as FormularioAlta } from '../../../lib/admin-alta-payload';
import { VIGENCIA_ACTIVACION_TEXTO } from '../../../lib/onboarding-links';
import { ResultadoAltaEntrenador } from './ResultadoAltaEntrenador';
import { FormularioAltaEntrenador } from './FormularioAltaEntrenador';

export interface SeccionAltaEntrenadorProps {
  error: string | null;
  creado: EntrenadorCreadoDTO | null;
  enlaceActivacion: string | null;
  copiado: boolean;
  errorCopia: string | null;
  formulario: FormularioAlta;
  enviando: boolean;
  onCambiarCampo: (
    campo: keyof FormularioAlta
  ) => (evento: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (evento: React.FormEvent) => void;
  onCopiar: () => void;
}

export function SeccionAltaEntrenador({
  error,
  creado,
  enlaceActivacion,
  copiado,
  errorCopia,
  formulario,
  enviando,
  onCambiarCampo,
  onSubmit,
  onCopiar,
}: SeccionAltaEntrenadorProps) {
  return (
    <section className="p-5 sm:p-6 rounded-2xl bg-card border border-border/80 space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-primary/15 text-primary">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground">Crear entrenador</h2>
          <p className="text-xs text-muted-foreground">
            El entrenador recibirá un enlace de activación válido por {VIGENCIA_ACTIVACION_TEXTO} para crear su
            contraseña.
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold"
        >
          {error}
        </div>
      )}

      {creado && (
        <ResultadoAltaEntrenador
          creado={creado}
          enlaceActivacion={enlaceActivacion}
          copiado={copiado}
          errorCopia={errorCopia}
          onCopiar={onCopiar}
        />
      )}

      <FormularioAltaEntrenador
        formulario={formulario}
        enviando={enviando}
        onCambiarCampo={onCambiarCampo}
        onSubmit={onSubmit}
      />
    </section>
  );
}
