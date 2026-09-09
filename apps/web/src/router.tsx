import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Rol } from '@guachafit/shared';
import { useAuth } from './context/auth-context';

// Layout & Guards
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/common/ProtectedRoute';

// Pages
import { LoginPage } from './pages/auth/LoginPage';
import { OnboardingPage } from './pages/auth/OnboardingPage';
import { EntrenamientoPage } from './pages/atleta/EntrenamientoPage';
import { NutricionPage } from './pages/atleta/NutricionPage';
import { PagosPage } from './pages/atleta/PagosPage';
import { ProgresoPage } from './pages/atleta/ProgresoPage';
import { AtletaMenuPage } from './pages/atleta/AtletaMenuPage';
import { CoachMenuPage } from './pages/entrenador/CoachMenuPage';
import { DashboardPage } from './pages/entrenador/DashboardPage';
import { ConciliacionPage } from './pages/entrenador/ConciliacionPage';
import { AlumnosPage } from './pages/entrenador/AlumnosPage';
import { AntropometriaPage } from './pages/entrenador/AntropometriaPage';

function RootRedirect() {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  return user.rol === Rol.ENTRENADOR ? (
    <Navigate to="/coach/dashboard" replace />
  ) : (
    <Navigate to="/app/hoy" replace />
  );
}

export const router = createBrowserRouter([
  // Public Routes
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/onboarding',
    element: <OnboardingPage />,
  },
  {
    path: '/',
    element: <RootRedirect />,
  },

  // Athlete Protected Routes
  {
    element: <ProtectedRoute allowedRoles={[Rol.ALUMNO, Rol.SUPERADMIN]} />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: '/app/hoy',
            element: <EntrenamientoPage />,
          },
          {
            path: '/app/menu',
            element: <AtletaMenuPage />,
          },
          {
            path: '/app/nutricion',
            element: <NutricionPage />,
          },
          {
            path: '/app/progreso',
            element: <ProgresoPage />,
          },
          {
            path: '/app/pagos',
            element: <PagosPage />,
          },
        ],
      },
    ],
  },

  // Coach Protected Routes
  {
    element: <ProtectedRoute allowedRoles={[Rol.ENTRENADOR, Rol.SUPERADMIN]} />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: '/coach/dashboard',
            element: <DashboardPage />,
          },
          {
            path: '/coach/menu',
            element: <CoachMenuPage />,
          },
          {
            path: '/coach/conciliacion',
            element: <ConciliacionPage />,
          },
          {
            path: '/coach/alumnos',
            element: <AlumnosPage />,
          },
          {
            path: '/coach/antropometria',
            element: <AntropometriaPage />,
          },
        ],
      },
    ],
  },

  // Fallback
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
