/**
 * U3b: contrato del patrón APG de pestañas.
 *
 * `resolverFocoTabs` es puro y `useTabsAccesibles` no usa estado ni efectos: ambos se pueden
 * verificar en Node sin jsdom. El handler de teclado se prueba sin DOM navegando desde la
 * pestaña activa (mismo camino que usa el hook cuando `document` no existe).
 */
import { describe, expect, it, vi } from 'vitest';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { idsTabs, resolverFocoTabs, useTabsAccesibles } from './use-tabs-accesibles';

describe('idsTabs (U3b: enlace tab ↔ panel)', () => {
  it('deriva ids deterministas desde la base y la clave', () => {
    expect(idsTabs('ficha-alumno', 'resumen')).toEqual({
      tab: 'ficha-alumno-tab-resumen',
      panel: 'ficha-alumno-panel-resumen',
    });
  });
});

describe('resolverFocoTabs (APG: flechas, Home y End)', () => {
  it('horizontal: ArrowRight y ArrowLeft ciclan en los extremos', () => {
    expect(resolverFocoTabs('ArrowRight', 0, 3)).toBe(1);
    expect(resolverFocoTabs('ArrowRight', 2, 3)).toBe(0);
    expect(resolverFocoTabs('ArrowLeft', 0, 3)).toBe(2);
    expect(resolverFocoTabs('ArrowLeft', 2, 3)).toBe(1);
  });

  it('vertical: ArrowDown y ArrowUp navegan el tablist', () => {
    expect(resolverFocoTabs('ArrowDown', 0, 3, 'vertical')).toBe(1);
    expect(resolverFocoTabs('ArrowUp', 0, 3, 'vertical')).toBe(2);
    expect(resolverFocoTabs('ArrowRight', 0, 3, 'vertical')).toBeNull();
  });

  it('Home va al primero y End al último', () => {
    expect(resolverFocoTabs('Home', 2, 4)).toBe(0);
    expect(resolverFocoTabs('End', 0, 4)).toBe(3);
  });

  it('ignora teclas ajenas y tablists vacíos', () => {
    expect(resolverFocoTabs('Enter', 1, 3)).toBeNull();
    expect(resolverFocoTabs('ArrowRight', 0, 0)).toBeNull();
  });

  it('sin índice enfocado navega desde la primera pestaña', () => {
    expect(resolverFocoTabs('ArrowRight', -1, 3)).toBe(1);
    expect(resolverFocoTabs('ArrowLeft', -1, 3)).toBe(2);
  });
});

describe('useTabsAccesibles (contrato de props)', () => {
  const claves = ['resumen', 'finanzas', 'antropometria'] as const;

  it('roving tabindex: solo la pestaña activa participa del orden natural de Tab', () => {
    const { propsTab } = useTabsAccesibles({
      claves,
      activa: 'finanzas',
      onActivar: vi.fn(),
      idBase: 'ficha',
    });

    expect(propsTab('resumen').tabIndex).toBe(-1);
    expect(propsTab('finanzas').tabIndex).toBe(0);
    expect(propsTab('antropometria').tabIndex).toBe(-1);
  });

  it('cada tab enlaza su panel con id y aria-controls; el panel apunta de vuelta', () => {
    const { propsTab, propsPanel } = useTabsAccesibles({
      claves,
      activa: 'resumen',
      onActivar: vi.fn(),
      idBase: 'ficha',
    });

    expect(propsTab('resumen')).toMatchObject({
      role: 'tab',
      id: 'ficha-tab-resumen',
      'aria-controls': 'ficha-panel-resumen',
      'aria-selected': true,
    });
    expect(propsPanel('finanzas')).toEqual({
      role: 'tabpanel',
      id: 'ficha-panel-finanzas',
      'aria-labelledby': 'ficha-tab-finanzas',
    });
  });

  it('el tablist declara su orientación y navega con flechas activando la pestaña destino', () => {
    const onActivar = vi.fn();
    const { propsTablist } = useTabsAccesibles({
      claves,
      activa: 'resumen',
      onActivar,
      idBase: 'ficha',
    });
    const preventDefault = vi.fn();

    propsTablist.onKeyDown({
      key: 'ArrowRight',
      preventDefault,
    } as unknown as ReactKeyboardEvent<HTMLElement>);

    expect(propsTablist.role).toBe('tablist');
    expect(propsTablist['aria-orientation']).toBe('horizontal');
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onActivar).toHaveBeenCalledWith('finanzas');
  });

  it('ArrowLeft desde la primera cicla a la última y Home/End saltan a los extremos', () => {
    const onActivar = vi.fn();
    const { propsTablist } = useTabsAccesibles({
      claves,
      activa: 'resumen',
      onActivar,
      idBase: 'ficha',
    });
    const evento = (key: string) =>
      ({ key, preventDefault: vi.fn() }) as unknown as ReactKeyboardEvent<HTMLElement>;

    propsTablist.onKeyDown(evento('ArrowLeft'));
    expect(onActivar).toHaveBeenLastCalledWith('antropometria');

    propsTablist.onKeyDown(evento('End'));
    expect(onActivar).toHaveBeenLastCalledWith('antropometria');

    propsTablist.onKeyDown(evento('Home'));
    expect(onActivar).toHaveBeenLastCalledWith('resumen');
  });

  it('ignora teclas ajenas sin activar ni prevenir el default', () => {
    const onActivar = vi.fn();
    const { propsTablist } = useTabsAccesibles({
      claves,
      activa: 'resumen',
      onActivar,
      idBase: 'ficha',
    });
    const preventDefault = vi.fn();

    propsTablist.onKeyDown({ key: 'Enter', preventDefault } as unknown as ReactKeyboardEvent<HTMLElement>);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(onActivar).not.toHaveBeenCalled();
  });

  it('onClick del tab activa su clave', () => {
    const onActivar = vi.fn();
    const { propsTab } = useTabsAccesibles({
      claves,
      activa: 'resumen',
      onActivar,
      idBase: 'ficha',
    });

    propsTab('antropometria').onClick();
    expect(onActivar).toHaveBeenCalledWith('antropometria');
  });
});
