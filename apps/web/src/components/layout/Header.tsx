import React, { useState, useEffect } from 'react';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../context/auth-context';
import { processOutboxQueue, subscribeToSyncStatus, type SyncStatusState } from '../../lib/offline-sync';
import { SyncQueuePanel } from '../common/SyncQueuePanel';
import { InstalarAppPrompt } from '../common/InstalarAppPrompt';
import { DialogoLogoutPendientes } from '../common/DialogoLogoutPendientes';
import { CampanaNotificaciones } from '../notificaciones/CampanaNotificaciones';
import { useLogoutSeguro } from '../../lib/use-logout-seguro';
import { rutaAjustes } from '../../lib/ajustes';
import { MenuCuenta } from './MenuCuenta';
import { BotonIncidenciasSync, BotonSincronizacion } from './BotonesSincronizacion';
import { Dumbbell } from 'lucide-react';

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
  // UX-04: la invitación a instalar (U1) avisa aquí su disponibilidad para ocultar la marca en móvil.
  const [instalable, setInstalable] = useState(false);

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

  return (
    <>
      <header className="[view-transition-name:cabecera] sticky top-0 z-40 w-full border-b border-border/80 bg-background/95 backdrop-blur-md px-3 sm:px-8 pb-3 safe-area-pt flex items-center justify-between">
        {/* Brand: UX-04 oculta el texto en móvil cuando hay instalación o incidencias; el logo se mantiene */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-md shadow-primary/25 shrink-0">
            <Dumbbell className="h-5 w-5" />
          </div>
          <div
            className={`${
              instalable || issueCount > 0 ? 'hidden sm:flex' : 'flex'
            } flex-col min-w-0`}
          >
            <span className="font-bold text-lg tracking-tight text-foreground leading-none truncate">
              GUACHAFIT
            </span>
            <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mt-0.5 truncate">
              {user?.rol === 'entrenador'
                ? 'Panel del entrenador'
                : user?.rol === 'superadmin'
                ? 'Administración de la plataforma'
                : 'App del alumno'}
            </span>
          </div>
        </div>

        {/* Connectivity, instalación y cuenta. UX-04: peor caso a 360px (logo, instalar, campana, sync y fallidos de 2 dígitos, cuenta); en móvil se reduce el gap a gap-1.5 y el padding del header a px-3 */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* N2b (RF-014 RN-04): campana In-App con badge de no leídas */}
          <CampanaNotificaciones />

          {/* U3b: botón real de sincronización (teclado + aria-label) */}
          <BotonSincronizacion
            enLinea={isOnline}
            pendientes={pending}
            sincronizando={isSyncing}
            onSincronizar={() => void handleManualSync()}
          />

          {/* WU4: cambios rechazados/fallidos visibles y accionables */}
          <BotonIncidenciasSync
            fallidos={failed}
            rechazados={rejected}
            onAbrir={() => setIsSyncPanelOpen(true)}
          />

          {/* U1 (Ola 4): instalación PWA (A2HS) — invisible si ya está instalada o fue descartada */}
          <InstalarAppPrompt onDisponibilidad={setInstalable} />

          {/* UX-04: tema, Ajustes y cierre de sesión viven en el menú "Cuenta" en todos los tamaños */}
          {user && (
            <MenuCuenta
              email={user.email}
              rol={user.rol}
              tema={theme}
              onCambiarTema={setTheme}
              rutaAjustes={rutaAjustes(user.rol)}
              onCerrarSesion={() => void logoutSeguro.solicitarCierre()}
            />
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
