import React, { useState, useEffect } from 'react';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../context/auth-context';
import { processOutboxQueue, subscribeToSyncStatus, type SyncStatusState } from '../../lib/offline-sync';
import { SyncQueuePanel } from '../common/SyncQueuePanel';
import {
  AlertTriangle,
  Dumbbell,
  Sun,
  Moon,
  Laptop,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  User as UserIcon,
} from 'lucide-react';

export function Header() {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncState, setSyncState] = useState<SyncStatusState>({
    isSyncing: false,
    summary: { pending: 0, failed: 0, rejected: 0 },
  });
  const [isSyncPanelOpen, setIsSyncPanelOpen] = useState(false);

  const { pending, failed, rejected } = syncState.summary;
  const issueCount = failed + rejected;
  const isSyncing = syncState.isSyncing;

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // WU4: el estado (pendientes/fallidas/rechazadas) llega ya refrescado desde IndexedDB.
    const unsubscribe = subscribeToSyncStatus(setSyncState);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const handleManualSync = async () => {
    if (isOnline && !isSyncing) {
      await processOutboxQueue();
    }
  };

  const issueTitle =
    rejected > 0
      ? `${rejected} cambio${rejected > 1 ? 's' : ''} rechazado${rejected > 1 ? 's' : ''}${
          failed > 0 ? ` y ${failed} fallido${failed > 1 ? 's' : ''}` : ''
        }. Clic para revisar.`
      : `${failed} cambio${failed > 1 ? 's' : ''} fallido${failed > 1 ? 's' : ''}. Clic para revisar.`;

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/95 backdrop-blur-md px-4 sm:px-8 py-3 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-md shadow-primary/25">
            <Dumbbell className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-lg tracking-tight text-foreground leading-none">
              GUACHAFIT
            </span>
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">
              {user?.rol === 'entrenador'
                ? 'Panel del entrenador'
                : user?.rol === 'superadmin'
                ? 'Administración de la plataforma'
                : 'App del alumno'}
            </span>
          </div>
        </div>

        {/* Connectivity, Theme & User */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Connectivity badge */}
          <div
            onClick={handleManualSync}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all ${
              isOnline
                ? pending > 0
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-destructive/15 text-destructive border border-destructive/30'
            }`}
            title={
              pending > 0
                ? `${pending} mutaciones pendientes. Clic para sincronizar.`
                : isOnline
                ? 'Conexión activa'
                : 'Modo sin conexión'
            }
          >
            {isOnline ? (
              pending > 0 ? (
                <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
              ) : (
                <Wifi className="h-3 w-3" />
              )
            ) : (
              <WifiOff className="h-3 w-3" />
            )}

            <span className="hidden sm:inline">
              {isOnline
                ? pending > 0
                  ? `${pending} pendiente${pending > 1 ? 's' : ''}`
                  : 'Online'
                : 'Offline'}
            </span>
          </div>

          {/* WU4: cambios rechazados/fallidos visibles y accionables */}
          {issueCount > 0 && (
            <button
              type="button"
              onClick={() => setIsSyncPanelOpen(true)}
              title={issueTitle}
              aria-label={issueTitle}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer border transition-all active:scale-95 ${
                rejected > 0
                  ? 'bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/25'
                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
              }`}
            >
              <AlertTriangle className="h-3 w-3" />
              <span>{issueCount}</span>
              <span className="hidden sm:inline">
                {rejected > 0 ? 'rechazado' : 'fallido'}
                {issueCount > 1 ? 's' : ''}
              </span>
            </button>
          )}

          {/* Theme selector */}
          <div className="flex items-center bg-secondary/60 rounded-lg p-0.5 border border-border">
            <button
              onClick={() => setTheme('light')}
              className={`p-1.5 rounded-md transition-colors ${
                theme === 'light'
                  ? 'bg-background shadow-xs text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Modo Claro"
            >
              <Sun className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`p-1.5 rounded-md transition-colors ${
                theme === 'dark'
                  ? 'bg-background shadow-xs text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Modo Oscuro (OLED)"
            >
              <Moon className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setTheme('system')}
              className={`p-1.5 rounded-md transition-colors ${
                theme === 'system'
                  ? 'bg-background shadow-xs text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Sistema"
            >
              <Laptop className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* User profile & Logout */}
          {user && (
            <div className="flex items-center gap-2 pl-2 border-l border-border/80">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                  {user.email.split('@')[0]}
                </span>
                <span className="text-[10px] text-muted-foreground capitalize">{user.rol}</span>
              </div>
              <button
                onClick={logout}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      <SyncQueuePanel open={isSyncPanelOpen} onClose={() => setIsSyncPanelOpen(false)} />
    </>
  );
}
