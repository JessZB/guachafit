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
} from 'lucide-react';

export function BottomNav() {
  const { user } = useAuth();
  const isCoach = user?.rol === 'entrenador';
  const isSuperadmin = user?.rol === 'superadmin';

  const athleteLinks = [
    { to: '/app/menu', label: 'Menú', icon: LayoutGrid },
    { to: '/app/hoy', label: 'Ir a entrenar', icon: Dumbbell, isCenter: true },
    { to: '/app/pagos', label: 'Pagos', icon: CreditCard },
  ];

  const coachLinks = [
    { to: '/coach/menu', label: 'Menú', icon: LayoutGrid },
    { to: '/coach/dashboard', label: 'Panel', icon: LayoutDashboard, isCenter: true },
    { to: '/coach/alumnos', label: 'Alumnos', icon: Users },
  ];

  const adminLinks = [
    { to: '/admin', label: 'Admin', icon: ShieldCheck, isCenter: true },
  ];

  const links = isSuperadmin ? adminLinks : isCoach ? coachLinks : athleteLinks;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-lg border-t border-border/80 px-4 pt-2 safe-area-pb">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {links.map(({ to, label, icon: Icon, isCenter }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-4 rounded-2xl transition-all duration-200 min-w-[72px] ${
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
                  <Icon className="h-5 w-5" />
                </div>
                <span className={`text-[11px] mt-1 tracking-tight text-center ${isCenter && isActive ? 'text-primary font-bold' : ''}`}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
