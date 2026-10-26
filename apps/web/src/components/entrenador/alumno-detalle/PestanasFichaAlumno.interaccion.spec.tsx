// @vitest-environment jsdom
/**
 * 01 · Ficha del alumno (L1.1) · nombres de las pestañas y badge de deuda.
 *
 * Contrato:
 * - Los cinco `role="tab"` se llaman, en orden, Perfil, Pagos, Medidas, Entrenos y Nutrición.
 * - Las claves de `?tab=` no cambian: `resumen`, `finanzas`, `antropometria`, `entrenamiento`,
 *   `nutricion` (se comprueban en el `id`/`aria-controls` que genera `useTabsAccesibles`).
 * - El badge del tab Pagos conserva el importe visible y gana el nombre accesible
 *   "Saldo pendiente 40.00 dólares" (sin símbolo y con dos decimales).
 */
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  TABS_FICHA_ALUMNO,
  type TabFichaAlumno,
} from '../../../lib/alumno-detalle-tab';
import { useTabsAccesibles } from '../../../lib/use-tabs-accesibles';
import { PestanasFichaAlumno } from './PestanasFichaAlumno';

afterEach(() => {
  cleanup();
});

const ID_BASE = 'ficha-alumno';

const TABS_ESPERADAS = [
  { etiqueta: 'Perfil', clave: 'resumen' },
  { etiqueta: 'Pagos', clave: 'finanzas' },
  { etiqueta: 'Medidas', clave: 'antropometria' },
  { etiqueta: 'Entrenos', clave: 'entrenamiento' },
  { etiqueta: 'Nutrición', clave: 'nutricion' },
] as const;

function PestanasConEstado({ saldoDeudaUsd }: { saldoDeudaUsd: string | null }) {
  const [activa, setActiva] = useState<TabFichaAlumno>('resumen');
  const { propsTablist, propsTab } = useTabsAccesibles<TabFichaAlumno>({
    claves: TABS_FICHA_ALUMNO,
    activa,
    onActivar: setActiva,
    idBase: ID_BASE,
  });

  return (
    <PestanasFichaAlumno
      activa={activa}
      propsTablist={propsTablist}
      propsTab={propsTab}
      saldoDeudaUsd={saldoDeudaUsd}
    />
  );
}

describe('PestanasFichaAlumno · L1.1 textos de las pestañas', () => {
  it('nombra los cinco tabs en orden y conserva las claves de ?tab=', () => {
    render(<PestanasConEstado saldoDeudaUsd={null} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);

    TABS_ESPERADAS.forEach(({ etiqueta, clave }, indice) => {
      const tab = tabs[indice];
      expect(within(tab).getByText(etiqueta)).toBeTruthy();
      expect(tab.id).toBe(`${ID_BASE}-tab-${clave}`);
      expect(tab.getAttribute('aria-controls')).toBe(`${ID_BASE}-panel-${clave}`);
    });
  });

  it('ya no muestra los nombres anteriores de las pestañas', () => {
    render(<PestanasConEstado saldoDeudaUsd={null} />);

    for (const textoAnterior of [
      'Resumen & Ficha Médica',
      'Finanzas & Pagos',
      'Antropometría & Medidas',
      'Entrenamiento & Rutinas',
      'Nutrición y reportes',
    ]) {
      expect(screen.queryByText(textoAnterior)).toBeNull();
    }
  });

  it('al activar Pagos usa la clave finanzas y mueve aria-selected', () => {
    render(<PestanasConEstado saldoDeudaUsd={null} />);

    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[1]);

    const despues = screen.getAllByRole('tab');
    expect(despues[1].getAttribute('aria-selected')).toBe('true');
    expect(despues[1].id).toBe(`${ID_BASE}-tab-finanzas`);
    expect(despues[0].getAttribute('aria-selected')).toBe('false');
  });
});

