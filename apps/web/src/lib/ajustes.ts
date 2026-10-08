/**
 * RF-018 RN-09: pantalla "Ajustes" de cada rol (decisión del dueño, 2026-10-06).
 *
 * Una sola pantalla por rol agrupa los ajustes personales (perfil, correo y contraseña,
 * notificaciones y, el alumno, su zona horaria) y, el entrenador, los de su negocio (planes y
 * tasas). La pestaña activa vive en la URL (`?tab=…`) para que otros puntos de la app, como la
 * campana, enlacen directo a una pestaña.
 */
import { Rol } from '@guachafit/shared';

export type PestanaAjustes =
  | 'perfil'
  | 'seguridad'
  | 'notificaciones'
  | 'zona-horaria'
  | 'planes'
  | 'tasas';

const PESTANAS_POR_ROL: Record<string, readonly PestanaAjustes[]> = {
  [Rol.ALUMNO]: ['perfil', 'seguridad', 'notificaciones', 'zona-horaria'],
  [Rol.ENTRENADOR]: ['perfil', 'seguridad', 'notificaciones', 'planes', 'tasas'],
  [Rol.SUPERADMIN]: ['seguridad'],
};

const RUTA_BASE_POR_ROL: Record<string, string> = {
  [Rol.ALUMNO]: '/app/ajustes',
  [Rol.ENTRENADOR]: '/coach/ajustes',
  [Rol.SUPERADMIN]: '/admin/ajustes',
};

const ETIQUETAS: Record<PestanaAjustes, string> = {
  perfil: 'Perfil',
  seguridad: 'Correo y contraseña',
  notificaciones: 'Notificaciones',
  'zona-horaria': 'Zona horaria',
  planes: 'Planes',
  tasas: 'Tasas de cambio',
};

/** Pestañas de la pantalla "Ajustes" del rol, en orden visual. Rol desconocido: ninguna. */
export function pestanasAjustes(rol: Rol | string | null | undefined): PestanaAjustes[] {
  return rol ? [...(PESTANAS_POR_ROL[rol] ?? [])] : [];
}

export function etiquetaPestanaAjustes(pestana: PestanaAjustes): string {
  return ETIQUETAS[pestana];
}

/** Pestaña activa a partir de `?tab=`: si no existe para el rol, la primera del rol. */
export function pestanaAjustesDesdeUrl(
  rol: Rol | string | null | undefined,
  valor: string | null
): PestanaAjustes {
  const pestanas = pestanasAjustes(rol);
  const encontrada = pestanas.find((pestana) => pestana === valor);
  return encontrada ?? pestanas[0] ?? 'seguridad';
}

/** Ruta de "Ajustes" del rol; con una pestaña distinta de la primera añade `?tab=`. */
export function rutaAjustes(
  rol: Rol | string | null | undefined,
  pestana?: PestanaAjustes
): string | null {
  const base = rol ? RUTA_BASE_POR_ROL[rol] : undefined;
  if (!base) return null;
  const primera = pestanasAjustes(rol)[0];
  return pestana && pestana !== primera ? `${base}?tab=${pestana}` : base;
}
