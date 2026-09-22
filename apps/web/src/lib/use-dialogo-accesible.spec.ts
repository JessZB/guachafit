/**
 * U3b: contrato de la trampa de foco y Escape del diálogo accesible.
 *
 * La suite de `apps/web` corre en Node sin jsdom, así que se testea la decisión pura
 * (`resolverTeclaDialogo`) que el hook ejecuta contra el DOM real.
 */
import { describe, expect, it } from 'vitest';
import { resolverTeclaDialogo } from './use-dialogo-accesible';

describe('resolverTeclaDialogo (U3b: trampa de foco y cierre con Escape)', () => {
  it('Escape pide el cierre del diálogo', () => {
    expect(resolverTeclaDialogo('Escape', false, 0, 3)).toEqual({ tipo: 'cerrar' });
  });

  it('Escape queda inerte cuando cerrarConEscape es false', () => {
    expect(resolverTeclaDialogo('Escape', false, 0, 3, false)).toEqual({ tipo: 'ignorar' });
  });

  it('ignora cualquier tecla ajena a la trampa', () => {
    expect(resolverTeclaDialogo('Enter', false, 1, 3)).toEqual({ tipo: 'ignorar' });
    expect(resolverTeclaDialogo('ArrowRight', false, 1, 3)).toEqual({ tipo: 'ignorar' });
  });

  it('sin focusables manda el foco al contenedor (nunca lo deja escapar)', () => {
    expect(resolverTeclaDialogo('Tab', false, -1, 0)).toEqual({ tipo: 'enfocar-contenedor' });
    expect(resolverTeclaDialogo('Tab', true, -1, 0)).toEqual({ tipo: 'enfocar-contenedor' });
  });

  it('Tab en medio del grupo deja que el navegador mueva el foco dentro', () => {
    expect(resolverTeclaDialogo('Tab', false, 1, 3)).toEqual({ tipo: 'ignorar' });
  });

  it('Tab desde el último recicla el foco al primero', () => {
    expect(resolverTeclaDialogo('Tab', false, 2, 3)).toEqual({ tipo: 'enfocar', indice: 0 });
  });

  it('Tab con el foco fuera del contenedor entra por el primero', () => {
    expect(resolverTeclaDialogo('Tab', false, -1, 3)).toEqual({ tipo: 'enfocar', indice: 0 });
  });

  it('Shift+Tab desde el primero recicla el foco al último', () => {
    expect(resolverTeclaDialogo('Tab', true, 0, 3)).toEqual({ tipo: 'enfocar', indice: 2 });
  });

  it('Shift+Tab desde el segundo deja que el navegador retroceda al primero', () => {
    expect(resolverTeclaDialogo('Tab', true, 1, 3)).toEqual({ tipo: 'ignorar' });
  });

  it('Shift+Tab con el foco fuera del contenedor entra por el último', () => {
    expect(resolverTeclaDialogo('Tab', true, -1, 3)).toEqual({ tipo: 'enfocar', indice: 2 });
  });

  it('un grupo de un solo focusable cicla sobre sí mismo en ambos sentidos', () => {
    expect(resolverTeclaDialogo('Tab', false, 0, 1)).toEqual({ tipo: 'enfocar', indice: 0 });
    expect(resolverTeclaDialogo('Tab', true, 0, 1)).toEqual({ tipo: 'enfocar', indice: 0 });
  });
});
