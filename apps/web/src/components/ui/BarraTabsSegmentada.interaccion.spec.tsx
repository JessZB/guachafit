// @vitest-environment jsdom
/**
 * 01 · UX-01 · BarraTabsSegmentada (átomo UI reutilizable)
 *
 * Contrato a testear según ADR-022 y lote UX-01:
 * 1. Tablist: role="tablist", aria-label = ariaLabel, clases base sin overflow-x-auto.
 * 2. Columnas por mapa fijo: grid-cols-2 a grid-cols-6 según items.length (it.each).
 * 3. Tabs hijos directos: tantos elementos como items, en orden y con <button type="button">.
 * 4. Props APG del hook: id, aria-controls, aria-selected y roving tabindex (0 en activa, -1 en resto).
 * 5. Activación: clic en inactivo y navegación por teclado (ArrowRight, ArrowLeft, Home, End).
 * 6. Estilo del activo: bg-primary solo en el tab activo.
 * 7. Apilado móvil y área táctil: flex-col, sm:flex-row, min-h-11, min-w-0, relative, svg con aria-hidden.
 * 8. Etiqueta: text-[11px], sm:text-xs, truncate.
 * 9. Nombre accesible: fallback a etiqueta sin ariaLabel y respeta ariaLabel si existe.
 * 10. Indicador: badge con absolute y sm:static, role="img", texto formateado hidden sm:inline.
 * 11. Sin dominio: claves y etiquetas genéricas sin dependencias de dominio.
 */
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Clock, Dumbbell, Flame, Heart, Scale, User } from 'lucide-react';
import { useTabsAccesibles } from '../../lib/use-tabs-accesibles';
import { BarraTabsSegmentada, type ItemTab } from './BarraTabsSegmentada';

afterEach(() => {
  cleanup();
});

function clases(elemento: Element): string[] {
  return elemento.className.split(/\s+/).filter(Boolean);
}

type ClavePrueba = 'tab-1' | 'tab-2' | 'tab-3' | 'tab-4' | 'tab-5' | 'tab-6';

const ITEMS_BASE: readonly ItemTab<ClavePrueba>[] = [
  { clave: 'tab-1', etiqueta: 'Pestaña 1', icono: User },
  { clave: 'tab-2', etiqueta: 'Pestaña 2', icono: Clock },
  { clave: 'tab-3', etiqueta: 'Pestaña 3', icono: Scale },
  { clave: 'tab-4', etiqueta: 'Pestaña 4', icono: Dumbbell },
  { clave: 'tab-5', etiqueta: 'Pestaña 5', icono: Flame },
  { clave: 'tab-6', etiqueta: 'Pestaña 6', icono: Heart },
];

function BarraHarness<K extends string>({
  items,
  activaInicial,
  idBase = 'barra-test',
  ariaLabel = 'Navegación de prueba',
}: {
  items: readonly ItemTab<K>[];
  activaInicial: K;
  idBase?: string;
  ariaLabel?: string;
}) {
  const [activa, setActiva] = useState<K>(activaInicial);
  const claves = items.map((i) => i.clave);
  const { propsTablist, propsTab } = useTabsAccesibles<K>({
    claves,
    activa,
    onActivar: setActiva,
    idBase,
  });

  return (
    <BarraTabsSegmentada
      items={items}
      activa={activa}
      propsTablist={propsTablist}
      propsTab={propsTab}
      ariaLabel={ariaLabel}
    />
  );
}

