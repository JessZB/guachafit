// @vitest-environment happy-dom
/**
 * 01 · UX-07b · BarraTabsSegmentada: indicador de contador (Contrato A).
 *
 * Requisitos:
 * - A1: con variante="contador", el texto está visible en todos los tamaños (sin clases hidden
 *   en el contador ni en sus ancestros dentro del tab), no tiene role="img", e incluye
 *   rounded-full y text-[11px].
 * - A2: en el tab activo incluye bg-primary-foreground/20; en tab inactivo incluye
 *   bg-background/60 y no bg-primary-foreground/20.
 * - A3: sin variante (comportamiento heredado "alerta"), conserva role="img", absolute y
 *   el texto dentro de un contenedor con hidden sm:inline.
 */
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Clock, User } from 'lucide-react';
import { useTabsAccesibles } from '../../lib/use-tabs-accesibles';
import { BarraTabsSegmentada, type ItemTab } from './BarraTabsSegmentada';

afterEach(() => {
  cleanup();
});

type ClaveTest = 'tab-1' | 'tab-2';

type ItemTabContador<K extends string> = Omit<ItemTab<K>, 'indicador'> & {
  indicador?: {
    texto: string;
    ariaLabel: string;
    variante?: 'alerta' | 'contador';
  } | null;
};

function HarnessContador({
  items,
  activaInicial = 'tab-1',
}: {
  items: readonly ItemTabContador<ClaveTest>[];
  activaInicial?: ClaveTest;
}) {
  const [activa, setActiva] = useState<ClaveTest>(activaInicial);
  const claves = items.map((i) => i.clave);
  const { propsTablist, propsTab } = useTabsAccesibles<ClaveTest>({
    claves,
    activa,
    onActivar: setActiva,
    idBase: 'tabs-contador-test',
  });

  return (
    <BarraTabsSegmentada
      items={items as unknown as readonly ItemTab<ClaveTest>[]}
      activa={activa}
      propsTablist={propsTablist}
      propsTab={propsTab}
      ariaLabel="Pestañas de prueba"
    />
  );
}

describe('BarraTabsSegmentada · indicador de contador (Contrato A)', () => {
  it('A1 · contador visible en todos los tamaños (sin hidden), sin role="img", con rounded-full y text-[11px]', () => {
    const items: readonly ItemTabContador<ClaveTest>[] = [
      {
        clave: 'tab-1',
        etiqueta: 'Mora',
        icono: User,
        indicador: { texto: '3', ariaLabel: '3 alumnos', variante: 'contador' },
      },
      {
        clave: 'tab-2',
        etiqueta: 'Al día',
        icono: Clock,
      },
    ];

    render(<HarnessContador items={items} activaInicial="tab-1" />);

    const tab1 = screen.getByRole('tab', { name: /Mora/i });
    const elementoTexto = screen.getByText('3');
    expect(elementoTexto).not.toBeNull();

    // Comprobar que ningún ancestro dentro del botón tab incluye "hidden"
    let ancestro: HTMLElement | null = elementoTexto;
    while (ancestro && ancestro !== tab1) {
      const clases = ancestro.getAttribute('class') ?? '';
      expect(clases.split(/\s+/)).not.toContain('hidden');
      ancestro = ancestro.parentElement;
    }

    // El contador no debe tener role="img"
    const contenedorBadge = elementoTexto.closest('.rounded-full') ?? elementoTexto.parentElement;
    expect(contenedorBadge).not.toBeNull();
    expect(contenedorBadge?.getAttribute('role')).not.toBe('img');

    // Debe incluir rounded-full y text-[11px]
    const clasesBadge = contenedorBadge?.getAttribute('class') ?? '';
    expect(clasesBadge).toContain('rounded-full');
    expect(clasesBadge).toContain('text-[11px]');
  });

  it('A2 · estilo según tab activo: activo incluye bg-primary-foreground/20, inactivo incluye bg-background/60 y no bg-primary-foreground/20', () => {
    const items: readonly ItemTabContador<ClaveTest>[] = [
      {
        clave: 'tab-1',
        etiqueta: 'Mora',
        icono: User,
        indicador: { texto: '3', ariaLabel: '3 alumnos', variante: 'contador' },
      },
      {
        clave: 'tab-2',
        etiqueta: 'Por vencer',
        icono: Clock,
        indicador: { texto: '2', ariaLabel: '2 alumnos', variante: 'contador' },
      },
    ];

    render(<HarnessContador items={items} activaInicial="tab-1" />);

    const badgeActivo = screen.getByText('3').closest('.rounded-full') ?? screen.getByText('3').parentElement;
    const badgeInactivo = screen.getByText('2').closest('.rounded-full') ?? screen.getByText('2').parentElement;
    expect(badgeActivo).not.toBeNull();
    expect(badgeInactivo).not.toBeNull();

    const clasesActivo = badgeActivo?.getAttribute('class') ?? '';
    const clasesInactivo = badgeInactivo?.getAttribute('class') ?? '';

    expect(clasesActivo).toContain('bg-primary-foreground/20');
    expect(clasesInactivo).toContain('bg-background/60');
    expect(clasesInactivo).not.toContain('bg-primary-foreground/20');
  });

  it('A3 · compatibilidad: sin variante se comporta como alerta (role="img", absolute y texto en hidden sm:inline)', () => {
    const items: readonly ItemTabContador<ClaveTest>[] = [
      {
        clave: 'tab-1',
        etiqueta: 'Mora',
        icono: User,
        indicador: { texto: '5', ariaLabel: '5 alertas' },
      },
      {
        clave: 'tab-2',
        etiqueta: 'Al día',
        icono: Clock,
      },
    ];

    render(<HarnessContador items={items} activaInicial="tab-1" />);

    const imgAlerta = screen.getByRole('img', { name: '5 alertas' });
    expect(imgAlerta).not.toBeNull();

    const clasesImg = imgAlerta.getAttribute('class') ?? '';
    expect(clasesImg).toContain('absolute');

    const wrapperTexto = imgAlerta.querySelector('span');
    expect(wrapperTexto).not.toBeNull();
    const clasesWrapper = wrapperTexto?.getAttribute('class') ?? '';
    expect(clasesWrapper).toContain('hidden');
    expect(clasesWrapper).toContain('sm:inline');
  });
});
