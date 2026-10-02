/**
 * A2: campo de WhatsApp con prefijo de país visible y editable (por defecto +58).
 * Presentacional: la validación y la composición viven en `lib/formulario-registro.ts`.
 */
import React from 'react';

export interface CampoWhatsappProps {
  /** Prefijo base de los `id` (cada formulario usa el suyo para no repetir ids en la página). */
  idBase: string;
  prefijo: string;
  numero: string;
  onCambiarPrefijo: (valor: string) => void;
  onCambiarNumero: (valor: string) => void;
  error?: string | null;
  etiquetaClassName?: string;
  ayuda?: string;
}

export function CampoWhatsapp({
  idBase,
  prefijo,
  numero,
  onCambiarPrefijo,
  onCambiarNumero,
  error,
  etiquetaClassName = 'text-xs font-semibold text-foreground',
  ayuda = 'Escribe tu número sin el código de país. Lo usaremos para escribirte por WhatsApp.',
}: CampoWhatsappProps) {
  const idPrefijo = `${idBase}-prefijo`;
  const idNumero = `${idBase}-numero`;
  const idAyuda = `${idBase}-ayuda`;
  const idError = `${idBase}-error`;

  return (
    <div className="space-y-1">
      <label htmlFor={idNumero} className={etiquetaClassName}>
        WhatsApp
      </label>
      <div className="flex gap-2">
        <label htmlFor={idPrefijo} className="sr-only">
          Código de país
        </label>
        <input
          id={idPrefijo}
          type="tel"
          inputMode="tel"
          autoComplete="tel-country-code"
          required
          maxLength={5}
          value={prefijo}
          onChange={(e) => onCambiarPrefijo(e.target.value)}
          className="w-20 shrink-0 min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground font-mono text-center focus:outline-hidden focus:border-primary"
        />
        <input
          id={idNumero}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required
          value={numero}
          onChange={(e) => onCambiarNumero(e.target.value)}
          placeholder="412 123 4567"
          aria-describedby={error ? `${idAyuda} ${idError}` : idAyuda}
          aria-invalid={error ? true : undefined}
          className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
        />
      </div>
      <p id={idAyuda} className="text-xs text-muted-foreground">
        {ayuda}
      </p>
      {error && (
        <p id={idError} role="alert" className="text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
