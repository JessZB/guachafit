/**
 * RF-010 (WU Admin): cabecera del panel de administración.
 *
 * Componente presentacional puro (sin datos): título de la plataforma, nombre de la vista y el
 * botón de cierre de sesión (el diálogo de confirmación lo posee el hook `useLogoutSeguro` en el
 * contenedor). Recorte verbatim de `AdminPage`.
 */
import React from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';

export interface CabeceraAdminProps {
  onSolicitarCierre: () => void;
}

export function CabeceraAdmin({ onSolicitarCierre }: CabeceraAdminProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          Plataforma GUACHAFIT
        </span>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-foreground mt-1">
          Panel de administración
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Administra las cuentas y licencias de los entrenadores, y comparte sus enlaces de
          activación.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void onSolicitarCierre()}
        className="min-h-11 min-w-11 justify-center flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 text-xs font-semibold transition-colors cursor-pointer"
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Cerrar sesión</span>
      </button>
    </div>
  );
}
