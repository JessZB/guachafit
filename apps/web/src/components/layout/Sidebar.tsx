import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import {
  Dumbbell,
  LayoutGrid,
  Utensils,
  TrendingUp,
  CreditCard,
  LayoutDashboard,
  DollarSign,
  Users,
  Camera,
  SlidersHorizontal,
  Activity,
  ClipboardList,
  ShieldCheck,
  Wallet,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { DESTINOS_ENTRENADOR } from '../../lib/etiquetas-dominio';
import { usePendientesNavegacion } from '../../lib/use-pendientes-navegacion';
import { insigniasPendientes } from '../../lib/insignias-pendientes';
import { InsigniaConteo } from '../ui/InsigniaConteo';
import type { InsigniaDestino } from '../../lib/insignias-pendientes';

/** Enlace de la navegación lateral; `insignia` solo en los destinos con pendientes. */
interface EnlaceSidebar {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
  insignia?: InsigniaDestino;
}

export function Sidebar() {
  const { user } = useAuth();
  const pendientes = usePendientesNavegacion();
  const insignias = insigniasPendientes(pendientes);
  const isCoach = user?.rol === 'entrenador';
  const isSuperadmin = user?.rol === 'superadmin';

  const athleteLinks: EnlaceSidebar[] = [
    { to: '/app/menu', label: 'Menú de Acciones', icon: LayoutGrid, description: 'Todos tus accesos' },
    { to: '/app/hoy', label: '¡A entrenar!', icon: Dumbbell, description: 'Sesión activa del día' },
    { to: '/app/nutricion', label: 'Mi Comida', icon: Utensils, description: 'Cómo vas hoy' },
    { to: '/app/progreso', label: 'Mi progreso', icon: TrendingUp, description: 'Fotos y medidas' },
    { to: '/app/pagos', label: 'Pagos y cuotas', icon: CreditCard, description: 'Saldo y comprobantes' },
    { to: '/app/ajustes', label: 'Ajustes', icon: Settings, description: 'Perfil, acceso y avisos' },
  ];

  const coachLinks: EnlaceSidebar[] = [
    { to: DESTINOS_ENTRENADOR.menu.ruta, label: DESTINOS_ENTRENADOR.menu.etiqueta, icon: LayoutGrid, description: 'Todas tus tareas' },
    { to: DESTINOS_ENTRENADOR.panel.ruta, label: DESTINOS_ENTRENADOR.panel.etiqueta, icon: LayoutDashboard, description: 'Resumen y cobros' },
    { to: DESTINOS_ENTRENADOR.seguimiento.ruta, label: DESTINOS_ENTRENADOR.seguimiento.etiqueta, icon: Activity, description: 'Riesgo semanal de tus alumnos', insignia: insignias.seguimiento },
    { to: DESTINOS_ENTRENADOR.controlCobros.ruta, label: DESTINOS_ENTRENADOR.controlCobros.etiqueta, icon: Wallet, description: 'Mora, vencimientos y recordatorios', insignia: insignias.controlCobros },
    { to: DESTINOS_ENTRENADOR.pagosPorValidar.ruta, label: DESTINOS_ENTRENADOR.pagosPorValidar.etiqueta, icon: DollarSign, description: 'Pagos por confirmar', insignia: insignias.pagosPorValidar },
    { to: DESTINOS_ENTRENADOR.alumnos.ruta, label: DESTINOS_ENTRENADOR.alumnos.etiqueta, icon: Users, description: 'Datos, planes y pagos' },
    { to: DESTINOS_ENTRENADOR.plantillas.ruta, label: DESTINOS_ENTRENADOR.plantillas.etiqueta, icon: ClipboardList, description: 'Rutinas reutilizables' },
    { to: DESTINOS_ENTRENADOR.evaluaciones.ruta, label: DESTINOS_ENTRENADOR.evaluaciones.etiqueta, icon: Camera, description: 'Medidas y fotos de progreso', insignia: insignias.evaluaciones },
    { to: DESTINOS_ENTRENADOR.ajustes.ruta, label: DESTINOS_ENTRENADOR.ajustes.etiqueta, icon: SlidersHorizontal, description: 'Perfil, avisos, planes y tasas' },
  ];

  // RF-010 RN-01: el superadmin solo ve el acceso administrativo; nunca el negocio del coach.
  const adminLinks: EnlaceSidebar[] = [
    { to: '/admin', label: 'Administración', icon: ShieldCheck, description: 'Crear entrenadores' },
    { to: '/admin/ajustes', label: 'Ajustes', icon: Settings, description: 'Tu correo y contraseña' },
  ];

  const links = isSuperadmin ? adminLinks : isCoach ? coachLinks : athleteLinks;

  // En desktop la sidebar queda fija bajo el header sticky. 61.5px = altura del header en lg
  // (pt 12 + pb 12 + borde 1 + fila de 36.5px); debe coincidir con Header.tsx.
  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-border/80 bg-card/40 p-4 lg:sticky lg:top-[61.5px] lg:self-start lg:h-[calc(100dvh-61.5px)] lg:overflow-y-auto">
      <div className="mb-6 px-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Activity className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span>
            {isSuperadmin ? 'Plataforma' : isCoach ? 'Gestión Diaria' : 'Rendimiento Personal'}
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {links.map(({ to, label, icon: Icon, description, insignia }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-start gap-3 p-3 rounded-xl transition-all duration-150 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${
                isActive
                  ? 'bg-primary/15 text-primary font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              }`
            }
          >
            <Icon className="h-5 w-5 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex flex-col">
              <span className="flex items-center gap-2 text-sm font-medium leading-none">
                {label}
                <InsigniaConteo conteo={insignia?.conteo ?? null} descripcion={insignia?.descripcion ?? ''} />
              </span>
              <span className="text-[11px] text-muted-foreground mt-1">{description}</span>
            </div>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
