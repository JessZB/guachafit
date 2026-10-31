/**
 * Módulo `alumnos` (fase B, prompt 53) · cabecera del directorio "Mis alumnos".
 *
 * Mis alumnos (2026-10-19): título y dos acciones. "Invitar" abre el diálogo con el enlace de
 * captación; "Inscribir Manual" abre el alta en sala. Los KPI y el banner de captación salen de la
 * vista: el conteo vive en los chips de estado.
 *
 * R5: conserva `aria-label`/texto "Inscribir Manual" que consultan los specs.
 * §6: controles de 44px (`min-h-11`), texto ≥ 12px, peso ≤ 700, foco visible.
 * Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

import { Share2, UserPlus } from 'lucide-react';
import { DESTINOS_ENTRENADOR } from '../../../lib/etiquetas-dominio';

export interface CabeceraAlumnosProps {
  onInvitar: () => void;
  onInscribir: () => void;
}

export function CabeceraAlumnos({ onInvitar, onInscribir }: CabeceraAlumnosProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{DESTINOS_ENTRENADOR.alumnos.etiqueta}</h1>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onInvitar}
          className="min-h-11 py-2.5 px-4 rounded-xl bg-card border border-border text-foreground font-bold text-xs shadow-xs hover:bg-secondary active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Share2 className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>Invitar</span>
        </button>

        <button
          type="button"
          onClick={onInscribir}
          className="min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          <span>Inscribir Manual</span>
        </button>
      </div>
    </div>
  );
}
