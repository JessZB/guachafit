import React, { useState, useEffect } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../context/auth-context';
import { processOutboxQueue, subscribeToSyncStatus, type SyncStatusState } from '../../lib/offline-sync';
import { SyncQueuePanel } from '../common/SyncQueuePanel';
import { InstalarAppPrompt } from '../common/InstalarAppPrompt';
import { DialogoLogoutPendientes } from '../common/DialogoLogoutPendientes';
import { useLogoutSeguro } from '../../lib/use-logout-seguro';
import {
  AlertTriangle,
  Check,
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

/** U2 (Ola 4): opciones de tema compartidas por el segmentado (sm+) y el menú móvil. */
const OPCIONES_TEMA = [
  { valor: 'light' as const, etiqueta: 'Claro', Icono: Sun },
  { valor: 'dark' as const, etiqueta: 'Oscuro', Icono: Moon },
  { valor: 'system' as const, etiqueta: 'Sistema', Icono: Laptop },
];

export function Header() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  // U4 (Ola 4): el logout consulta la cola offline antes de cerrar; si hay trabajo sin subir,
  // pide confirmación explícita (o sincronizar) en vez de descartarlo en silencio.
  const logoutSeguro = useLogoutSeguro();
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
      <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/95 backdrop-blur-md px-4 sm:px-8 pb-3 safe-area-pt flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-md shadow-primary/25">
            <Dumbbell className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-lg tracking-tight text-foreground leading-none">
              GUACHAFIT
            </span>
            <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">
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
          {/* Connectivity badge: U3b lo convierte en botón real (teclado + aria-label) */}
          <button
            type="button"
            onClick={() => void handleManualSync()}
            aria-label={
              pending > 0
                ? `Sincronizar ${pending} cambio${pending > 1 ? 's' : ''} pendiente${
                    pending > 1 ? 's' : ''
                  }`
                : isOnline
                ? 'Sincronizar cambios pendientes'
                : 'Sin conexión. La sincronización se reanudará al recuperar señal'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition-all focus-visible:outline-2 focus-visible:outline-primary ${
              isOnline
                ? pending > 0
                  ? 'bg-warning/15 text-warning border border-warning/30'
                  : 'bg-success/10 text-success border border-success/20'
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
          </button>

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
                  : 'bg-warning/15 text-warning border-warning/30 hover:bg-warning/25'
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

          {/* U1 (Ola 4): instalación PWA (A2HS) — invisible si ya está instalada o fue descartada */}
          <InstalarAppPrompt />

          {/* U2 (Ola 4): en móvil el tema va en un menú de 44px (el segmentado de 3 botones
              no cabe a 360px sin romper el header); desde sm se mantiene el segmentado. */}
          <div className="hidden sm:flex items-center bg-secondary/60 rounded-lg p-0.5 border border-border">
            {OPCIONES_TEMA.map(({ valor, etiqueta, Icono }) => (
              <button
                key={valor}
                type="button"
                onClick={() => setTheme(valor)}
                className={`p-1.5 rounded-md transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
                  theme === valor
                    ? 'bg-background shadow-xs text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title={`Modo ${etiqueta}`}
                aria-pressed={theme === valor}
              >
                <Icono className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label="Cambiar tema de la interfaz"
                title="Cambiar tema"
                className="sm:hidden h-11 w-11 inline-flex items-center justify-center rounded-xl border border-border bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
              >
                {theme === 'light' ? (
                  <Sun className="h-4 w-4" />
                ) : theme === 'dark' ? (
                  <Moon className="h-4 w-4" />
                ) : (
                  <Laptop className="h-4 w-4" />
                )}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 min-w-40 rounded-2xl border border-border bg-card p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-150"
              >
                <DropdownMenu.Label className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Tema
                </DropdownMenu.Label>
                <DropdownMenu.RadioGroup
                  value={theme}
                  onValueChange={(valor) => setTheme(valor as 'light' | 'dark' | 'system')}
                >
                  {OPCIONES_TEMA.map(({ valor, etiqueta, Icono }) => (
                    <DropdownMenu.RadioItem
                      key={valor}
                      value={valor}
                      className="flex min-h-11 items-center justify-between gap-3 px-2.5 rounded-xl text-xs font-bold text-foreground cursor-pointer select-none outline-hidden data-[highlighted]:bg-secondary focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="flex items-center gap-2">
                        <Icono className="h-3.5 w-3.5 text-muted-foreground" />
                        {etiqueta}
                      </span>
                      <DropdownMenu.ItemIndicator>
                        <Check className="h-3.5 w-3.5 text-primary" />
                      </DropdownMenu.ItemIndicator>
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {/* User profile & Logout */}
          {user && (
            <div className="flex items-center gap-2 pl-2 border-l border-border/80">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                  {user.email.split('@')[0]}
                </span>
                <span className="text-[11px] text-muted-foreground capitalize">{user.rol}</span>
              </div>
              <button
                type="button"
                onClick={() => void logoutSeguro.solicitarCierre()}
                aria-label="Cerrar sesión"
                className="h-11 w-11 sm:h-9 sm:w-9 inline-flex items-center justify-center rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                title="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      <SyncQueuePanel open={isSyncPanelOpen} onClose={() => setIsSyncPanelOpen(false)} />

      <DialogoLogoutPendientes
        abierto={logoutSeguro.dialogoAbierto}
        pendientes={logoutSeguro.pendientes}
        sincronizando={logoutSeguro.sincronizando}
        mensaje={logoutSeguro.mensaje}
        onCancelar={logoutSeguro.cancelar}
        onConfirmar={logoutSeguro.confirmar}
        onSincronizar={() => void logoutSeguro.sincronizarAhora()}
      />
    </>
  );
}
