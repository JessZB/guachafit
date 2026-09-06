import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import { Rol } from '@guachafit/shared';

interface ProtectedRouteProps {
  allowedRoles?: Rol[];
  redirectTo?: string;
}

export function ProtectedRoute({ allowedRoles, redirectTo = '/login' }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to={redirectTo} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.rol)) {
    // Redirect to their respective default home
    const defaultRoute = user.rol === Rol.ENTRENADOR ? '/coach/dashboard' : '/app/hoy';
    return <Navigate to={defaultRoute} replace />;
  }

  return <Outlet />;
}
