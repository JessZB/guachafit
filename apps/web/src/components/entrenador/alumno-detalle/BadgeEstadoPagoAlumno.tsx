/**
 * Badge semáforo de pago del alumno (cabecera de la ficha).
 *
 * Se apoya en `ui/BadgeEstado` (tono y textos de `etiquetaSemaforoPago`, sin cambios). El punto
 * de color es decorativo (`aria-hidden`); el del moroso pulsa y se detiene con
 * `prefers-reduced-motion`. Candidato a `common/` (fase D, matriz 48 fila 13).
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import { BadgeEstado } from '../../ui/BadgeEstado';
import { etiquetaSemaforoPago, type SemaforoPago } from '../../../lib/etiquetas-dominio';
import type { TonoSemaforo } from '../../../lib/adherencia';

interface BadgeEstadoPagoAlumnoProps {
  semaforo: SemaforoPago | null;
}

const CLASES_PUNTO: Record<TonoSemaforo, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger animate-pulse motion-reduce:animate-none',
  info: 'bg-primary',
  neutral: 'bg-muted-foreground',
};

export function BadgeEstadoPagoAlumno({ semaforo }: BadgeEstadoPagoAlumnoProps) {
  const estadoPago = etiquetaSemaforoPago(semaforo);
  return (
    <BadgeEstado tono={estadoPago.tono}>
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${CLASES_PUNTO[estadoPago.tono] ?? CLASES_PUNTO.neutral}`}
      />
      {estadoPago.texto}
    </BadgeEstado>
  );
}
