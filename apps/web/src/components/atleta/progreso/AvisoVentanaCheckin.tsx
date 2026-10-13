/**
 * Aviso visible del estado de la ventana de check-in (SL2, fase B).
 *
 * De `ProgresoPage.tsx:517-536` (variante `global`, RN-04/§6) y `:713-724`
 * (variante `formulario`). Markup de cada variante idéntico al original (R5).
 * Presentacional: props tipadas, sin datos (R1). §6: 11–12px, estados honestos.
 */
import { CalendarClock, CalendarX } from 'lucide-react';
import type { EstadoVentanaCheckinCalculado } from '../../../lib/antropometria-ventana';

interface AvisoVentanaCheckinProps {
  estadoVentana: EstadoVentanaCheckinCalculado;
  variante: 'global' | 'formulario';
}

export function AvisoVentanaCheckin({ estadoVentana, variante }: AvisoVentanaCheckinProps) {
  if (variante === 'formulario') {
    return (
      <div
        role="status"
        className="p-3.5 rounded-2xl bg-warning/10 border border-warning/30 text-warning text-xs font-bold flex items-start gap-2"
      >
        <CalendarX className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          {estadoVentana.mensaje ||
            'Tu check-in está fuera de la ventana activa. Contacta a tu entrenador.'}
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className={`p-4 rounded-3xl border text-xs font-semibold flex items-start gap-2.5 ${
        estadoVentana.estado === 'abierta'
          ? 'bg-success/10 border-success/30 text-success'
          : estadoVentana.estado === 'cerrada'
            ? 'bg-warning/10 border-warning/30 text-warning'
            : 'bg-info/10 border-info/30 text-info'
      }`}
    >
      {estadoVentana.estado === 'abierta' ? (
        <CalendarClock className="h-4 w-4 shrink-0 mt-0.5" />
      ) : (
        <CalendarX className="h-4 w-4 shrink-0 mt-0.5" />
      )}
      <span>{estadoVentana.mensaje}</span>
    </div>
  );
}
