import React, { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Rol } from '@guachafit/shared';
import { useAuth } from './context/auth-context';

// Layout & Guards
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/common/ProtectedRoute';

// Public Page Fallback
function PublicFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/20 border-t-primary" />
        <span className="text-xs font-mono font-medium text-muted-foreground animate-pulse">
          Cargando GUACHAFIT...
        </span>
      </div>
    </div>
  );
}

// Lazy Public Pages
const LoginPage = lazy(() =>
  import('./pages/auth/LoginPage').then((m) => ({ default: m.LoginPage }))
);
const OnboardingPage = lazy(() =>
  import('./pages/auth/OnboardingPage').then((m) => ({ default: m.OnboardingPage }))
);

// Lazy Athlete Pages
const EntrenamientoPage = lazy(() =>
  import('./pages/atleta/EntrenamientoPage').then((m) => ({ default: m.EntrenamientoPage }))
);
const AtletaMenuPage = lazy(() =>
  import('./pages/atleta/AtletaMenuPage').then((m) => ({ default: m.AtletaMenuPage }))
);
const NutricionPage = lazy(() =>
  import('./pages/atleta/NutricionPage').then((m) => ({ default: m.NutricionPage }))
);
const ProgresoPage = lazy(() =>
  import('./pages/atleta/ProgresoPage').then((m) => ({ default: m.ProgresoPage }))
);
const PagosPage = lazy(() =>
  import('./pages/atleta/PagosPage').then((m) => ({ default: m.PagosPage }))
);

// Lazy Coach Pages
const DashboardPage = lazy(() =>
  import('./pages/entrenador/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const CoachMenuPage = lazy(() =>
  import('./pages/entrenador/CoachMenuPage').then((m) => ({ default: m.CoachMenuPage }))
);
const ConciliacionPage = lazy(() =>
  import('./pages/entrenador/ConciliacionPage').then((m) => ({ default: m.ConciliacionPage }))
);
const AlumnosPage = lazy(() =>
  import('./pages/entrenador/AlumnosPage').then((m) => ({ default: m.AlumnosPage }))
);
const MonitorAdherenciaPage = lazy(() =>
  import('./pages/entrenador/MonitorAdherenciaPage').then((m) => ({
    default: m.MonitorAdherenciaPage,
  }))
);
const AlumnoDetallePage = lazy(() =>
  import('./pages/entrenador/AlumnoDetallePage').then((m) => ({ default: m.AlumnoDetallePage }))
);
const AntropometriaPage = lazy(() =>
  import('./pages/entrenador/AntropometriaPage').then((m) => ({ default: m.AntropometriaPage }))
);
const PlantillasPage = lazy(() =>
  import('./pages/entrenador/PlantillasPage').then((m) => ({ default: m.PlantillasPage }))
);
const AjustesPage = lazy(() =>
  import('./pages/entrenador/AjustesPage').then((m) => ({ default: m.AjustesPage }))
);

function RootRedirect() {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  // WU12: primer aterrizaje tras login = menú de cada rol (el dashboard y el "hoy" se abren desde ahí).
  return user.rol === Rol.ENTRENADOR ? (
    <Navigate to="/coach/menu" replace />
  ) : (
    <Navigate to="/app/menu" replace />
  );
}

export const router = createBrowserRouter([
  // Public Routes
  {
    path: '/login',
    element: (
      <Suspense fallback={<PublicFallback />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/onboarding',
    element: (
      <Suspense fallback={<PublicFallback />}>
        <OnboardingPage />
      </Suspense>
    ),
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
            path: '/coach/monitor-adherencia',
            element: <MonitorAdherenciaPage />,
          },
          {
            path: '/coach/alumnos/:id',
            element: <AlumnoDetallePage />,
          },
          {
            path: '/coach/plantillas',
            element: <PlantillasPage />,
          },
          {
            path: '/coach/antropometria',
            element: <AntropometriaPage />,
          },
          {
            path: '/coach/ajustes',
            element: <AjustesPage />,
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
