/**
 * Encabezado de sección con "Volver a opciones de progreso" (SL2, fase B).
 *
 * De `ProgresoPage.tsx:679-688` (variante `formulario`) y `:1010-1029`
 * (variante `evolucion`, con botón "Nuevo check-in"). Textos y roles
 * idénticos (R5). Presentacional: props tipadas y callbacks, sin datos (R1).
 * §6: botones `min-h-11`, 11–12px.
 */
import { ArrowLeft, Plus } from 'lucide-react';

interface EncabezadoSeccionProgresoProps {
  variante: 'formulario' | 'evolucion';
  onVolver: () => void;
  /** Solo variante `evolucion`: abre el formulario si la ventana lo permite. */
  onNuevoCheckin?: () => void;
  /** Solo variante `evolucion`: pinta el botón "Nuevo check-in". */
  mostrarNuevo?: boolean;
  puedeRegistrar?: boolean;
  motivoBloqueo?: string | null;
}

export function EncabezadoSeccionProgreso({
  variante,
  onVolver,
  onNuevoCheckin,
  mostrarNuevo = false,
  puedeRegistrar = false,
  motivoBloqueo = null,
}: EncabezadoSeccionProgresoProps) {
  return (
    <div className="flex items-center justify-between border-b border-border/80 pb-3">
      <button
        onClick={onVolver}
        className="inline-flex items-center gap-1.5 min-h-11 text-xs font-bold text-primary hover:underline cursor-pointer"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Volver a opciones de progreso</span>
      </button>
      {variante === 'formulario' ? (
        <span className="text-xs font-semibold text-muted-foreground">Registro de check-in</span>
      ) : (
        mostrarNuevo && (
          <button
            onClick={onNuevoCheckin}
            disabled={!puedeRegistrar}
            title={motivoBloqueo ?? undefined}
            className="inline-flex items-center gap-1 min-h-11 px-3 py-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Nuevo check-in</span>
          </button>
        )
      )}
    </div>
  );
}
