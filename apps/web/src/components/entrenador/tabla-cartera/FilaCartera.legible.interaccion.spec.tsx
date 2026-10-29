// @vitest-environment jsdom
/**
 * 01 · UX-07b · FilaCartera: celda, situación, tarjeta y tabla (Contrato F).
 *
 * Requisitos:
 * - F1: Nombre largo en la tarjeta: el nombre del alumno ("María Fernanda de los Ángeles Rodríguez Pérez")
 *   en CeldaAlumnoCartera contexto="tarjeta" incluye line-clamp-2 y break-words, y NO incluye truncate.
 * - F2: Badges: el badge de situación de cada pestaña ("Pago en revisión", "Al día" y estado de cuota)
 *   está en un elemento con whitespace-nowrap y shrink-0 (átomo BadgeEstado).
 * - F3: Cabecera de la tarjeta: el contenedor de nombre y situación en TarjetasMovilCartera incluye flex-wrap.
 * - F4: Próximo vencimiento (P2) en pestaña al_dia:
 *   - con proximoCorte: '2026-11-15', tarjeta y tabla muestran "Próximo vencimiento" y formatFechaCalendario('2026-11-15');
 *   - en la tabla de escritorio hay un th llamado "Próximo vencimiento";
 *   - con proximoCorte: null muestran "Sin próximo corte".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EstadoCuota, type FilaCarteraDTO } from '@guachafit/shared';
import { formatFechaCalendario } from '../../../lib/date-format';
import { CeldaAlumnoCartera } from './CeldaAlumnoCartera';
import { SituacionFilaCartera } from './SituacionFilaCartera';
import { TarjetasMovilCartera } from './TarjetasMovilCartera';
import { TablaEscritorioCartera } from './TablaEscritorioCartera';

afterEach(() => {
  cleanup();
});

function fixtureFila(overrides: Partial<FilaCarteraDTO> = {}): FilaCarteraDTO {
  return {
    alumnoUsuarioId: 'usr-maria',
    alumnoPerfilId: 'perfil-maria',
    alumnoNombre: 'María Fernanda de los Ángeles Rodríguez Pérez',
    telefonoWhatsapp: '+584121234567',
    planNombre: 'Plan Elite',
    estadoCuota: EstadoCuota.VENCIDA,
    saldoPendienteUsd: '60.00',
    saldoPendienteBs: null,
    tasaAplicada: null,
    saldoAFavorUsd: '0.00',
    diasAtraso: 3,
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

describe('FilaCartera · Contrato F (COB-21, P2)', () => {
  it('F1 · nombre largo en la tarjeta: incluye line-clamp-2 y break-words, y no incluye truncate', () => {
    const fila = fixtureFila();
    render(<CeldaAlumnoCartera fila={fila} contexto="tarjeta" />);

    const elementoNombre = screen.getByText('María Fernanda de los Ángeles Rodríguez Pérez');
    const clases = elementoNombre.getAttribute('class') ?? '';

    expect(clases).toContain('line-clamp-2');
    expect(clases).toContain('break-words');
    expect(clases).not.toContain('truncate');
  });

  it('F2 · badges de situación en cada pestaña incluyen whitespace-nowrap y shrink-0', () => {
    // 1. Mora (estado cuota vencida)
    const { unmount: u1 } = render(
      <SituacionFilaCartera fila={fixtureFila({ estadoCuota: EstadoCuota.VENCIDA })} pestana="mora" />
    );
    const badgeMora = screen.getByText(/vencida/i).closest('span');
    expect(badgeMora).not.toBeNull();
    const clasesMora = badgeMora?.getAttribute('class') ?? '';
    expect(clasesMora).toContain('whitespace-nowrap');
    expect(clasesMora).toContain('shrink-0');
    u1();

    // 2. Revision ("Pago en revisión")
    const { unmount: u2 } = render(
      <SituacionFilaCartera fila={fixtureFila()} pestana="revision" />
    );
    const badgeRevision = screen.getByText('Pago en revisión').closest('span');
    expect(badgeRevision).not.toBeNull();
    const clasesRevision = badgeRevision?.getAttribute('class') ?? '';
    expect(clasesRevision).toContain('whitespace-nowrap');
    expect(clasesRevision).toContain('shrink-0');
    u2();

    // 3. Al día ("Al día")
    render(<SituacionFilaCartera fila={fixtureFila()} pestana="al_dia" />);
    const badgeAlDia = screen.getByText('Al día').closest('span');
    expect(badgeAlDia).not.toBeNull();
    const clasesAlDia = badgeAlDia?.getAttribute('class') ?? '';
    expect(clasesAlDia).toContain('whitespace-nowrap');
    expect(clasesAlDia).toContain('shrink-0');
  });

  it('F3 · cabecera de la tarjeta: el contenedor directo de nombre y situación en TarjetasMovilCartera incluye flex-wrap', () => {
    render(
      <MemoryRouter>
        <TarjetasMovilCartera
          filas={[fixtureFila()]}
          pestana="mora"
          onRecordatorio={vi.fn()}
          onCobrar={vi.fn()}
          onVerFicha={vi.fn()}
        />
      </MemoryRouter>
    );

    const elementoNombre = screen.getByText('María Fernanda de los Ángeles Rodríguez Pérez');
    // El contenedor de la cabecera es el que agrupa la celda del alumno y la situación
    const cabeceraTarjeta = elementoNombre.closest('.p-4')?.firstElementChild;
    expect(cabeceraTarjeta).not.toBeNull();
    const clases = cabeceraTarjeta?.getAttribute('class') ?? '';
    expect(clases).toContain('flex-wrap');
  });

  it('F4 · próximo vencimiento (P2) en al_dia: tarjeta y tabla muestran fecha con formatFechaCalendario o "Sin próximo corte", y tabla tiene th correspondiente', () => {
    const fechaEsperada = formatFechaCalendario('2026-11-15');
    expect(fechaEsperada).toBeTruthy();

    const filaConPlan = fixtureFila({ proximoCorte: '2026-11-15' });
    const filaSinPlan = fixtureFila({
      alumnoUsuarioId: 'usr-sin-plan',
      alumnoNombre: 'Pedro Sin Plan',
      proximoCorte: null,
    });

    // 1. Verificar en tabla de escritorio
    const { unmount: unmountTabla } = render(
      <MemoryRouter>
        <TablaEscritorioCartera
          filas={[filaConPlan, filaSinPlan]}
          pestana="al_dia"
          onRecordatorio={vi.fn()}
          onCobrar={vi.fn()}
          onVerFicha={vi.fn()}
        />
      </MemoryRouter>
    );

    const encabezadoVencimiento = screen.getByRole('columnheader', {
      name: 'Próximo vencimiento',
    });
    expect(encabezadoVencimiento).not.toBeNull();

    expect(screen.getByText(fechaEsperada!)).not.toBeNull();
    expect(screen.getByText('Sin próximo corte')).not.toBeNull();

    unmountTabla();

    // 2. Verificar en tarjetas móviles
    render(
      <MemoryRouter>
        <TarjetasMovilCartera
          filas={[filaConPlan, filaSinPlan]}
          pestana="al_dia"
          onRecordatorio={vi.fn()}
          onCobrar={vi.fn()}
          onVerFicha={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getAllByText(/Próximo vencimiento/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(fechaEsperada!)).not.toBeNull();
    expect(screen.getByText('Sin próximo corte')).not.toBeNull();
  });
});
