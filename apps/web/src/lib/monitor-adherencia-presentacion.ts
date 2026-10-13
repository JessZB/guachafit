/**
 * Módulo `monitor-adherencia` · presentación pura del monitor semanal (extraído de
 * `pages/entrenador/MonitorAdherenciaPage.tsx:62-110`, verbatim, R1 capa lógica pura).
 *
 * Sin dominio de red ni React: iniciales del avatar, porcentaje clamp para la barra y el
 * mapa tono → clases. Los tipos de dominio (`TonoSemaforo`) vienen de `lib/adherencia`
 * (contratos de `@guachafit/shared`, R4).
 */
import type { TonoSemaforo } from './adherencia';

export const CLASES_TONO: Record<
  TonoSemaforo,
  { chip: string; punto: string; barra: string; texto: string }
> = {
  success: {
    chip: 'bg-success/15 text-success border-success/30',
    punto: 'bg-success',
    barra: 'bg-success',
    texto: 'text-success',
  },
  warning: {
    chip: 'bg-warning/15 text-warning border-warning/30',
    punto: 'bg-warning',
    barra: 'bg-warning',
    texto: 'text-warning',
  },
  danger: {
    chip: 'bg-danger/15 text-danger border-danger/30',
    punto: 'bg-danger',
    barra: 'bg-danger',
    texto: 'text-danger',
  },
  info: {
    chip: 'bg-primary/15 text-primary border-primary/30',
    punto: 'bg-primary',
    barra: 'bg-primary',
    texto: 'text-primary',
  },
  neutral: {
    chip: 'bg-secondary text-muted-foreground border-border',
    punto: 'bg-muted-foreground',
    barra: 'bg-muted-foreground',
    texto: 'text-muted-foreground',
  },
};

export function iniciales(nombreCompleto: string): string {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

/** Porcentaje numérico seguro para la barra de progreso (nunca NaN ni > 100). */
export function porcentajeSeguro(valor: string): number {
  const numerico = Number(valor);
  if (!Number.isFinite(numerico)) return 0;
  return Math.max(0, Math.min(100, numerico));
}
