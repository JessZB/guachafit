import { Rol } from '@guachafit/shared';

/**
 * RF-010 RN-01: aterrizaje único por rol.
 *
 * El superadmin solo puede entrar al panel de administración; el entrenador y el alumno a su
 * menú. Centralizarlo evita bucles de redirección cuando un guard rechaza un rol (el rechazado
 * vuelve a su propia ruta, nunca a una que también rechaza).
 */
const RUTAS_INICIO: Record<Rol, string> = {
  [Rol.SUPERADMIN]: '/admin',
  [Rol.ENTRENADOR]: '/coach/menu',
  [Rol.ALUMNO]: '/app/menu',
};

export function rutaInicioPorRol(rol: Rol): string {
  return RUTAS_INICIO[rol] ?? '/login';
}
