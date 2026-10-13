/**
 * RF-018 · Ajustes del entrenador: tablist de secciones (patrón APG N2b).
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx:411-478`.
 * Presentacional: recibe los prop-getters de `useTabsAccesibles` desde el contenedor
 * y no llama a datos. Conserva iconos, etiquetas y el badge `Planes (N)`.
 * REUTILIZABLE (R3.1+R3.2): copia 2 en `components/ajustes/PantallaAjustes.tsx:99-117`;
 * la unificación de las 3 vistas queda para la fase D (fila 23 de la consolidación).
 */
import { BellRing, CreditCard, DollarSign, KeyRound, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { etiquetaPestanaAjustes, type PestanaAjustes } from '../../../lib/ajustes';
import type {
  PropsTab,
  PropsTablist,
} from '../../../lib/use-tabs-accesibles';

const ICONOS: Record<PestanaAjustes, LucideIcon> = {
  perfil: UserRound,
  seguridad: KeyRound,
  notificaciones: BellRing,
  'zona-horaria': BellRing,
  planes: CreditCard,
  tasas: DollarSign,
};

export interface PestanasAjustesProps {
  claves: readonly PestanaAjustes[];
  activa: PestanaAjustes;
  /** Nº de planes para el badge `Planes (N)`. */
  conteoPlanes: number;
  propsTablist: PropsTablist;
  propsTab: (clave: PestanaAjustes) => PropsTab;
}

export function PestanasAjustes({
  claves,
  activa,
  conteoPlanes,
  propsTablist,
  propsTab,
}: PestanasAjustesProps) {
  return (
    <div
      {...propsTablist}
      aria-label="Secciones de ajustes"
      className="flex items-center gap-2 border-b border-border/80 pb-3 overflow-x-auto"
    >
      {claves.map((clave) => {
        const Icono = ICONOS[clave];
        return (
          <button
            key={clave}
            {...propsTab(clave)}
            className={`min-h-11 sm:min-h-0 py-2 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activa === clave
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icono className="h-4 w-4" />
            <span>
              {etiquetaPestanaAjustes(clave)}
              {clave === 'planes' ? ` (${conteoPlanes})` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
