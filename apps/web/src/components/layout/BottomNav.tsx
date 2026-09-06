import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import {
  Dumbbell,
  Utensils,
  TrendingUp,
  CreditCard,
  LayoutDashboard,
  DollarSign,
  Users,
  Camera,
} from 'lucide-react';

export function BottomNav() {
  const { user } = useAuth();
  const isCoach = user?.rol === 'entrenador';

  const athleteLinks = [
    { to: '/app/hoy', label: 'Hoy', icon: Dumbbell },
    { to: '/app/nutricion', label: 'Nutrición', icon: Utensils },
    { to: '/app/progreso', label: 'Progreso', icon: TrendingUp },
    { to: '/app/pagos', label: 'Cuotas', icon: CreditCard },
  ];

  const coachLinks = [
    { to: '/coach/dashboard', label: 'Comando', icon: LayoutDashboard },
    { to: '/coach/conciliacion', label: 'Conciliar', icon: DollarSign },
    { to: '/coach/alumnos', label: 'Alumnos', icon: Users },
    { to: '/coach/antropometria', label: 'Auditoría', icon: Camera },
  ];

  const links = isCoach ? coachLinks : athleteLinks;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-lg border-t border-border/80 px-2 py-1.5 safe-area-pb">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-200 min-w-[64px] ${
                isActive
                  ? 'text-primary font-bold scale-105'
                  : 'text-muted-foreground hover:text-foreground font-medium'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={`p-1 rounded-lg transition-colors ${
                    isActive ? 'bg-primary/15' : ''
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[11px] mt-0.5 tracking-tight">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