describe('PestanasFichaAlumno · L1.1 badge de deuda', () => {
  it('nombra el badge con dos decimales y sin símbolo, conservando el importe visible', () => {
    render(<PestanasConEstado saldoDeudaUsd="40.00" />);

    const badge = screen.getByLabelText('Saldo pendiente 40.00 dólares');
    expect(badge.textContent).toBe('$40.00');
  });

  it('no muestra badge cuando el saldo es nulo o cero', () => {
    render(<PestanasConEstado saldoDeudaUsd={null} />);
    expect(screen.queryByLabelText(/Saldo pendiente/)).toBeNull();

    cleanup();
    render(<PestanasConEstado saldoDeudaUsd="0.00" />);
    expect(screen.queryByLabelText(/Saldo pendiente/)).toBeNull();
  });

  it('V3 · el texto visible conserva el formato "$40.00" con saldo "40" sin decimales', () => {
    render(<PestanasConEstado saldoDeudaUsd="40" />);

    const badge = screen.getByLabelText('Saldo pendiente 40.00 dólares');
    expect(badge.textContent).toBe('$40.00');
  });

  it('V3 · con saldo "-5.00" y con "0" no hay badge', () => {
    render(<PestanasConEstado saldoDeudaUsd="-5.00" />);
    expect(screen.queryByLabelText(/Saldo pendiente/)).toBeNull();

    cleanup();
    render(<PestanasConEstado saldoDeudaUsd="0" />);
    expect(screen.queryByLabelText(/Saldo pendiente/)).toBeNull();
  });
});

