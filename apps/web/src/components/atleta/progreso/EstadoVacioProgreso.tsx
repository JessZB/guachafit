/**
 * Vacío honesto "sin fotos de progreso" (SL2, fase B).
 *
 * De `ProgresoPage.tsx:1036-1048` (RF-004 RN-02/RN-03): consume el átomo
 * `ui/EstadoVacio` (guía 48 §6 M5). Textos conservados idénticos (R5).
 * Presentacional, sin datos (R1). §6: vacío explícito, 11px mínimo.
 */
import { Images } from 'lucide-react';
import { EstadoVacio } from '../../ui/EstadoVacio';

export function EstadoVacioProgreso() {
  return (
    <EstadoVacio
      icono={Images}
      titulo="Aún no tienes fotos de progreso"
      detalle="Las fotos se adjuntan al registrar tu check-in (frontal, lateral o posterior) y quedan privadas con enlaces temporales."
    />
  );
}
