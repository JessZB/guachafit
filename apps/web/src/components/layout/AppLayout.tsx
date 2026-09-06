import React from 'react';
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
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
