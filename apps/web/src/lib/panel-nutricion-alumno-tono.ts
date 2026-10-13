/**
 * Tono visual de las etiquetas del panel de nutrición del alumno (Ola 2).
 *
 * Recorte verbatim de `components/entrenador/PanelNutricionAlumno.tsx`: el mapa
 * tono → clases con tokens semánticos (variante claro/oscuro, §6.10) y la caída
 * a `neutral` ante un tono desconocido. Lógica pura (R1): sin DOM ni datos.
 */
const CLASES_TONO: Record<string, string> = {
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-destructive/15 text-destructive border-destructive/30',
  info: 'bg-info/15 text-info border-info/30',
  neutral: 'bg-secondary text-muted-foreground border-border',
};

/** Clases del tono pedido, o las de `neutral` si el tono no existe. */
export function tonoDe(tono: string): string {
  return CLASES_TONO[tono] ?? CLASES_TONO.neutral;
}
