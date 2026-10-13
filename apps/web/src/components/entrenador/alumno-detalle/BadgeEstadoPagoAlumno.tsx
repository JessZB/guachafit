/**
 * Badge semáforo de pago del alumno (cabecera de la ficha).
 *
 * CANDIDATO a `common/` sobre `ui/BadgeEstado` (fase D, matriz 48 fila 13): copia verificable en
 * `pages/entrenador/AlumnosPage.tsx:886-894` (const en `:86`) y `:1010-1016` (R3.3). Se conserva
 * el markup exacto (punto + texto de `etiquetaSemaforoPago`) porque ningún spec lo fija pero la
 * sustitución por `BadgeEstado` no es mecánica (dominio `SemaforoPago` + caso `null` → "Sin dato").
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import { etiquetaSemaforoPago, type SemaforoPago } from '../../../lib/etiquetas-dominio';

interface BadgeEstadoPagoAlumnoProps {
  semaforo: SemaforoPago | null;
}

export function BadgeEstadoPagoAlumno({ semaforo }: BadgeEstadoPagoAlumnoProps) {
  const estadoPago = etiquetaSemaforoPago(semaforo);
  return (
    <span
      className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase border flex items-center gap-1.5 shadow-2xs ${
        semaforo === 'al_dia'
          ? 'bg-success/15 text-success border-success/30'
          : semaforo === 'por_vencer'
          ? 'bg-warning/15 text-warning border-warning/30'
          : semaforo === 'moroso'
          ? 'bg-danger/15 text-danger border-danger/30'
          : 'bg-secondary text-muted-foreground border-border'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          semaforo === 'al_dia'
            ? 'bg-success'
            : semaforo === 'por_vencer'
            ? 'bg-warning'
            : semaforo === 'moroso'
            ? 'bg-danger animate-pulse'
            : 'bg-muted-foreground'
        }`}
      />
      {estadoPago.texto}
    </span>
  );
}
