/**
 * Action feedback banners: success confirmation and honest failure alert.
 *
 * Presentational: both messages arrive as props; no data fetching here. The success notice
 * can be closed by the coach (`onCerrarExito`); the page decides how long it lives.
 */
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { BotonTactil } from '../../ui/BotonTactil';

export interface AvisosAccionConciliacionProps {
  exito: string | null;
  error: string | null;
  onCerrarExito: () => void;
}

export function AvisosAccionConciliacion({ exito, error, onCerrarExito }: AvisosAccionConciliacionProps) {
  return (
    <>
      {exito && (
        <div
          role="status"
          className="p-4 rounded-2xl bg-success/15 border border-success/30 text-success text-xs font-bold flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="flex-1">{exito}</span>
          <BotonTactil
            variante="secundaria"
            etiquetaAccesible="Cerrar aviso"
            onClick={onCerrarExito}
            className="shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </BotonTactil>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </>
  );
}
