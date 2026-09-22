/**
 * RF-014/RF-015 (Ola 3 · N2b): lenguaje visual de las categorías de notificación.
 *
 * Un único mapa de icono + tono compartido por la campana y la pantalla de preferencias: el aviso
 * que el usuario ve y la fila que lo configura se pintan igual. Solo tokens semánticos (§6.10).
 */
import {
  BarChart3,
  Bell,
  CreditCard,
  Dumbbell,
  Scale,
  ShieldCheck,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import type { CategoriaVisualNotificacion } from '../../lib/notificaciones-in-app';

export const ICONO_CATEGORIA: Record<CategoriaVisualNotificacion, LucideIcon> = {
  finanzas: CreditCard,
  entrenamiento: Dumbbell,
  antropometria: Scale,
  resumen: BarChart3,
  seguridad: ShieldCheck,
  alumnos: UserPlus,
  general: Bell,
};

/** Clases del contenedor del icono (fondo tenue + color del token, válidas en ambos temas). */
export const TONO_CATEGORIA: Record<CategoriaVisualNotificacion, string> = {
  finanzas: 'bg-warning/15 text-warning',
  entrenamiento: 'bg-primary/15 text-primary',
  antropometria: 'bg-info/15 text-info',
  resumen: 'bg-secondary text-muted-foreground',
  seguridad: 'bg-destructive/15 text-destructive',
  alumnos: 'bg-success/15 text-success',
  general: 'bg-secondary text-muted-foreground',
};
