/**
 * Catálogo de ejercicios del modal de rutina: filtro por grupo, búsqueda, lista para añadir
 * y creación rápida en el catálogo.
 *
 * Parte ÚNICA del modal de rutina (SL-7). Mismo aviso que `ContenidoRutinaSemanal`: recorte
 * verbatim para el tope R2 de 400 líneas; la convergencia con `BloquesRutinaEditor` está
 * BLOQUEADA por R5 (BLOCKER-51-1). Conserva idénticos el buscador
 * (`Buscar en catálogo…`), los chips de grupo, el estado `Sin resultados en el catálogo`,
 * el botón `Añadir` y el creador (`Crear Ejercicio Nuevo`, `Crear y Asignar a este Día`,
 * `Nombre (ej. Hip Thrust Mancuerna)`) que consultan los specs.
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import { FolderPlus, Plus, Search } from 'lucide-react';
import { triggerHaptic } from '../../../lib/haptics';
import type { RetornoRutinaAlumno } from './use-rutina-alumno';

interface CatalogoEjerciciosRutinaProps {
  rutina: RetornoRutinaAlumno;
}

export function CatalogoEjerciciosRutina({ rutina }: CatalogoEjerciciosRutinaProps) {
  // El catálogo solo se muestra con día activo (fiel al `&&` original del modal).
  if (!rutina.bloquesRutinaEdit[rutina.activeDiaIdx]) return null;
  const {
    catalogoFiltrado,
    hayFiltroCatalogo,
    selectedGrupoMuscular,
    setSelectedGrupoMuscular,
    filtroBusquedaEj,
    setFiltroBusquedaEj,
    isCrearEjRapidoOpen,
    setIsCrearEjRapidoOpen,
    nuevoEjNombre,
    setNuevoEjNombre,
    nuevoEjGrupo,
    setNuevoEjGrupo,
    nuevoEjPatron,
    setNuevoEjPatron,
    isSubmittingEj,
    handleCrearEjercicioRapido,
    agregarEjercicioADia,
  } = rutina;

  return (
    <div className="p-4 rounded-2xl bg-secondary/30 border border-border/80 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FolderPlus className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold text-foreground">
            Añadir Ejercicio desde Catálogo
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsCrearEjRapidoOpen(!isCrearEjRapidoOpen)}
          className="text-xs font-bold text-primary hover:underline cursor-pointer flex items-center gap-1 self-start sm:self-auto"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{isCrearEjRapidoOpen ? 'Ocultar Creador Rápido' : 'Crear Ejercicio Nuevo'}</span>
        </button>
      </div>

      {/* Formulario Inline de Creación Rápida */}
      {isCrearEjRapidoOpen && (
        <form
          onSubmit={handleCrearEjercicioRapido}
          className="p-3 rounded-xl bg-card border border-primary/30 space-y-3 animate-in zoom-in-95 duration-150"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-primary uppercase tracking-wide">
              Nuevo Ejercicio en Catálogo
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              required
              placeholder="Nombre (ej. Hip Thrust Mancuerna)"
              value={nuevoEjNombre}
              onChange={(e) => setNuevoEjNombre(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
            />
            <select
              value={nuevoEjGrupo}
              onChange={(e) => setNuevoEjGrupo(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
            >
              <option value="Pecho">Pecho</option>
              <option value="Espalda">Espalda</option>
              <option value="Piernas">Piernas</option>
              <option value="Hombros">Hombros</option>
              <option value="Brazos">Brazos</option>
              <option value="Core">Core</option>
            </select>
            <select
              value={nuevoEjPatron}
              onChange={(e) => setNuevoEjPatron(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
            >
              <option value="Empuje">Empuje</option>
              <option value="Tracción">Tracción</option>
              <option value="Bisagra de Cadera">Bisagra de Cadera</option>
              <option value="Dominante de Rodilla">Dominante de Rodilla</option>
              <option value="Aislamiento">Aislamiento</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCrearEjRapidoOpen(false)}
              className="px-3 py-1 rounded-lg bg-secondary text-muted-foreground text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmittingEj}
              className="px-3 py-1 rounded-lg bg-primary text-primary-foreground font-bold text-xs cursor-pointer"
            >
              {isSubmittingEj ? 'Guardando...' : 'Crear y Asignar a este Día'}
            </button>
          </div>
        </form>
      )}

      {/* Filtro por Grupos y Búsqueda */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['Todos', 'Pecho', 'Espalda', 'Piernas', 'Hombros', 'Brazos', 'Core'].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setSelectedGrupoMuscular(g);
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                selectedGrupoMuscular === g
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
            placeholder="Buscar en catálogo..."
            value={filtroBusquedaEj}
            onChange={(e) => setFiltroBusquedaEj(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
          />
        </div>
      </div>

      {/* Lista de Coincidencias del Catálogo */}
      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
        {catalogoFiltrado.length === 0 ? (
          <div className="p-5 rounded-2xl bg-card border border-dashed border-border text-center space-y-2">
            <Search className="h-5 w-5 text-muted-foreground mx-auto opacity-50" />
            <p className="text-xs font-bold text-foreground">
              Sin resultados en el catálogo
            </p>
            <p className="text-[11px] text-muted-foreground">
              {hayFiltroCatalogo
                ? 'Ajusta el grupo muscular o el término de búsqueda, o crea el ejercicio que falta.'
                : 'Tu catálogo está vacío: crea tu primer ejercicio para asignarlo.'}
            </p>
            <button
              type="button"
              onClick={() => setIsCrearEjRapidoOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 hover:bg-primary text-primary hover:text-primary-foreground font-bold text-[11px] transition-all cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              <span>
                {filtroBusquedaEj.trim()
                  ? `Crear «${filtroBusquedaEj.trim()}»`
                  : 'Crear Ejercicio Nuevo'}
              </span>
            </button>
          </div>
        ) : (
          catalogoFiltrado.map((ej) => (
            <div
              key={ej.id}
              className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/60 hover:border-primary/40 transition-colors text-xs gap-2"
            >
              <div className="min-w-0 flex-1 pr-1">
                <span className="font-bold text-foreground break-words block">{ej.nombre}</span>
                <span className="text-[11px] text-muted-foreground">
                  • {ej.grupoMuscular}
                </span>
              </div>
              <button
                type="button"
                onClick={() => agregarEjercicioADia(ej.nombre, ej.id)}
                className="px-2.5 py-1 rounded-lg bg-primary/15 hover:bg-primary text-primary hover:text-primary-foreground font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer shrink-0"
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
