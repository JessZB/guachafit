import { describe, expect, it } from 'vitest';
import { Rol } from '@guachafit/shared';
import { rutaInicioPorRol } from './rutas-rol';

/**
 * RF-010 RN-01: cada rol aterriza en su propio espacio. El superadmin NO puede caer en las rutas
 * de coach/alumno (los guards las rechazan y provocarían un bucle de redirección).
 */
describe('rutaInicioPorRol (RF-010 RN-01)', () => {
  it('el superadmin aterriza en el panel de administración', () => {
    expect(rutaInicioPorRol(Rol.SUPERADMIN)).toBe('/admin');
  });

  it('el entrenador aterriza en su menú', () => {
    expect(rutaInicioPorRol(Rol.ENTRENADOR)).toBe('/coach/menu');
  });

  it('el alumno aterriza en su menú', () => {
    expect(rutaInicioPorRol(Rol.ALUMNO)).toBe('/app/menu');
  });

  it('las tres rutas de inicio son distintas entre sí', () => {
    const rutas = [Rol.SUPERADMIN, Rol.ENTRENADOR, Rol.ALUMNO].map(rutaInicioPorRol);
    expect(new Set(rutas).size).toBe(3);
  });
});
