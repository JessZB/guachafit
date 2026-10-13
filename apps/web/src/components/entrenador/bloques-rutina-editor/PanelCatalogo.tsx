/**
 * Módulo `bloques-rutina-editor` (Ola 2, prompt 74) · picker del catálogo.
 *
 * Origen: `BloquesRutinaEditor.tsx:613-795` (chips de grupo, buscador, lista para
 * añadir, vacío con atajos y formulario de creación rápida). Componente único de la
 * vista (R3: `CatalogoEjerciciosRutina.tsx:45-...` usa otro copy —`Añadir Ejercicio
 * desde Catálogo` frente a `Añadir ejercicio desde tu lista`—, otro placeholder de
 * buscador y sin reintento de error, así que la sustitución no es mecánica). Solo
 * props y callbacks (R1): sin `useQuery` ni `api-client` (R9). Conserva roles,
 * labels, `aria-pressed`/`aria-expanded` y textos que usan los specs (R5). Estados
 * honestos §6.6: el error del catálogo trae su causa y el reintento.
 *
 * §6: español claro, controles 44px (`min-h-11`), piso 11px, tokens con variante
 * claro/oscuro, pesos ≤ 700.
 */
import type React from 'react';
import { AlertCircle, FolderPlus, Plus, Search } from 'lucide-react';
import type { EjercicioCatalogoDetalleDTO } from '@guachafit/shared';
import { triggerHaptic } from '../../../lib/haptics';

export const GRUPOS_MUSCULARES = ['Todos', 'Pecho', 'Espalda', 'Piernas', 'Hombros', 'Brazos', 'Core'];

export interface EstadoCreacionEjercicio {
  abierto: boolean;
  nombre: string;
  grupo: string;
  patron: string;
  enCurso: boolean;
  error: string | null;
}

interface PanelCatalogoProps {
  ejercicios: EjercicioCatalogoDetalleDTO[];
  hayFiltro: boolean;
  filtroTexto: string;
  grupo: string;
  onCambiarGrupo: (grupo: string) => void;
  onCambiarFiltro: (filtro: string) => void;
  catalogoError?: string | null;
  onReintentarCatalogo?: () => void;
  puedeCrear: boolean;
  creacion: EstadoCreacionEjercicio;
  onCambiarCreacionAbierta: (abierto: boolean) => void;
  onCambiarCreacion: (cambios: Partial<EstadoCreacionEjercicio>) => void;
  onCrear: (e: React.FormEvent) => void;
  onAgregarEjercicio: (nombre: string, ejercicioId?: string) => void;
}

