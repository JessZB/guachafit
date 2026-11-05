/**
 * Menú "Cuenta" de la cabecera (UX-04): correo, rol, Ajustes, tema y cierre de sesión en un
 * único Radix DropdownMenu, en todos los tamaños de pantalla.
 *
 * Componente presentacional: recibe los datos y los callbacks; no consulta hooks de dominio.
 *
 * §6: disparador y opciones táctiles `min-h-11`, foco visible, tokens semánticos, texto ≥ 11px
 * y pesos ≤ 700.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Link } from 'react-router-dom';
import { useTransicionVista } from '../../lib/use-transicion-vista';
import { Check, Laptop, LogOut, Moon, Settings, Sun, UserRound } from 'lucide-react';
import { etiquetaRol } from '../../lib/etiquetas-dominio';

export type TemaInterfaz = 'light' | 'dark' | 'system';

export interface MenuCuentaProps {
  email: string;
  rol: string;
  tema: TemaInterfaz;
  onCambiarTema: (tema: TemaInterfaz) => void;
  /** Ruta de Ajustes del rol; `null` si el rol no tiene pantalla de Ajustes. */
  rutaAjustes: string | null;
  onCerrarSesion: () => void;
}

const OPCIONES_TEMA = [
  { valor: 'light' as const, etiqueta: 'Claro', Icono: Sun },
  { valor: 'dark' as const, etiqueta: 'Oscuro', Icono: Moon },
  { valor: 'system' as const, etiqueta: 'Sistema', Icono: Laptop },
];

const claseDisparador =
  'h-11 w-11 inline-flex items-center justify-center rounded-xl border border-border bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary';

const claseOpcion =
  'flex min-h-11 w-full items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer select-none outline-hidden data-[highlighted]:bg-secondary focus-visible:outline-2 focus-visible:outline-primary';

export function MenuCuenta({
  email,
  rol,
  tema,
  onCambiarTema,
  rutaAjustes,
  onCerrarSesion,
}: MenuCuentaProps) {
  const etiqueta = etiquetaRol(rol);
  const viewTransition = useTransicionVista();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label="Cuenta" title="Cuenta" className={claseDisparador}>
          <UserRound className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-52 rounded-2xl border border-border bg-card p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
        >
          <div className="px-2.5 py-2 space-y-0.5">
            <p className="text-xs font-semibold text-foreground break-all">{email}</p>
            {etiqueta && <p className="text-[11px] text-muted-foreground">{etiqueta}</p>}
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          {rutaAjustes && (
            <DropdownMenu.Item asChild className={`${claseOpcion} text-foreground`}>
              <Link to={rutaAjustes} viewTransition={viewTransition}>
                <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span>Ajustes</span>
              </Link>
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Label className="px-2.5 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Tema
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={tema}
            onValueChange={(valor) => onCambiarTema(valor as TemaInterfaz)}
          >
            {OPCIONES_TEMA.map(({ valor, etiqueta: etiquetaTema, Icono }) => (
              <DropdownMenu.RadioItem key={valor} value={valor} className={`${claseOpcion} justify-between text-foreground`}>
                <span className="flex items-center gap-2">
                  <Icono className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  {etiquetaTema}
                </span>
                <DropdownMenu.ItemIndicator>
                  <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item
            className={`${claseOpcion} text-destructive data-[highlighted]:bg-destructive/10`}
            onSelect={() => onCerrarSesion()}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Cerrar sesión</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
