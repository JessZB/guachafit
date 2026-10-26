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
import { afterEach, describe, expect, it } from 'vitest';
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
