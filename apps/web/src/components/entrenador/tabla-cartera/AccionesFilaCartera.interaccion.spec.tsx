// @vitest-environment jsdom
/**
 * 01 · UX-07b · AccionesFilaCartera: acciones por fila táctiles y menú en móvil (Contrato E).
 *
 * Requisitos:
 * - E1: En tabla (pestaña mora): tres botones accesibles con nombre propio ("Recordatorio para <alumno>",
 *   "Registrar cobro de <alumno>", "Ver ficha de <alumno>"), texto visible corto, min-h-11 y md:min-h-9, sin menú.
 * - E2: En tarjeta (pestaña mora con saldo): solo botón visible "Registrar cobro de <alumno>" (min-h-11 sin md:min-h-9)
 *   y botón "Más acciones para <alumno>" (h-11 w-11 aria-haspopup="menu"). Al abrir con ArrowDown, el menú contiene
 *   "Enviar recordatorio" y "Ver ficha" con min-h-11, y al activarlos llaman a sus callbacks con la fila.
 * - E3: En tarjeta (pestaña mora sin saldo): acción visible es "Recordatorio para <alumno>" y el menú contiene solo "Ver ficha".
 * - E4: En tarjeta (pestaña al_dia): solo está visible "Ver ficha de <alumno>" y no hay menú.
 * - E5: En pestaña revision (tabla y tarjeta): botón "Revisar en bandeja el pago de <alumno>", texto visible "Revisar en bandeja",
 *   min-h-11, llama a onRevisarPago y no hay menú.
 * - E6: Sin perfil (alumnoPerfilId: null): "Ver ficha" deshabilitado en tabla y en menú (aria-disabled="true" o data-disabled).
 */
import type { ComponentType } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EstadoCuota, type FilaCarteraDTO, type PestanaCarteraDTO } from '@guachafit/shared';
import { AccionesFilaCartera } from './AccionesFilaCartera';

afterEach(() => {
  cleanup();
});

type AccionesFilaCarteraProps = {
  fila: FilaCarteraDTO;
  pestana: PestanaCarteraDTO;
  contexto?: 'tabla' | 'tarjeta';
  onRecordatorio: (fila: FilaCarteraDTO) => void;
  onCobrar: (fila: FilaCarteraDTO) => void;
  onVerFicha: (fila: FilaCarteraDTO) => void;
  onRevisarPago?: (fila: FilaCarteraDTO) => void;
};

const AccionesFila = AccionesFilaCartera as unknown as ComponentType<AccionesFilaCarteraProps>;

function fixtureFila(overrides: Partial<FilaCarteraDTO> = {}): FilaCarteraDTO {
  return {
    alumnoUsuarioId: 'usr-carlos',
    alumnoPerfilId: 'perfil-carlos',
    alumnoNombre: 'Carlos Mendoza',
    telefonoWhatsapp: '+584121234567',
    planNombre: 'Plan Fuerza',
    estadoCuota: EstadoCuota.VENCIDA,
    saldoPendienteUsd: '40.00',
    saldoPendienteBs: null,
    tasaAplicada: null,
    saldoAFavorUsd: '0.00',
    diasAtraso: 4,
    diasRestantes: null,
    diasEspera: null,
    montoReportado: null,
    monedaOriginal: null,
    metodoPago: null,
    referenciaBancaria: null,
    comprobanteUrl: null,
    fechaCorteUtc: '2026-10-09T12:00:00.000Z',
    fechaReporteUtc: null,
    ultimaGestionUtc: null,
    pagoId: null,
    cuotaId: 'cuota-1',
    periodo: '2026-10',
    proximoCorte: '2026-11-15',
    ...overrides,
  };
}

function montarAcciones(params: {
  fila?: FilaCarteraDTO;
  pestana?: PestanaCarteraDTO;
  contexto?: 'tabla' | 'tarjeta';
  onRecordatorio?: (fila: FilaCarteraDTO) => void;
  onCobrar?: (fila: FilaCarteraDTO) => void;
  onVerFicha?: (fila: FilaCarteraDTO) => void;
  onRevisarPago?: (fila: FilaCarteraDTO) => void;
} = {}) {
  const {
    fila = fixtureFila(),
    pestana = 'mora',
    contexto = 'tabla',
    onRecordatorio = vi.fn(),
    onCobrar = vi.fn(),
    onVerFicha = vi.fn(),
  } = params;
  const onRevisarPago = 'onRevisarPago' in params ? params.onRevisarPago : vi.fn();
  render(
    <AccionesFila
      fila={fila}
      pestana={pestana}
      contexto={contexto}
      onRecordatorio={onRecordatorio}
      onCobrar={onCobrar}
      onVerFicha={onVerFicha}
      onRevisarPago={onRevisarPago}
    />
  );
  return { onRecordatorio, onCobrar, onVerFicha, onRevisarPago };
}

