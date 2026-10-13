/**
 * Action feedback banners: success confirmation and honest failure alert.
 *
 * Presentational: both messages arrive as props; no data fetching here.
 */
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export interface AvisosAccionConciliacionProps {
  exito: string | null;
  error: string | null;
}

export function AvisosAccionConciliacion({ exito, error }: AvisosAccionConciliacionProps) {
  return (
    <>
      {exito && (
        <div className="p-4 rounded-2xl bg-success/15 border border-success/30 text-success text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{exito}</span>
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
