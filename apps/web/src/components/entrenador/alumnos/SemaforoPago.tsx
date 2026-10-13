/**
 * Módulo `alumnos` (fase B, prompt 53) · semáforo de pago del directorio.
 *
 * Extraído de `pages/entrenador/AlumnosPage.tsx:86-100` (mapas tono→clases) y sus usos
 * en tarjeta (`:860-863, :890-894`) y tabla (`:1010-1015`).
 * Clasificación: REUTILIZABLE (R3-1: mapas tono→clases duplicados en `TablaCartera.tsx:64-70`,
 * `DetalleSesionEntrenamiento.tsx:55`, `AlumnoDetallePage.tsx:173`, `ProgresoPage.tsx:63`;
 * R3-3: semáforo de cuota en `CarteraPage` y `AtletaMenuPage`; guía 48 fila 13).
 *
 * - La unión del semáforo se importa del DTO (`PerfilAlumnoDetalleDTO['semaforoPago']`);
 *   nunca se redefine (WARNING del inventario 42 §5).
 * - El texto usa `ui/BadgeEstado` (consolidación 48 fila 4, guía M3); el punto
 *   posicional sobre el avatar conserva sus clases verbatim (decoración, no badge).
 * - §6: `BadgeEstado` impone 11px mínimo, peso 700 y tokens con variante dark.
 *   Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

import type { PerfilAlumnoDetalleDTO } from '@guachafit/shared';
import { etiquetaSemaforoPago } from '../../../lib/etiquetas-dominio';
import type { TonoSemaforo } from '../../../lib/adherencia';
import { BadgeEstado } from '../../ui/BadgeEstado';

type SemaforoPagoValor = PerfilAlumnoDetalleDTO['semaforoPago'];

/**
 * §6: clases del punto del semáforo por tono semántico. `sin_cuota` es neutro:
 * no es deuda y nunca se pinta en rojo (verbatim de la vista vigente).
 */
const CLASES_PUNTO_SEMAFORO_PAGO: Record<TonoSemaforo, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-muted-foreground',
};

export function SemaforoPagoTexto({ semaforo }: { semaforo: SemaforoPagoValor }) {
  const estadoPago = etiquetaSemaforoPago(semaforo);
  return <BadgeEstado tono={estadoPago.tono}>{estadoPago.texto}</BadgeEstado>;
}

/** Punto posicional sobre el avatar de la tarjeta (verbatim `:860-863`). */
export function PuntoSemaforoPago({ semaforo }: { semaforo: SemaforoPagoValor }) {
  const estadoPago = etiquetaSemaforoPago(semaforo);
  return (
    <span
      className={`absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-card ${CLASES_PUNTO_SEMAFORO_PAGO[estadoPago.tono]}`}
      title={`Estado de pago: ${estadoPago.texto}`}
    />
  );
}
