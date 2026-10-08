import type { ReactNode } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { MiPerfilDTO } from '@guachafit/shared';
import { resolverUrlApi } from '../../lib/api-client';
import { AvisoDatosOffline } from '../common/AvisoDatosOffline';

/**
 * RF-018: estados de carga del perfil propio, compartidos por las pantallas de Ajustes de todos
 * los roles. Cargando, error con "Reintentar" o el contenido; sin conexión avisa que lo que se ve
 * es la copia guardada (puede no ser la última).
 */
export function ContenidoConPerfil({
  perfil,
  cargando,
  error,
  isDemoMode,
  onReintentar,
  children,
}: {
  perfil: MiPerfilDTO | null;
  cargando: boolean;
  error: string | null;
  isDemoMode: boolean;
  onReintentar: () => void;
  children: (perfil: MiPerfilDTO) => ReactNode;
}) {
  if (cargando && !perfil) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando tu perfil…
      </p>
    );
  }
  if (error || !perfil) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-destructive/10 border border-destructive/25">
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error ?? 'No pudimos cargar tu perfil.'}
        </p>
        <button
          type="button"
          onClick={onReintentar}
          className="min-h-11 px-4 rounded-xl bg-secondary text-foreground text-sm font-bold hover:bg-secondary/80 flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </button>
      </div>
    );
  }
  return (
    <>
      {!isDemoMode && <AvisoDatosOffline url={resolverUrlApi('/usuarios/me/perfil')} />}
      {children(perfil)}
    </>
  );
}
