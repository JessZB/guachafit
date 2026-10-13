/**
 * Pestaña de reporte de pago de la vista `pagos` (fase B, prompt 54).
 *
 * Extraída desde `pages/atleta/PagosPage.tsx` (L750–783 + L954–957): barra
 * "Volver", tarjeta con título, banner de error y vista de éxito. El formulario
 * llega por `children` (el `<form>` vive en `FormularioReportePago`, incluido
 * el slot del comprobante): así el `onSubmit` y la validación nativa conservan
 * un único `<form>` sin partir su semántica.
 *
 * R1: componente único de vista (paso guiado y flujo propios). Presentacional:
 * props tipadas y callbacks; sin `useQuery` ni `api-client`.
 *
 * R5: conserva los textos que consultan los specs ("Volver a opciones de pago",
 * "Reportar Abono o Cuota", "Pago reportado con éxito…").
 *
 * §6: estados honestos (error visible, éxito con redirección declarada),
 * `font-bold` (700), tokens con variante claro/oscuro.
 */
import type { ReactNode } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

export interface PestanaReportePagoProps {
  onVolver: () => void;
  formError: string | null;
  formSuccess: string | null;
  children: ReactNode;
}

export function PestanaReportePago({
  onVolver,
  formError,
  formSuccess,
  children,
}: PestanaReportePagoProps) {
  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
        <button
          onClick={onVolver}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Volver a opciones de pago</span>
        </button>
        <span className="text-xs font-semibold text-muted-foreground">Paso guiado</span>
      </div>

      <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-md space-y-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Reportar Abono o Cuota</h2>
          <p className="text-xs text-muted-foreground">
            Introduce los datos de la transferencia o pago móvil para que tu entrenador lo verifique.
          </p>
        </div>

        {formError && (
          <div className="p-3 rounded-2xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold">
            {formError}
          </div>
        )}

        {formSuccess ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
            <p className="text-sm font-bold text-foreground">{formSuccess}</p>
            <p className="text-xs text-muted-foreground">Redirigiendo a tu historial...</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
