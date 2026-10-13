/**
 * Módulo `alumnos` (fase B, prompt 53) · avatar de iniciales del directorio.
 *
 * Extraído de `pages/entrenador/AlumnosPage.tsx:853-858` (tarjeta) y `:972-975` (tabla).
 * Clasificación: REUTILIZABLE (R3-1: mismas iniciales en avatar en
 * `MonitorAdherenciaPage.tsx:762-764`; guía 48 fila 14 → `common/` en D).
 *
 * §6: sin texto bajo 12px (iniciales `text-sm`/`text-xs`), sin pesos > 700.
 * Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

export interface AvatarInicialesProps {
  nombres: string;
  apellidos: string;
  /** `tarjeta` (h-10) o `tabla` (h-8 con gradiente): clases verbatim de la vista vigente. */
  variante?: 'tarjeta' | 'tabla';
}

const CLASES_VARIANTE: Record<NonNullable<AvatarInicialesProps['variante']>, string> = {
  tarjeta:
    'h-10 w-10 rounded-xl bg-secondary/80 border border-border/70 text-sm group-hover:border-primary/40 group-hover:bg-primary/10',
  tabla:
    'h-8 w-8 rounded-lg bg-gradient-to-tr from-primary/30 to-primary/10 border border-primary/20 text-xs',
};

export function AvatarIniciales({ nombres, apellidos, variante = 'tarjeta' }: AvatarInicialesProps) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center text-primary font-bold shrink-0 transition-colors ${CLASES_VARIANTE[variante]}`}
    >
      {nombres[0]}
      {apellidos[0]}
    </div>
  );
}
