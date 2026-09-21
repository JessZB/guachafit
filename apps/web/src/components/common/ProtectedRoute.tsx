import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import { Rol } from '@guachafit/shared';
import { rutaInicioPorRol } from '../../lib/rutas-rol';

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
    // RF-010 RN-01: cada rol vuelve a su propio espacio (el superadmin a /admin).
    return <Navigate to={rutaInicioPorRol(user.rol)} replace />;
  }

  return <Outlet />;
}
