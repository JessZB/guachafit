import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { ActualizacionDisponible } from '../common/ActualizacionDisponible';
import { EstadoCarga } from '../ui/EstadoCarga';
import { AvisoZonaDiscrepante } from './AvisoZonaDiscrepante';
import { useAuth } from '../../context/auth-context';

export function AppLayout() {
  const { isDemoMode } = useAuth();

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground selection:bg-primary/30">
      <Header />
      {/* U4 (Ola 4): franja de versión nueva en el flujo del layout (no tapa la bottom nav). */}
      <ActualizacionDisponible />
      {isDemoMode && (
        <div
          role="status"
          className="w-full bg-warning/15 border-b border-warning/30 text-warning px-4 py-1.5 flex items-center justify-center gap-2 text-[11px] sm:text-xs font-bold tracking-wide"
        >
          <FlaskConical className="h-3.5 w-3.5 shrink-0" />
          <span>Modo demo — datos de ejemplo</span>
        </div>
      )}
      <div className="flex-1 flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 safe-area-content-pb lg:pb-8 max-w-6xl w-full mx-auto animate-fade-in">
          <Suspense
            fallback={
              <EstadoCarga texto="Cargando contenido…" claseContenedor="min-h-[50vh] w-full" />
            }
          >
            <Outlet />
          </Suspense>
          {/* ZH-1 (ADR-025): aviso de zona del dispositivo; decide por sí solo si se muestra. */}
          <AvisoZonaDiscrepante />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
