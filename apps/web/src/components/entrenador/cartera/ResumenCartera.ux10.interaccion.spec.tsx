// @vitest-environment happy-dom
/**
 * 01 · UX-10 · Contrato D3 · ResumenCartera.
 *
 * D3:
 * - Títulos: "Recaudado del mes", "Total en mora", "Próximos a vencer" y "Pagos por validar".
 * - Valores: con recaudadoMesUsd: '1900.00' se ve "$1.900,00".
 *   Con totalPorVencerUsd: '80.00' el subtítulo es "$80,00 USD vencen en los próximos 5 días".
 * - Badges: ya no existen el badge "USD" ni el badge "≤ 5 días".
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ResumenCarteraDTO } from '@guachafit/shared';
import { ResumenCartera } from './ResumenCartera';

afterEach(() => {
  cleanup();
});

function fixtureResumen(parcial: Partial<ResumenCarteraDTO> = {}): ResumenCarteraDTO {
  return {
    recaudadoMesUsd: '1900.00',
    totalEnMoraUsd: '120.00',
    alumnosEnMora: 2,
    proximosAVencer: 1,
    totalPorVencerUsd: '80.00',
    pagosPorValidar: 3,
    contadores: {
      mora: 2,
      porVencer: 1,
      revision: 3,
      alDia: 10,
    } as any,
    tasaVigente: null,
    ...parcial,
  };
}

describe('Contrato D3 · ResumenCartera (UX-10)', () => {
  it('D3 · títulos en sentence case, montos venezolanos y eliminación de badges superfluos', () => {
    const resumen = fixtureResumen();
    render(
      <MemoryRouter>
        <ResumenCartera resumen={resumen} />
      </MemoryRouter>
    );

    // 1. Títulos en sentence case
    expect(screen.getByText('Recaudado del mes')).toBeTruthy();
    expect(screen.getByText('Total en mora')).toBeTruthy();
    expect(screen.getByText('Próximos a vencer')).toBeTruthy();
    expect(screen.getByText('Pagos por validar')).toBeTruthy();

    expect(screen.queryByText('Recaudado del Mes')).toBeNull();
    expect(screen.queryByText('Total en Mora')).toBeNull();
    expect(screen.queryByText('Próximos a Vencer')).toBeNull();
    expect(screen.queryByText('Pagos por Validar')).toBeNull();

    // 2. Valores y subtítulos formateados
    expect(screen.getByText('$1.900,00')).toBeTruthy();
    expect(screen.getByText('$80,00 USD vencen en los próximos 5 días')).toBeTruthy();

    // 3. Badges eliminados
    expect(screen.queryByText('USD')).toBeNull();
    expect(screen.queryByText('≤ 5 días')).toBeNull();
  });
});