describe('BarraTabsSegmentada · interacción y DOM (ADR-022 / UX-01)', () => {
  it('1. Tablist: role="tablist", aria-label = ariaLabel, clases base sin overflow-x-auto', () => {
    const items = ITEMS_BASE.slice(0, 3);
    render(<BarraHarness items={items} activaInicial="tab-1" ariaLabel="Barra principal" />);

    const tablist = screen.getByRole('tablist', { name: 'Barra principal' });
    const tokens = clases(tablist);

    expect(tokens).toContain('grid');
    expect(tokens).toContain('gap-1');
    expect(tokens).toContain('p-1');
    expect(tokens).toContain('rounded-2xl');
    expect(tokens).toContain('bg-secondary/60');
    expect(tokens).toContain('border');
    expect(tokens).toContain('border-border/60');
    expect(tokens).not.toContain('overflow-x-auto');
  });

  it.each([
    [2, 'grid-cols-2'],
    [3, 'grid-cols-3'],
    [4, 'grid-cols-4'],
    [5, 'grid-cols-5'],
    [6, 'grid-cols-6'],
  ] as const)(
    '2. Columnas por mapa fijo: con %i items lleva exactamente %s y ninguna otra grid-cols-*',
    (cantidad, claseEsperada) => {
      const items = ITEMS_BASE.slice(0, cantidad);
      render(<BarraHarness items={items} activaInicial={items[0].clave} />);

      const tablist = screen.getByRole('tablist');
      const tokens = clases(tablist);

      expect(tokens).toContain(claseEsperada);
      const otrasColumnas = tokens.filter(
        (t) => t.startsWith('grid-cols-') && t !== claseEsperada
      );
      expect(otrasColumnas).toEqual([]);
    }
  );

  it('3. Tabs hijos directos: tantos elementos como items, en orden y con <button type="button">', () => {
    const items = ITEMS_BASE.slice(0, 4);
    render(<BarraHarness items={items} activaInicial="tab-1" />);

    const tablist = screen.getByRole('tablist');
    const tabsHijos = tablist.querySelectorAll(':scope > [role="tab"]');
    expect(tabsHijos).toHaveLength(4);

    tabsHijos.forEach((tab) => {
      expect(tab.tagName.toLowerCase()).toBe('button');
      expect(tab.getAttribute('type')).toBe('button');
    });
  });

  it('4. Props APG del hook: id, aria-controls, aria-selected y roving tabindex', () => {
    const items = ITEMS_BASE.slice(0, 3);
    render(
      <BarraHarness
        items={items}
        activaInicial="tab-1"
        idBase="barra-test"
      />
    );

    const tabs = screen.getAllByRole('tab');
    items.forEach(({ clave }, idx) => {
      const tab = tabs[idx];
      expect(tab.id).toBe(`barra-test-tab-${clave}`);
      expect(tab.getAttribute('aria-controls')).toBe(`barra-test-panel-${clave}`);

      if (clave === 'tab-1') {
        expect(tab.getAttribute('aria-selected')).toBe('true');
        expect(tab.tabIndex).toBe(0);
      } else {
        expect(tab.getAttribute('aria-selected')).toBe('false');
        expect(tab.tabIndex).toBe(-1);
      }
    });
  });

  it('5. Activación: clic en inactivo y navegación por teclado (ArrowRight, ArrowLeft, Home, End)', () => {
    const items = ITEMS_BASE.slice(0, 4);
    render(<BarraHarness items={items} activaInicial="tab-1" />);

    const tabsIniciales = screen.getAllByRole('tab');
    fireEvent.click(tabsIniciales[2]); // click en tab-3

    const tabsDespuesClick = screen.getAllByRole('tab');
    expect(tabsDespuesClick[2].getAttribute('aria-selected')).toBe('true');
    expect(tabsDespuesClick[0].getAttribute('aria-selected')).toBe('false');

    const tablist = screen.getByRole('tablist');

    // ArrowRight desde tab-3 -> tab-4
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    const tabsTrasRight = screen.getAllByRole('tab');
    expect(tabsTrasRight[3].getAttribute('aria-selected')).toBe('true');

    // ArrowRight desde tab-4 -> ciclo a tab-1
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    const tabsTrasCicloRight = screen.getAllByRole('tab');
    expect(tabsTrasCicloRight[0].getAttribute('aria-selected')).toBe('true');

    // ArrowLeft desde tab-1 -> ciclo al último (tab-4)
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    const tabsTrasCicloLeft = screen.getAllByRole('tab');
    expect(tabsTrasCicloLeft[3].getAttribute('aria-selected')).toBe('true');

    // Home -> primer tab (tab-1)
    fireEvent.keyDown(tablist, { key: 'Home' });
    const tabsTrasHome = screen.getAllByRole('tab');
    expect(tabsTrasHome[0].getAttribute('aria-selected')).toBe('true');

    // End -> último tab (tab-4)
    fireEvent.keyDown(tablist, { key: 'End' });
    const tabsTrasEnd = screen.getAllByRole('tab');
    expect(tabsTrasEnd[3].getAttribute('aria-selected')).toBe('true');
  });

  it('6. Estilo del activo: bg-primary solo en el tab activo y no en los inactivos', () => {
    const items = ITEMS_BASE.slice(0, 3);
    render(<BarraHarness items={items} activaInicial="tab-2" />);

    const tabs = screen.getAllByRole('tab');
    const tabActivo = tabs[1];
    expect(clases(tabActivo)).toContain('bg-primary');

    const inactivos = [tabs[0], tabs[2]];
    for (const tabInactivo of inactivos) {
      expect(clases(tabInactivo)).not.toContain('bg-primary');
    }
  });

  it('7. Apilado móvil y área táctil: clases responsivas y svg con aria-hidden="true"', () => {
    const items = ITEMS_BASE.slice(0, 3);
    render(<BarraHarness items={items} activaInicial="tab-1" />);

    const tabs = screen.getAllByRole('tab');
    for (const tab of tabs) {
      const tokens = clases(tab);
      expect(tokens).toContain('flex-col');
      expect(tokens).toContain('sm:flex-row');
      expect(tokens).toContain('min-h-11');
      expect(tokens).toContain('min-w-0');
      expect(tokens).toContain('relative');

      const svg = tab.querySelector('svg[aria-hidden="true"]');
      expect(svg).not.toBeNull();
    }
  });

  it('8. Etiqueta: texto exacto visible con clases text-[11px], sm:text-xs y truncate', () => {
    const items = ITEMS_BASE.slice(0, 3);
    render(<BarraHarness items={items} activaInicial="tab-1" />);

    for (const item of items) {
      const texto = screen.getByText(item.etiqueta, { exact: true });
      const tokens = clases(texto);
      expect(tokens).toContain('text-[11px]');
      expect(tokens).toContain('sm:text-xs');
      expect(tokens).toContain('truncate');
    }
  });

  it('9. Nombre accesible: fallback a etiqueta sin ariaLabel y respeta ariaLabel si existe', () => {
    type ClavesAccesibles = 'resumen' | 'acceso';
    const items: readonly ItemTab<ClavesAccesibles>[] = [
      { clave: 'resumen', etiqueta: 'Perfil', icono: User },
      {
        clave: 'acceso',
        etiqueta: 'Acceso',
        icono: Clock,
        ariaLabel: 'Correo y contraseña',
      },
    ];

    render(<BarraHarness items={items} activaInicial="resumen" />);

    expect(screen.getByRole('tab', { name: 'Perfil' })).toBeTruthy();

    const tabAcceso = screen.getByRole('tab', { name: 'Correo y contraseña' });
    expect(tabAcceso).toBeTruthy();
    expect(within(tabAcceso).getByText('Acceso', { exact: true })).toBeTruthy();
  });

  it('10. Indicador: badge dentro del tab con absolute/sm:static e importe visible hidden sm:inline', () => {
    type ClavesConIndicador = 'pagos' | 'otros';
    const itemsConIndicador: readonly ItemTab<ClavesConIndicador>[] = [
      {
        clave: 'pagos',
        etiqueta: 'Pagos',
        icono: Scale,
        indicador: {
          texto: '$40.00',
          ariaLabel: 'Saldo pendiente 40.00 dólares',
        },
      },
      { clave: 'otros', etiqueta: 'Otros', icono: User, indicador: null },
    ];

    render(<BarraHarness items={itemsConIndicador} activaInicial="pagos" />);

    const badge = screen.getByRole('img', { name: 'Saldo pendiente 40.00 dólares' });
    const tabPagos = screen.getByRole('tab', { name: /Pagos/ });
    expect(tabPagos.contains(badge)).toBe(true);

    const tokensBadge = clases(badge);
    expect(tokensBadge).toContain('absolute');
    expect(tokensBadge).toContain('sm:static');

    const textoBadge = within(badge).getByText('$40.00');
    expect(textoBadge.parentElement).not.toBeNull();
    const tokensPadreTexto = clases(textoBadge.parentElement!);
    expect(tokensPadreTexto).toContain('hidden');
    expect(tokensPadreTexto).toContain('sm:inline');

    cleanup();
    const itemsSinIndicador: readonly ItemTab<'solo'>[] = [
      { clave: 'solo', etiqueta: 'Solo', icono: User },
    ];
    render(<BarraHarness items={itemsSinIndicador} activaInicial="solo" />);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('11. Sin dominio: átomo completamente agnóstico a la ficha del alumno', () => {
    type ClaveGenerica = 'alfa' | 'beta' | 'gamma';
    const itemsGenericos: readonly ItemTab<ClaveGenerica>[] = [
      { clave: 'alfa', etiqueta: 'Sección Alfa', icono: User },
      { clave: 'beta', etiqueta: 'Sección Beta', icono: Clock },
      { clave: 'gamma', etiqueta: 'Sección Gamma', icono: Scale },
    ];

    render(
      <BarraHarness
        items={itemsGenericos}
        activaInicial="alfa"
        ariaLabel="Pestañas genéricas"
      />
    );

    expect(screen.getByRole('tablist', { name: 'Pestañas genéricas' })).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });
});