describe('AccionesFilaCartera · Contrato E (COB-19, COB-20, D3)', () => {
  it('E1 · tabla en pestaña mora: tres botones con nombre propio accesible, texto visible corto, min-h-11, md:min-h-9 y sin menú', () => {
    montarAcciones({ contexto: 'tabla', pestana: 'mora' });

    const botonRecordatorio = screen.getByRole('button', {
      name: 'Recordatorio para Carlos Mendoza',
    });
    expect(botonRecordatorio.textContent?.trim()).toBe('Recordatorio');
    const clasesRecordatorio = botonRecordatorio.getAttribute('class') ?? '';
    expect(clasesRecordatorio).toContain('min-h-11');
    expect(clasesRecordatorio).toContain('md:min-h-9');

    const botonCobro = screen.getByRole('button', {
      name: 'Registrar cobro de Carlos Mendoza',
    });
    expect(botonCobro.textContent?.trim()).toBe('Registrar cobro');
    const clasesCobro = botonCobro.getAttribute('class') ?? '';
    expect(clasesCobro).toContain('min-h-11');
    expect(clasesCobro).toContain('md:min-h-9');

    const botonFicha = screen.getByRole('button', {
      name: 'Ver ficha de Carlos Mendoza',
    });
    expect(botonFicha.textContent?.trim()).toBe('Ver ficha');
    const clasesFicha = botonFicha.getAttribute('class') ?? '';
    expect(clasesFicha).toContain('min-h-11');
    expect(clasesFicha).toContain('md:min-h-9');

    expect(screen.queryByRole('button', { name: /Más acciones/i })).toBeNull();
  });

  it('E2 · tarjeta en pestaña mora con saldo: solo Registrar cobro visible y menú Más acciones con Recordatorio y Ver ficha', async () => {
    const { onRecordatorio, onVerFicha } = montarAcciones({
      contexto: 'tarjeta',
      pestana: 'mora',
      fila: fixtureFila({ saldoPendienteUsd: '40.00' }),
    });

    const botonCobro = screen.getByRole('button', {
      name: 'Registrar cobro de Carlos Mendoza',
    });
    expect(botonCobro).not.toBeNull();
    const clasesCobro = botonCobro.getAttribute('class') ?? '';
    expect(clasesCobro).toContain('min-h-11');
    expect(clasesCobro).not.toContain('md:min-h-9');

    // Fuera del menú no debe haber botón suelto de recordatorio ni ver ficha
    expect(screen.queryByRole('button', { name: 'Recordatorio para Carlos Mendoza' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ver ficha de Carlos Mendoza' })).toBeNull();

    const botonMas = screen.getByRole('button', {
      name: 'Más acciones para Carlos Mendoza',
    });
    expect(botonMas.getAttribute('aria-haspopup')).toBe('menu');
    const clasesMas = botonMas.getAttribute('class') ?? '';
    expect(clasesMas).toContain('h-11');
    expect(clasesMas).toContain('w-11');

    botonMas.focus();
    fireEvent.keyDown(botonMas, { key: 'ArrowDown', code: 'ArrowDown' });

    const menu = await screen.findByRole('menu');
    expect(menu).not.toBeNull();

    const itemRecordatorio = within(menu).getByRole('menuitem', { name: 'Enviar recordatorio' });
    expect(itemRecordatorio.getAttribute('class')).toContain('min-h-11');

    const itemFicha = within(menu).getByRole('menuitem', { name: 'Ver ficha' });
    expect(itemFicha.getAttribute('class')).toContain('min-h-11');

    fireEvent.click(itemRecordatorio);
    expect(onRecordatorio).toHaveBeenCalledTimes(1);

    // Radix cierra el menú tras el clic; reabrimos con foco en el disparador y ArrowDown
    botonMas.focus();
    fireEvent.keyDown(botonMas, { key: 'ArrowDown', code: 'ArrowDown' });
    const menuReabierto = await screen.findByRole('menu');
    const itemFichaReabierto = within(menuReabierto).getByRole('menuitem', { name: 'Ver ficha' });
    fireEvent.click(itemFichaReabierto);
    expect(onVerFicha).toHaveBeenCalledTimes(1);
  });

  it('E3 · tarjeta en mora sin saldo: acción visible es Recordatorio y el menú solo contiene Ver ficha', async () => {
    montarAcciones({
      contexto: 'tarjeta',
      pestana: 'mora',
      fila: fixtureFila({ saldoPendienteUsd: '0.00' }),
    });

    const botonRecordatorio = screen.getByRole('button', {
      name: 'Recordatorio para Carlos Mendoza',
    });
    expect(botonRecordatorio).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar cobro de Carlos Mendoza' })).toBeNull();

    const botonMas = screen.getByRole('button', {
      name: 'Más acciones para Carlos Mendoza',
    });
    botonMas.focus();
    fireEvent.keyDown(botonMas, { key: 'ArrowDown', code: 'ArrowDown' });

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Ver ficha' })).not.toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: 'Enviar recordatorio' })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: 'Registrar cobro' })).toBeNull();
  });

  it('E4 · tarjeta en al_dia: solo está visible Ver ficha y no hay menú', () => {
    montarAcciones({ contexto: 'tarjeta', pestana: 'al_dia' });

    expect(screen.getByRole('button', { name: 'Ver ficha de Carlos Mendoza' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Más acciones/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Registrar cobro/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /recordatorio/i })).toBeNull();
  });

  it('E5 · revision en tabla y tarjeta: botón "Revisar en bandeja el pago de Carlos Mendoza" con texto "Revisar en bandeja", min-h-11, sin menú', () => {
    for (const ctx of ['tabla', 'tarjeta'] as const) {
      cleanup();
      const { onRevisarPago } = montarAcciones({ contexto: ctx, pestana: 'revision' });

      const botonRevisar = screen.getByRole('button', {
        name: 'Revisar en bandeja el pago de Carlos Mendoza',
      });
      expect(botonRevisar.textContent?.trim()).toBe('Revisar en bandeja');
      expect(botonRevisar.getAttribute('class')).toContain('min-h-11');

      fireEvent.click(botonRevisar);
      expect(onRevisarPago).toHaveBeenCalledTimes(1);

      expect(screen.queryByRole('button', { name: /Más acciones/i })).toBeNull();
    }
  });

  it('E6 · sin perfil (alumnoPerfilId: null): Ver ficha está deshabilitado en tabla y en menú', async () => {
    // 1. En tabla
    montarAcciones({
      contexto: 'tabla',
      pestana: 'mora',
      fila: fixtureFila({ alumnoPerfilId: null }),
    });

    const botonFichaTabla = screen.getByRole('button', {
      name: 'Ver ficha de Carlos Mendoza',
    });
    expect(botonFichaTabla.hasAttribute('disabled')).toBe(true);

    cleanup();

    // 2. En tarjeta (dentro del menú)
    montarAcciones({
      contexto: 'tarjeta',
      pestana: 'mora',
      fila: fixtureFila({ alumnoPerfilId: null, saldoPendienteUsd: '40.00' }),
    });

    const botonMas = screen.getByRole('button', {
      name: 'Más acciones para Carlos Mendoza',
    });
    botonMas.focus();
    fireEvent.keyDown(botonMas, { key: 'ArrowDown', code: 'ArrowDown' });

    const menu = await screen.findByRole('menu');
    const itemFicha = within(menu).getByRole('menuitem', { name: 'Ver ficha' });
    const esDeshabilitado =
      itemFicha.getAttribute('aria-disabled') === 'true' ||
      itemFicha.hasAttribute('data-disabled') ||
      itemFicha.hasAttribute('disabled');
    expect(esDeshabilitado).toBe(true);
  });

  it('E7 · en revision sin onRevisarPago: el botón "Revisar en bandeja..." está disabled', () => {
    for (const ctx of ['tabla', 'tarjeta'] as const) {
      cleanup();
      montarAcciones({ contexto: ctx, pestana: 'revision', onRevisarPago: undefined });
      const boton = screen.getByRole('button', {
        name: 'Revisar en bandeja el pago de Carlos Mendoza',
      });
      expect((boton as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('E8 · tarjeta en mora con saldoPendienteUsd="0.00" y alumnoPerfilId=null: no hay menú Más acciones', () => {
    montarAcciones({
      contexto: 'tarjeta',
      pestana: 'mora',
      fila: fixtureFila({ saldoPendienteUsd: '0.00', alumnoPerfilId: null }),
    });
    expect(
      screen.getByRole('button', { name: 'Recordatorio para Carlos Mendoza' })
    ).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Más acciones para Carlos Mendoza' })
    ).toBeNull();
  });
});
