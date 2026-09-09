import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/30">
      <Header />
      <div className="flex-1 flex">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-6xl w-full mx-auto animate-fade-in">
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[50vh] w-full">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/20 border-t-primary" />
                  <span className="text-xs font-mono font-medium text-muted-foreground animate-pulse">
                    Cargando módulo...
                  </span>
                </div>
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
