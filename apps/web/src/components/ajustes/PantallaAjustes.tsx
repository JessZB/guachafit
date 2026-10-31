import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BellRing,
  Clock,
  CreditCard,
  DollarSign,
  KeyRound,
  Settings,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { useTabsAccesibles } from '../../lib/use-tabs-accesibles';
import { useMiPerfil } from '../../lib/use-mi-perfil';
import {
  etiquetaCortaPestanaAjustes,
  pestanaAjustesDesdeUrl,
  pestanasAjustes,
  type PestanaAjustes,
} from '../../lib/ajustes';
import { triggerHaptic } from '../../lib/haptics';
import { pluralizar } from '../../lib/pluralizar';
import { BarraTabsSegmentada, type ItemTab } from '../ui/BarraTabsSegmentada';
import { ContenidoConPerfil } from './ContenidoConPerfil';
import { SeccionCorreoPassword } from './SeccionCorreoPassword';
import { SeccionPerfil } from './SeccionPerfil';

const ICONOS: Record<PestanaAjustes, LucideIcon> = {
  perfil: UserRound,
  seguridad: KeyRound,
  notificaciones: BellRing,
  'zona-horaria': Clock,
  planes: CreditCard,
  tasas: DollarSign,
};

/** Unidad singular y plural de los conteos que muestra la barra (p. ej. "Planes: 2 planes"). */
const UNIDAD_CONTEO: Partial<Record<PestanaAjustes, readonly [string, string]>> = {
  planes: ['plan', 'planes'],
};

/** Ancho máximo: `amplio` para el entrenador, cuya rejilla de tasas necesita más columnas. */
const CLASE_ANCHO = { normal: 'max-w-3xl', amplio: 'max-w-5xl' } as const;

function itemsAjustes(
  pestanas: PestanaAjustes[],
  conteos?: Partial<Record<PestanaAjustes, number>>
): ItemTab<PestanaAjustes>[] {
  return pestanas.map((pestana) => {
    // WCAG 2.5.3: el nombre accesible contiene la etiqueta visible. Sin conteo no se pasa
    // aria-label, así que el nombre es la propia etiqueta corta.
    const etiqueta = etiquetaCortaPestanaAjustes(pestana);
    const base: ItemTab<PestanaAjustes> = {
      clave: pestana,
      etiqueta,
      icono: ICONOS[pestana],
    };
    const conteo = conteos?.[pestana];
    if (conteo === undefined) return base;
    const unidad = UNIDAD_CONTEO[pestana];
    const texto = unidad ? pluralizar(conteo, unidad[0], unidad[1]) : String(conteo);
    return {
      ...base,
      ariaLabel: `${etiqueta}: ${texto}`,
      indicador: { texto: String(conteo), ariaLabel: texto, variante: 'contador' },
    };
  });
}

/**
 * RF-018 RN-09: pantalla "Ajustes" de un rol. Pinta las pestañas del rol en una barra segmentada
 * (la activa vive en `?tab=`), las secciones comunes (Perfil y Correo y contraseña) y delega el
 * resto en `renderPestana` (notificaciones, zona horaria, planes, tasas).
 *
 * Perfil y Correo y contraseña quedan siempre montadas (la inactiva con `hidden`): un guardado en
 * vuelo no pierde su resultado ni lo escrito al cambiar de pestaña.
 */
export function PantallaAjustes({
  descripcion,
  renderPestana,
  conteos,
  ancho = 'normal',
}: {
  descripcion: string;
  renderPestana?: (pestana: PestanaAjustes) => ReactNode;
  /** Conteo visible junto a la pestaña (p. ej. planes del entrenador). */
  conteos?: Partial<Record<PestanaAjustes, number>>;
  /** Ancho máximo de la pantalla; por defecto `normal`. */
  ancho?: 'normal' | 'amplio';
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

  const contenidoPestana = (pestana: PestanaAjustes, visible: boolean) => {
    if (pestana !== 'perfil' && pestana !== 'seguridad') {
      return visible ? renderPestana?.(pestana) : null;
    }
    return (
      <ContenidoConPerfil
        perfil={perfil}
        cargando={cargando}
        error={error}
        isDemoMode={isDemoMode}
        onReintentar={() => void recargar()}
        mostrarAvisoOffline={visible}
      >
        {(datos) =>
          pestana === 'perfil' ? (
            <SeccionPerfil perfil={datos} isDemoMode={isDemoMode} onActualizado={setPerfil} />
          ) : (
            <SeccionCorreoPassword
              perfil={datos}
              isDemoMode={isDemoMode}
              onRecargarPerfil={() => void recargar()}
              visible={visible}
            />
          )
        }
      </ContenidoConPerfil>
    );
  };

  return (
    <div
      className={`space-y-6 mx-auto pb-24 lg:pb-12 animate-in fade-in duration-200 ${CLASE_ANCHO[ancho]}`}
    >
      <div className="flex items-start gap-3">
        <span className="p-2.5 rounded-2xl bg-primary/15 text-primary shrink-0">
          <Settings className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-foreground">Ajustes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{descripcion}</p>
        </div>
      </div>

      {pestanas.length > 1 && (
        <BarraTabsSegmentada
          items={itemsAjustes(pestanas, conteos)}
          activa={activa}
          propsTablist={tabs.propsTablist}
          propsTab={tabs.propsTab}
          ariaLabel="Secciones de ajustes"
        />
      )}

      {/* Con una sola pestaña (superadmin) no hay tablist: el panel no se etiqueta con un tab. */}
      {pestanas.length > 1 ? (
        pestanas.map((pestana) => (
          <div
            key={pestana}
            {...tabs.propsPanel(pestana)}
            hidden={pestana !== activa}
            className="space-y-6"
          >
            {contenidoPestana(pestana, pestana === activa)}
          </div>
        ))
      ) : (
        <div className="space-y-6">{contenidoPestana(activa, true)}</div>
      )}
    </div>
  );
}
