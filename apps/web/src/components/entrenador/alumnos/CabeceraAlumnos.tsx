/**
 * Módulo `alumnos` (fase B, prompt 53) · cabecera del directorio.
 *
 * Extraída de `pages/entrenador/AlumnosPage.tsx:394-452` (título, toggle cards/tabla,
 * "Inscribir Manual"). Clasificación: ÚNICO (título/subtítulo/toggle/CTA solo de
 * esta vista; guía 48 fila 34: cabecera ÚNICA hoy → D).
 *
 * R5: conserva idénticos h1 "Gestión de Alumnos", `aria-label` + `aria-pressed` del
 * toggle ("Vista en tarjetas" / "Vista en tabla") y el botón "Inscribir Manual".
 * §6: controles de 44px (`min-h-11`), texto ≥ 12px, peso ≤ 700.
 * Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

import { LayoutGrid, Table as TableIcon, UserPlus, Users } from 'lucide-react';
import type { ModoVistaDirectorio } from '../../../lib/alumnos-directorio-filtros';

export interface CabeceraAlumnosProps {
  viewMode: ModoVistaDirectorio;
  onCambiarVista: (modo: ModoVistaDirectorio) => void;
  onInscribir: () => void;
}

export function CabeceraAlumnos({ viewMode, onCambiarVista, onInscribir }: CabeceraAlumnosProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          <Users className="h-4 w-4" />
          <span>Alumnos</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
          Gestión de Alumnos
        </h1>
        <p className="text-xs text-muted-foreground">Datos, planes y pagos de cada alumno.</p>
      </div>

      <div className="flex items-center gap-2">
        {/* Toggle de Vista Cards / Tabla */}
        <div className="flex items-center p-1 rounded-xl bg-secondary/80 border border-border/80">
          <button
            type="button"
            onClick={() => onCambiarVista('cards')}
            className={`min-h-11 min-w-11 flex items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Vista en tarjetas"
            aria-label="Vista en tarjetas"
            aria-pressed={viewMode === 'cards'}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onCambiarVista('table')}
            className={`min-h-11 min-w-11 flex items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'table'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Vista en tabla"
            aria-label="Vista en tabla"
            aria-pressed={viewMode === 'table'}
          >
            <TableIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Inscribir Alumno */}
        <button
          onClick={onInscribir}
          className="min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          <span>Inscribir Manual</span>
        </button>
      </div>
    </div>
  );
}
