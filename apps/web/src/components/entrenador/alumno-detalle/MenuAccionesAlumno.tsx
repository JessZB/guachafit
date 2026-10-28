/**
 * Menú "Más acciones" de la cabecera de la ficha del alumno (L7.1–L7.3).
 *
 * Agrupa las acciones del ciclo de vida (pausar, reactivar, suspender por pago y archivar)
 * con Radix DropdownMenu, igual que `components/common/Paginacion.tsx`. Las condiciones de
 * cada opción son las mismas que tenía la cabecera antes de este menú.
 *
 * Decisión del owner (2026-10-26, lote L7 de la ficha del alumno): las acciones del ciclo de vida
 * se agrupan en "Más acciones" en vez de ocupar botones sueltos en la cabecera.
 *
 * §6: trigger y opciones táctiles `min-h-11`, foco visible, tokens semánticos y texto ≥ 11px.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { DollarSign, MoreHorizontal, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { EstadoAlumno } from '@guachafit/shared';

interface MenuAccionesAlumnoProps {
  estado: EstadoAlumno;
  onCambiarEstado: (nuevoEstado: EstadoAlumno) => void;
  onArchivar: () => void;
}

const claseTrigger =
  'min-h-11 py-2 px-3 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs border border-border flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary';

const claseOpcion =
  'flex min-h-11 w-full items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer select-none outline-hidden focus-visible:outline-2 focus-visible:outline-primary';

export function MenuAccionesAlumno({
  estado,
  onCambiarEstado,
  onArchivar,
}: MenuAccionesAlumnoProps) {
  const esActivo = estado === EstadoAlumno.ACTIVO;
  const puedeSuspender = estado !== EstadoAlumno.SUSPENDIDO_PAGO;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={claseTrigger}>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          <span>Más acciones</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-52 rounded-xl border border-border bg-card p-1.5 shadow-md animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
        >
          {esActivo ? (
            <DropdownMenu.Item
              className={`${claseOpcion} text-foreground data-[highlighted]:bg-secondary`}
              onSelect={() => onCambiarEstado(EstadoAlumno.INACTIVO_PAUSADO)}
              title="Pausar alumno temporalmente por viaje o lesión"
            >
              <PauseCircle className="h-4 w-4 text-warning" aria-hidden="true" />
              <span>Pausar</span>
            </DropdownMenu.Item>
          ) : (
            <DropdownMenu.Item
              className={`${claseOpcion} text-foreground data-[highlighted]:bg-secondary`}
              onSelect={() => onCambiarEstado(EstadoAlumno.ACTIVO)}
              title="Reactivar alumno"
            >
              <PlayCircle className="h-4 w-4 text-success" aria-hidden="true" />
              <span>Reactivar</span>
            </DropdownMenu.Item>
          )}

          {puedeSuspender && (
            <DropdownMenu.Item
              className={`${claseOpcion} text-foreground data-[highlighted]:bg-secondary`}
              onSelect={() => onCambiarEstado(EstadoAlumno.SUSPENDIDO_PAGO)}
              title="Suspender la planificación por mensualidad pendiente"
            >
              <DollarSign className="h-4 w-4 text-warning" aria-hidden="true" />
              <span>Suspender por pago</span>
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item
            className={`${claseOpcion} text-destructive data-[highlighted]:bg-destructive/10`}
            onSelect={() => onArchivar()}
            title="Archivar alumno (sus datos se conservan)"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span>Archivar</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
