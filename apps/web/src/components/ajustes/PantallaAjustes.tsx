import { useEffect, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { useTabsAccesibles } from '../../lib/use-tabs-accesibles';
import { useMiPerfil } from '../../lib/use-mi-perfil';
import {
  etiquetaPestanaAjustes,
  pestanaAjustesDesdeUrl,
  pestanasAjustes,
  type PestanaAjustes,
} from '../../lib/ajustes';
import { triggerHaptic } from '../../lib/haptics';
import { ContenidoConPerfil } from './ContenidoConPerfil';
import { SeccionCorreoPassword } from './SeccionCorreoPassword';
import { SeccionPerfil } from './SeccionPerfil';

/**
 * RF-018 RN-09: pantalla "Ajustes" de un rol. Pinta las pestañas del rol (la activa vive en
 * `?tab=`), las secciones comunes (Perfil y Correo y contraseña) y delega el resto en
 * `renderPestana` (notificaciones, zona horaria, planes, tasas).
 */
export function PantallaAjustes({
  descripcion,
  renderPestana,
}: {
  descripcion: string;
  renderPestana?: (pestana: PestanaAjustes) => ReactNode;
}) {
  const { user, isDemoMode } = useAuth();
  const pestanas = pestanasAjustes(user?.rol);
  const [searchParams, setSearchParams] = useSearchParams();
  const activa = pestanaAjustesDesdeUrl(user?.rol, searchParams.get('tab'));
  const { perfil, setPerfil, cargando, error, recargar } = useMiPerfil(user, isDemoMode);

  const activar = (pestana: PestanaAjustes) => {
    triggerHaptic('light');
    setSearchParams(pestana === pestanas[0] ? {} : { tab: pestana }, { replace: true });
  };

  const tabs = useTabsAccesibles<PestanaAjustes>({
    claves: pestanas,
    activa,
    onActivar: activar,
    idBase: 'ajustes-tabs',
  });

  // Al entrar por enlace directo (`?tab=…`) la pestaña activa se trae a la vista en móvil.
  const idTabActiva = tabs.idTab(activa);
  useEffect(() => {
    document.getElementById(idTabActiva)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [idTabActiva]);

  const necesitaPerfil = activa === 'perfil' || activa === 'seguridad';

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-24 lg:pb-12 animate-in fade-in duration-200">
      <div className="flex items-start gap-3">
        <span className="p-2.5 rounded-2xl bg-primary/15 text-primary shrink-0">
          <Settings className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground">Ajustes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{descripcion}</p>
        </div>
      </div>

      {pestanas.length > 1 && (
        <div
          {...tabs.propsTablist}
          aria-label="Secciones de ajustes"
          className="flex items-center gap-2 border-b border-border/80 pb-3 overflow-x-auto"
        >
          {pestanas.map((pestana) => (
            <button
              key={pestana}
              {...tabs.propsTab(pestana)}
              className={`min-h-11 py-2 px-4 rounded-xl font-bold text-sm whitespace-nowrap transition-all cursor-pointer ${
                activa === pestana
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {etiquetaPestanaAjustes(pestana)}
            </button>
          ))}
        </div>
      )}

      {/* Con una sola pestaña (superadmin) no hay tablist: el panel no se etiqueta con un tab. */}
      <div {...(pestanas.length > 1 ? tabs.propsPanel(activa) : {})} className="space-y-6">
        {necesitaPerfil && (
          <ContenidoConPerfil
            perfil={perfil}
            cargando={cargando}
            error={error}
            isDemoMode={isDemoMode}
            onReintentar={() => void recargar()}
          >
            {(datos) =>
              activa === 'perfil' ? (
                <SeccionPerfil perfil={datos} isDemoMode={isDemoMode} onActualizado={setPerfil} />
              ) : (
                <SeccionCorreoPassword
                  perfil={datos}
                  isDemoMode={isDemoMode}
                  onRecargarPerfil={() => void recargar()}
                />
              )
            }
          </ContenidoConPerfil>
        )}
        {!necesitaPerfil && renderPestana?.(activa)}
      </div>
    </div>
  );
}