export function PanelCatalogo({
  ejercicios,
  hayFiltro,
  filtroTexto,
  grupo,
  onCambiarGrupo,
  onCambiarFiltro,
  catalogoError,
  onReintentarCatalogo,
  puedeCrear,
  creacion,
  onCambiarCreacionAbierta,
  onCambiarCreacion,
  onCrear,
  onAgregarEjercicio,
}: PanelCatalogoProps) {
  return (
    <div className="p-4 rounded-2xl bg-secondary/30 border border-border/80 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FolderPlus className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold text-foreground">Añadir ejercicio desde tu lista</span>
        </div>

        {puedeCrear && (
          <button
            type="button"
            onClick={() => onCambiarCreacionAbierta(!creacion.abierto)}
            aria-expanded={creacion.abierto}
            className="min-h-11 text-xs font-bold text-primary hover:underline cursor-pointer flex items-center gap-1 self-start sm:self-auto"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{creacion.abierto ? 'Ocultar' : 'Crear ejercicio nuevo'}</span>
          </button>
        )}
      </div>

      {creacion.abierto && puedeCrear && (
        <form
          onSubmit={onCrear}
          className="p-3 rounded-xl bg-card border border-primary/30 space-y-3 animate-in zoom-in-95 duration-150"
        >
          <span className="text-[11px] font-bold text-primary uppercase tracking-wide block">
            Nuevo ejercicio en tu lista
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              required
              placeholder="Nombre (ej. Hip Thrust Mancuerna)"
              aria-label="Nombre del ejercicio nuevo"
              value={creacion.nombre}
              onChange={(e) => onCambiarCreacion({ nombre: e.target.value })}
              className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
            />
            <select
              aria-label="Grupo muscular"
              value={creacion.grupo}
              onChange={(e) => onCambiarCreacion({ grupo: e.target.value })}
              className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
            >
              {GRUPOS_MUSCULARES.filter((g) => g !== 'Todos').map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select
              aria-label="Tipo de movimiento"
              value={creacion.patron}
              onChange={(e) => onCambiarCreacion({ patron: e.target.value })}
              className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
            >
              <option value="Empuje">Empuje</option>
              <option value="Tracción">Tracción</option>
              <option value="Bisagra de Cadera">Bisagra de Cadera</option>
              <option value="Dominante de Rodilla">Dominante de Rodilla</option>
              <option value="Aislamiento">Aislamiento</option>
            </select>
          </div>
          {creacion.error && (
            <p role="alert" className="text-xs text-destructive font-semibold flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {creacion.error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onCambiarCreacionAbierta(false)}
              className="min-h-11 px-3 py-1 rounded-lg bg-secondary text-muted-foreground text-xs cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={creacion.enCurso}
              className="min-h-11 px-3 py-1 rounded-lg bg-primary text-primary-foreground font-bold text-xs cursor-pointer disabled:opacity-50"
            >
              {creacion.enCurso ? 'Guardando...' : 'Crear y agregar a este día'}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {GRUPOS_MUSCULARES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                onCambiarGrupo(g);
              }}
              aria-pressed={grupo === g}
              className={`min-h-11 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                grupo === g
                  ? 'bg-primary text-primary-foreground font-bold'
                  : 'bg-background hover:bg-secondary text-muted-foreground'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar en tu lista de ejercicios..."
            aria-label="Buscar ejercicio"
            value={filtroTexto}
            onChange={(e) => onCambiarFiltro(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
          />
        </div>
      </div>

      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
        {ejercicios.length === 0 ? (
          <div className="p-5 rounded-2xl bg-card border border-dashed border-border text-center space-y-2">
            <Search className="h-5 w-5 text-muted-foreground mx-auto opacity-50" />
            <p className="text-xs font-bold text-foreground">
              {catalogoError ? 'No se pudo cargar el catálogo' : 'Sin resultados en el catálogo'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {catalogoError
                ? catalogoError
                : hayFiltro
                ? 'Ajusta el grupo muscular o el término de búsqueda, o crea el ejercicio que falta.'
                : 'Tu catálogo está vacío: crea tu primer ejercicio para asignarlo.'}
            </p>
            {catalogoError && onReintentarCatalogo ? (
              <button
                type="button"
                onClick={onReintentarCatalogo}
                className="min-h-11 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs transition-all cursor-pointer"
              >
                Reintentar carga
              </button>
            ) : puedeCrear ? (
              <button
                type="button"
                onClick={() => onCambiarCreacionAbierta(true)}
                className="min-h-11 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 hover:bg-primary text-primary hover:text-primary-foreground font-bold text-xs transition-all cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                <span>
                  {filtroTexto.trim() ? `Crear «${filtroTexto.trim()}»` : 'Crear ejercicio nuevo'}
                </span>
              </button>
            ) : null}
          </div>
        ) : (
          ejercicios.map((ej) => (
            <div
              key={ej.id}
              className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/60 hover:border-primary/40 transition-colors text-xs gap-2"
            >
              <div className="min-w-0 flex-1 pr-1">
                <span className="font-bold text-foreground break-words block">{ej.nombre}</span>
                <span className="text-[11px] text-muted-foreground">• {ej.grupoMuscular}</span>
              </div>
              <button
                type="button"
                onClick={() => onAgregarEjercicio(ej.nombre, ej.id)}
                aria-label={`Añadir ${ej.nombre}`}
                className="min-h-11 px-3 py-1 rounded-lg bg-primary/15 hover:bg-primary text-primary hover:text-primary-foreground font-bold text-xs flex items-center gap-1 transition-all cursor-pointer shrink-0"
              >
                <Plus className="h-3 w-3" />
                <span>Añadir</span>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
