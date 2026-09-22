import React from 'react';
import { Link } from 'react-router-dom';
import { Ban, CreditCard, History, PauseCircle, RefreshCw } from 'lucide-react';
import { EstadoAlumno } from '@guachafit/shared';
import type { BloqueoAlumno, EstadoBloqueoAlumno } from '../../lib/acceso-alumno';

interface BloqueoAlumnoPanelProps {
  bloqueo: BloqueoAlumno;
  /** Reintento honesto: si el coach ya reactivó la cuenta, el alumno puede volver a consultar. */
  onReintentar?: () => void;
  className?: string;
}

interface EstiloBloqueo {
  Icono: typeof Ban;
  IconoAccion: typeof CreditCard | null;
  tile: string;
  borde: string;
}

/**
 * Estilos por estado sobre la paleta "Athletic Slate": ámbar para cobranza (RF-012), primario
 * para la pausa operativa y neutro para la baja lógica. Nunca negro puro ni sombras pesadas.
 */
const ESTILO_POR_ESTADO: Record<EstadoBloqueoAlumno, EstiloBloqueo> = {
  [EstadoAlumno.SUSPENDIDO_PAGO]: {
    Icono: CreditCard,
    IconoAccion: CreditCard,
    tile: 'bg-warning/15 text-warning border-warning/25',
    borde: 'border-warning/30',
  },
  [EstadoAlumno.INACTIVO_PAUSADO]: {
    Icono: PauseCircle,
    IconoAccion: History,
    tile: 'bg-primary/15 text-primary border-primary/25',
    borde: 'border-border/80',
  },
  [EstadoAlumno.ACTIVO]: {
    Icono: Ban,
    IconoAccion: null,
    tile: 'bg-secondary text-muted-foreground border-border',
    borde: 'border-border/80',
  },
  archivado: {
    Icono: Ban,
    IconoAccion: null,
    tile: 'bg-secondary text-muted-foreground border-border',
    borde: 'border-border/80',
  },
  desconocido: {
    Icono: Ban,
    IconoAccion: null,
    tile: 'bg-secondary text-muted-foreground border-border',
    borde: 'border-border/80',
  },
};

/**
 * Pantalla/estado informativo de bloqueo del alumno (RF-012 §4.A).
 *
 * Presenta el motivo del bloqueo con el texto del requerimiento, la acción directa que sí está
 * permitida (reportar el pago en suspensión; ver el historial en pausa) y un reintento opcional.
 * Es un panel de contenido: la navegación y el resto de la app siguen operativos.
 */
export function BloqueoAlumnoPanel({
  bloqueo,
  onReintentar,
  className = '',
}: BloqueoAlumnoPanelProps) {
  const { Icono, IconoAccion, tile, borde } = ESTILO_POR_ESTADO[bloqueo.estado];
  const tieneAccion = Boolean(bloqueo.rutaAccion && bloqueo.textoAccion);

  return (
    <div className={`max-w-xl mx-auto ${className}`}>
      <div
        role="status"
        className={`p-6 sm:p-8 rounded-3xl bg-card border ${borde} shadow-lg text-center space-y-5 animate-in fade-in duration-200`}
      >
        <div
          className={`mx-auto h-14 w-14 rounded-2xl border flex items-center justify-center ${tile}`}
        >
          <Icono className="h-7 w-7" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
            {bloqueo.titulo}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{bloqueo.mensaje}</p>
        </div>

        {(tieneAccion || onReintentar) && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {tieneAccion && (
              <Link
                to={bloqueo.rutaAccion!}
                className="w-full sm:w-auto min-h-11 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all"
              >
                {IconoAccion && <IconoAccion className="h-4 w-4" />}
                {bloqueo.textoAccion}
              </Link>
            )}
            {onReintentar && (
              <button
                type="button"
                onClick={onReintentar}
                className="w-full sm:w-auto min-h-11 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-sm border border-border transition-all active:scale-[0.98] cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                Reintentar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
