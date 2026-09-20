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
} from 'lucide-react';

export function Sidebar() {
  const { user } = useAuth();
  const isCoach = user?.rol === 'entrenador';

  const athleteLinks = [
    { to: '/app/menu', label: 'Menú de Acciones', icon: LayoutGrid, description: 'Todos tus accesos' },
    { to: '/app/hoy', label: '¡A entrenar!', icon: Dumbbell, description: 'Sesión activa del día' },
    { to: '/app/nutricion', label: 'Mi Comida', icon: Utensils, description: 'Cómo vas hoy' },
    { to: '/app/progreso', label: 'Mi Progreso', icon: TrendingUp, description: 'Fotos y medidas' },
    { to: '/app/pagos', label: 'Pagos y Cuotas', icon: CreditCard, description: 'Saldo y comprobantes' },
  ];

  const coachLinks = [
    { to: '/coach/menu', label: 'Menú de Acciones', icon: LayoutGrid, description: 'Todas tus tareas' },
    { to: '/coach/dashboard', label: 'Panel administrativo', icon: LayoutDashboard, description: 'Resumen y cobros' },
    { to: '/coach/monitor-adherencia', label: 'Seguimiento de Alumnos', icon: Activity, description: 'Riesgo semanal de tus alumnos' },
    { to: '/coach/conciliacion', label: 'Validar Pagos', icon: DollarSign, description: 'Pagos por confirmar' },
    { to: '/coach/alumnos', label: 'Mis Alumnos', icon: Users, description: 'Datos, planes y pagos' },
    { to: '/coach/plantillas', label: 'Plantillas de ejercicios', icon: ClipboardList, description: 'Rutinas reutilizables' },
    { to: '/coach/antropometria', label: 'Revisar Evaluaciones', icon: Camera, description: 'Medidas y fotos de progreso' },
    { to: '/coach/ajustes', label: 'Configuración', icon: SlidersHorizontal, description: 'Planes y tasas' },
  ];

  const links = isCoach ? coachLinks : athleteLinks;

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r border-border/80 bg-card/40 p-4 min-h-[calc(100vh-57px)]">
      <div className="mb-6 px-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span>{isCoach ? 'Gestión Diaria' : 'Rendimiento Personal'}</span>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {links.map(({ to, label, icon: Icon, description }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-start gap-3 p-3 rounded-xl transition-all duration-150 ${
                isActive
                  ? 'bg-primary/15 text-primary font-semibold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              }`
            }
          >
            <Icon className="h-5 w-5 mt-0.5 shrink-0" />
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-none">{label}</span>
              <span className="text-[11px] text-muted-foreground mt-1">{description}</span>
            </div>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
