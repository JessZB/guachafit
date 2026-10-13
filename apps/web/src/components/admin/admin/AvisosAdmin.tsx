/**
 * RF-010 (WU Admin): avisos de acción del panel (éxito honesto solo con 2xx y error visible).
 *
 * Componente presentacional puro (sin datos): banners `role="status"` y `role="alert"` de las
 * acciones de cuenta/licencia. Recorte verbatim de `AdminPage`.
 */
import React from 'react';
import { Check } from 'lucide-react';

export interface AvisosAdminProps {
  aviso: string | null;
  accionError: string | null;
}

export function AvisosAdmin({ aviso, accionError }: AvisosAdminProps) {
  return (
    <>
      {aviso && (
        <div
          role="status"
          aria-live="polite"
          className="p-3 rounded-xl bg-success/10 border border-success/30 text-success text-xs font-semibold flex items-center gap-2"
        >
          <Check className="h-4 w-4 shrink-0" />
          <span>{aviso}</span>
        </div>
      )}

      {accionError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold"
        >
          {accionError}
        </div>
      )}
    </>
  );
}
