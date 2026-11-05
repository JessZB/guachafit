import React, { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { ActualizacionDisponible } from '../common/ActualizacionDisponible';
import { EstadoCarga } from '../ui/EstadoCarga';
import { AvisoZonaDiscrepante } from './AvisoZonaDiscrepante';
import { EntradaVista } from './EntradaVista';
import { useAuth } from '../../context/auth-context';

export function AppLayout() {
  const { isDemoMode } = useAuth();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const rutaPrevia = useRef(pathname);

  // Cada módulo se abre desde arriba. En este layout scrolla la ventana (el `<main>` crece con su
  // contenido dentro de un contenedor `min-h-dvh`), pero se reinicia también el `<main>` por si un
  // ancestro lo acota. Solo actúa cuando la ruta cambia (no en el primer render, ni en el doble efecto de StrictMode).
  useEffect(() => {
    if (rutaPrevia.current === pathname) return;
    rutaPrevia.current = pathname;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [pathname]);

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
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 safe-area-content-pb lg:pb-8 max-w-6xl w-full mx-auto"
        >
          <EntradaVista>
            <Suspense
              fallback={
                <EstadoCarga texto="Cargando contenido…" claseContenedor="min-h-[50vh] w-full" />
              }
            >
              <Outlet />
            </Suspense>
          </EntradaVista>
          {/* ZH-1 (ADR-025): aviso de zona del dispositivo; decide por sí solo si se muestra. */}
          <AvisoZonaDiscrepante />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
