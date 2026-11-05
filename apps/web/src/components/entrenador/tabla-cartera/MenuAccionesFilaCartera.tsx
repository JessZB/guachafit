/**
 * Menú "Más acciones" de una tarjeta de cartera en móvil (UX-07b, decisión D3).
 *
 * En la tarjeta móvil solo se muestra la acción principal; el resto de acciones viven aquí.
 * Patrón Radix DropdownMenu igual que `components/entrenador/alumno-detalle/MenuAccionesAlumno.tsx`.
 *
 * Props:
 * - `nombre`: nombre del alumno; forma el nombre accesible del disparador.
 * - `onRecordatorio`: si se omite, la opción "Enviar recordatorio" no aparece (ya es la acción visible).
 * - `puedeVerFicha`: sin perfil del alumno, "Ver ficha" aparece deshabilitada.
 * - `onVerFicha`: callback de "Ver ficha".
 *
 * §6: disparador y opciones táctiles `min-h-11`, foco visible, tokens semánticos y texto ≥ 11px.
 */
import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { BellRing, MoreVertical, UserRound } from 'lucide-react';
import { CLASES_SALIDA_POPOVER, useSalidaModal } from '../../../lib/use-salida-modal';

export interface MenuAccionesFilaCarteraProps {
  nombre: string;
  onRecordatorio?: () => void;
  puedeVerFicha: boolean;
  onVerFicha: () => void;
}

const claseTrigger =
  'h-11 w-11 inline-flex items-center justify-center rounded-xl bg-secondary hover:bg-secondary/80 text-foreground border border-border transition-all active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary';

const claseOpcion =
  'flex min-h-11 w-full items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-bold text-foreground cursor-pointer select-none outline-hidden data-[highlighted]:bg-secondary data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary';

export function MenuAccionesFilaCartera({
  nombre,
  onRecordatorio,
  puedeVerFicha,
  onVerFicha,
}: MenuAccionesFilaCarteraProps) {
  // Menú controlado: todo cierre pasa por `cerrar` (salida animada) antes de desmontarse.
  const [abierto, setAbierto] = useState(false);
  const { saliendo, cerrar } = useSalidaModal(() => setAbierto(false));
  // La acción se ejecuta al instante, pero no se repite si el menú ya está saliendo.
  const elegir = (accion: () => void) => () => {
    if (!saliendo) accion();
  };

  return (
    <DropdownMenu.Root
      open={abierto}
      onOpenChange={(siguiente) => (siguiente ? setAbierto(true) : cerrar())}
    >
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label={`Más acciones para ${nombre}`} className={claseTrigger}>
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          data-saliendo={saliendo || undefined}
          className={`z-50 min-w-52 rounded-xl border border-border bg-card p-1.5 shadow-md animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none ${CLASES_SALIDA_POPOVER}`}
        >
          {onRecordatorio && (
            <DropdownMenu.Item className={claseOpcion} onSelect={elegir(onRecordatorio)}>
              <BellRing className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>Enviar recordatorio</span>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item
            className={claseOpcion}
            disabled={!puedeVerFicha}
            onSelect={elegir(onVerFicha)}
          >
            <UserRound className="h-4 w-4" aria-hidden="true" />
            <span>Ver ficha</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
