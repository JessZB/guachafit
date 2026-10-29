/**
 * Botones de estado de sincronización de la cabecera (UX-04).
 *
 * Presentacionales: reciben el estado y los callbacks desde `Header`.
 * §6: área táctil de 44px (`min-h-11 min-w-11`), iconos `h-4` con `aria-hidden` y texto ≥ 11px.
 */
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { pluralizar } from '../../lib/pluralizar';

interface BotonSincronizacionProps {
  enLinea: boolean;
  pendientes: number;
  sincronizando: boolean;
  onSincronizar: () => void;
}

/** U3b: botón real (teclado + aria-label). Muestra el contador de pendientes en todos los tamaños. */
export function BotonSincronizacion({
  enLinea,
  pendientes,
  sincronizando,
  onSincronizar,
}: BotonSincronizacionProps) {
  // Sin conexión el botón no envía nada (`handleManualSync` exige conexión), por eso el nombre accesible lo dice primero.
  const etiquetaAccesible = !enLinea
    ? 'Sin conexión. La sincronización se reanudará al recuperar señal'
    : pendientes > 0
    ? `Sincronizar ${pluralizar(pendientes, 'cambio pendiente', 'cambios pendientes')}`
    : 'Sincronizar cambios pendientes';

  const claseColor = enLinea
    ? pendientes > 0
      ? 'bg-warning/15 text-warning border border-warning/30'
      : 'bg-success/10 text-success border border-success/20'
    : 'bg-destructive/15 text-destructive border border-destructive/30';

  return (
    <button
      type="button"
      onClick={() => onSincronizar()}
      aria-label={etiquetaAccesible}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-3 rounded-full text-xs font-semibold cursor-pointer transition-all focus-visible:outline-2 focus-visible:outline-primary ${claseColor}`}
      title={
        !enLinea
          ? pendientes > 0
            ? `Sin conexión: ${pluralizar(pendientes, 'cambio pendiente', 'cambios pendientes')} se enviarán al recuperar señal.`
            : 'Modo sin conexión'
          : pendientes > 0
          ? `${pluralizar(pendientes, 'cambio pendiente', 'cambios pendientes')} de enviar. Toca para ${
              pendientes === 1 ? 'enviarlo' : 'enviarlos'
            } ahora.`
          : 'Conexión activa'
      }
    >
      {enLinea ? (
        pendientes > 0 ? (
          <RefreshCw className={`h-4 w-4 ${sincronizando ? 'animate-spin' : ''}`} aria-hidden="true" />
        ) : (
          <Wifi className="h-4 w-4" aria-hidden="true" />
        )
      ) : (
        <WifiOff className="h-4 w-4" aria-hidden="true" />
      )}

      {pendientes > 0 ? (
        <>
          <span>{pendientes}</span>
          <span className="hidden sm:inline">{pendientes === 1 ? 'pendiente' : 'pendientes'}</span>
        </>
      ) : (
        <span className="hidden sm:inline">{enLinea ? 'Online' : 'Offline'}</span>
      )}
    </button>
  );
}

interface BotonIncidenciasSyncProps {
  fallidos: number;
  rechazados: number;
  onAbrir: () => void;
}

/** WU4: cambios rechazados o fallidos visibles y accionables. No renderiza nada sin incidencias. */
export function BotonIncidenciasSync({ fallidos, rechazados, onAbrir }: BotonIncidenciasSyncProps) {
  if (fallidos === 0 && rechazados === 0) return null;

  const total = fallidos + rechazados;
  const mensaje =
    rechazados > 0
      ? `${pluralizar(rechazados, 'cambio rechazado', 'cambios rechazados')}${
          fallidos > 0 ? ` y ${pluralizar(fallidos, 'fallido', 'fallidos')}` : ''
        }. Toca para revisar.`
      : `${pluralizar(fallidos, 'cambio fallido', 'cambios fallidos')}. Toca para revisar.`;

  const claseColor =
    rechazados > 0
      ? 'bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/25'
      : 'bg-warning/15 text-warning border-warning/30 hover:bg-warning/25';

  return (
    <button
      type="button"
      onClick={() => onAbrir()}
      title={mensaje}
      aria-label={mensaje}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-3 rounded-full text-xs font-bold cursor-pointer border transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-primary ${claseColor}`}
    >
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      <span>{total}</span>
      <span className="hidden sm:inline">
        {rechazados > 0 ? 'rechazado' : 'fallido'}
        {total > 1 ? 's' : ''}
      </span>
    </button>
  );
}
