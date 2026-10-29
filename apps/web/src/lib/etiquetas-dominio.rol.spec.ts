/**
 * 01 · UX-04 · Spec de `etiquetaRol` en `lib/etiquetas-dominio.ts` (Contrato A).
 *
 * Mapeo de roles de usuario a etiquetas legibles para la UI (SEG-30, Menú "Cuenta"):
 * - 'entrenador' -> 'Entrenador'
 * - 'alumno' -> 'Alumno'
 * - 'superadmin' -> 'Administrador'
 * - valores nulos, vacíos o desconocidos -> '' (cadena vacía)
 */
import { describe, expect, it } from 'vitest';
import { etiquetaRol } from './etiquetas-dominio';

describe('etiquetaRol · Contrato A', () => {
  it.each([
    ['entrenador', 'Entrenador'],
    ['alumno', 'Alumno'],
    ['superadmin', 'Administrador'],
    [null, ''],
    [undefined, ''],
    ['', ''],
    ['otro', ''],
    ['desconocido', ''],
  ] as const)('etiquetaRol(%s) -> %s', (rol, esperado) => {
    expect(etiquetaRol(rol)).toBe(esperado);
  });
});