describe('PestanasFichaAlumno · L4 barra segmentada (fase roja)', () => {
  function tablist(): HTMLElement {
    return screen.getByRole('tablist', { name: 'Pestañas de la ficha del alumno' });
  }

  function clases(elemento: Element): string[] {
    return elemento.className.split(/\s+/).filter(Boolean);
  }

  it('T4.1 · cuadrícula sin scroll: grid, 5 columnas iguales y 5 tabs hijos directos', () => {
    render(<PestanasConEstado saldoDeudaUsd={null} />);

    const barra = tablist();
    expect(clases(barra)).toContain('grid');
    expect(clases(barra)).toContain('grid-cols-5');
    expect(clases(barra)).not.toContain('overflow-x-auto');

    const tabs = barra.querySelectorAll(':scope > [role="tab"]');
    expect(tabs).toHaveLength(5);
  });

  it('T4.2 · control segmentado: fondo, esquinas y pestaña activa rellena', () => {
    render(<PestanasConEstado saldoDeudaUsd={null} />);

    const barra = tablist();
    expect(clases(barra)).toContain('bg-secondary/60');
    expect(clases(barra)).toContain('rounded-2xl');
    expect(clases(barra)).toContain('p-1');

    const tabs = screen.getAllByRole('tab');
    const activo = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
    expect(activo).toBeTruthy();
    expect(clases(activo!)).toContain('bg-primary');
    for (const tab of tabs.filter((tab) => tab !== activo)) {
      expect(clases(tab)).not.toContain('bg-primary');
    }
  });

  it('T4.3 · apilado en móvil: icono sobre etiqueta corta de 11px, fila desde sm', () => {
    render(<PestanasConEstado saldoDeudaUsd={null} />);

    for (const tab of screen.getAllByRole('tab')) {
      const tokens = clases(tab);
      expect(tokens).toContain('flex-col');
      expect(tokens).toContain('sm:flex-row');
      expect(tokens).toContain('min-h-11');

      expect(tab.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }

    for (const etiqueta of ['Perfil', 'Pagos', 'Medidas', 'Entrenos', 'Nutrición']) {
      const texto = screen.getByText(etiqueta, { exact: true });
      expect(clases(texto)).toContain('text-[11px]');
      expect(clases(texto)).toContain('sm:text-xs');
    }
  });

  it('T4.4 · badge de deuda compacto dentro del tab Pagos', () => {
    render(<PestanasConEstado saldoDeudaUsd="40" />);
    const tabPagos = screen
      .getAllByRole('tab')
      .find((tab) => tab.textContent?.includes('Pagos'));
    expect(tabPagos).toBeTruthy();

    const badge = screen.getByRole('img', { name: 'Saldo pendiente 40.00 dólares' });
    expect(tabPagos!.contains(badge)).toBe(true);
    expect(clases(badge)).toContain('absolute');
    expect(clases(badge)).toContain('sm:static');
    expect(tabPagos!.className.split(/\s+/)).toContain('relative');

    const importe = within(badge).getByText('$40.00');
    expect(importe.parentElement).not.toBeNull();
    expect(clases(importe.parentElement!)).toContain('hidden');
    expect(clases(importe.parentElement!)).toContain('sm:inline');
  });

  it('T4.4 · con null, "0" o "-5.00" no hay role="img"', () => {
    for (const saldo of [null, '0', '-5.00'] as const) {
      render(<PestanasConEstado saldoDeudaUsd={saldo} />);
      expect(screen.queryByRole('img', { name: /Saldo pendiente/ })).toBeNull();
      cleanup();
    }
  });

  it('T4.5 · teclado: flechas con ciclo, Home/End y roving tabindex', () => {
    render(<PestanasConEstado saldoDeudaUsd={null} />);
    const barra = tablist();

    const activos = () =>
      screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-selected') === 'true');
    const focos = () => screen.getAllByRole('tab').map((tab) => tab.tabIndex);

    // Solo el activo es tabulable.
    expect(focos()).toEqual([0, -1, -1, -1, -1]);

    fireEvent.keyDown(barra, { key: 'ArrowRight' });
    expect(activos()).toEqual([false, true, false, false, false]);

    fireEvent.keyDown(barra, { key: 'End' });
    expect(activos()).toEqual([false, false, false, false, true]);

    // Ciclo en el extremo: ArrowRight desde la última vuelve a la primera.
    fireEvent.keyDown(barra, { key: 'ArrowRight' });
    expect(activos()).toEqual([true, false, false, false, false]);

    fireEvent.keyDown(barra, { key: 'ArrowLeft' });
    expect(activos()).toEqual([false, false, false, false, true]);

    fireEvent.keyDown(barra, { key: 'Home' });
    expect(activos()).toEqual([true, false, false, false, false]);
    expect(focos()).toEqual([0, -1, -1, -1, -1]);
  });

  it('T4.6 · el tab Pagos se anuncia con "Pagos" y el saldo, conservando id y aria-controls', () => {
    render(<PestanasConEstado saldoDeudaUsd="40" />);

    const tabPagos = screen.getByRole('tab', { name: /Pagos.*Saldo pendiente 40\.00 dólares/ });
    expect(tabPagos.getAttribute('id')).toBe('ficha-alumno-tab-finanzas');
    expect(tabPagos.getAttribute('aria-controls')).toBe('ficha-alumno-panel-finanzas');
  });

  it('T4.7 · pulsar cada tab llama al onClick del hook con su clave', () => {
    const Claves: TabFichaAlumno[] = ['resumen', 'finanzas', 'antropometria', 'entrenamiento', 'nutricion'];
    const onActivar = vi.fn();

    function Harness() {
      const { propsTab } = useTabsAccesibles({
        claves: TABS_FICHA_ALUMNO,
        activa: 'resumen' as TabFichaAlumno,
        onActivar,
        idBase: ID_BASE,
      });
      (Harness as unknown as { expuestos?: unknown }).expuestos = { propsTab };
      return null;
    }

    render(<Harness />);
    const propsTab = (Harness as unknown as { expuestos: { propsTab: (c: TabFichaAlumno) => { onClick: () => void } } }).expuestos.propsTab;
    for (const clave of Claves) {
      propsTab(clave).onClick();
      expect(onActivar).toHaveBeenLastCalledWith(clave);
    }
  });
});
