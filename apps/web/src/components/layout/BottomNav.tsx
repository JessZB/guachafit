import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import {
  Dumbbell,
  LayoutGrid,
  CreditCard,
  LayoutDashboard,
  Users,
  ShieldCheck,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { DESTINOS_ENTRENADOR } from '../../lib/etiquetas-dominio';
import { usePendientesNavegacion } from '../../lib/use-pendientes-navegacion';
import { insigniasPendientes } from '../../lib/insignias-pendientes';
import { InsigniaConteo } from '../ui/InsigniaConteo';
import type { InsigniaDestino } from '../../lib/insignias-pendientes';

/** Enlace de la barra inferior; `insignia` solo en el destino que muestra pendientes. */
interface EnlaceBarra {
  to: string;
  label: string;
  icon: LucideIcon;
  isCenter?: boolean;
  insignia?: InsigniaDestino;
}

export function BottomNav() {
  const { user } = useAuth();
  const pendientes = usePendientesNavegacion();
  const insignias = insigniasPendientes(pendientes);
  const isCoach = user?.rol === 'entrenador';
  const isSuperadmin = user?.rol === 'superadmin';

  const athleteLinks: EnlaceBarra[] = [
    { to: '/app/menu', label: 'Menú', icon: LayoutGrid },
    { to: '/app/hoy', label: 'Ir a entrenar', icon: Dumbbell, isCenter: true },
    { to: '/app/pagos', label: 'Pagos', icon: CreditCard },
  ];

  // "Mis alumnos" cabe en la barra a 360px (3 ítems de ~72–90px sobre 328px útiles).
  const coachLinks: EnlaceBarra[] = [
    { to: DESTINOS_ENTRENADOR.menu.ruta, label: DESTINOS_ENTRENADOR.menu.etiqueta, icon: LayoutGrid },
    {
      to: DESTINOS_ENTRENADOR.panel.ruta,
      label: DESTINOS_ENTRENADOR.panel.etiqueta,
      icon: LayoutDashboard,
      isCenter: true,
      insignia: insignias.panel,
    },
    { to: DESTINOS_ENTRENADOR.alumnos.ruta, label: DESTINOS_ENTRENADOR.alumnos.etiqueta, icon: Users },
  ];

  const adminLinks: EnlaceBarra[] = [
    { to: '/admin', label: 'Admin', icon: ShieldCheck, isCenter: true },
    { to: '/admin/ajustes', label: 'Ajustes', icon: Settings },
  ];

  const links = isSuperadmin ? adminLinks : isCoach ? coachLinks : athleteLinks;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-lg border-t border-border/80 px-4 pt-2 safe-area-pb">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {links.map(({ to, label, icon: Icon, isCenter, insignia }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center py-1 px-4 rounded-2xl transition-all duration-200 min-w-[72px] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${
                isActive
                  ? 'text-primary font-bold'
                  : 'text-muted-foreground hover:text-foreground font-medium'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={`p-1.5 rounded-xl transition-all duration-200 ${
                    isCenter
                      ? isActive
                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25 scale-110'
                        : 'bg-secondary text-foreground hover:bg-secondary/80'
                      : isActive
                      ? 'bg-primary/15 text-primary scale-105'
                      : ''
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className={`text-[11px] mt-1 tracking-tight text-center ${isCenter && isActive ? 'text-primary font-bold' : ''}`}>
                  {label}
                </span>
                {/* La insignia va después del texto en el DOM: el nombre empieza por "Panel". */}
                {/* Sin pendientes no se pinta el contenedor vacío (InsigniaConteo devuelve null). */}
                {insignia && insignia.conteo !== null && insignia.conteo > 0 && (
                  <span className="absolute top-0 right-2">
                    <InsigniaConteo conteo={insignia.conteo} descripcion={insignia.descripcion} />
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
