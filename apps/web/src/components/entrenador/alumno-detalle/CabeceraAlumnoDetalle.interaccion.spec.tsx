// @vitest-environment jsdom
/**
 * 01 · Ficha del alumno (L1.2 + L1.7) · salud y limitaciones y modalidad en la cabecera.
 *
 * Contrato:
 * - El aviso de salud se titula "Salud y limitaciones"; "Alerta Médica" ya no existe.
 * - El botón "Ver detalle" tiene el nombre accesible "Ver salud y limitaciones de {nombres}".
 * - El texto se recorta a 2 líneas con `line-clamp-2` (no `truncate`) y conserva el texto
 *   completo en su `title`.
 * - Con ficha vacía o `null` el aviso no se renderiza.
 * - La modalidad se muestra como etiqueta humana ("Presencial" / "Remoto"), no como enum crudo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  EstadoAlumno,
  Modalidad,
  TipoDocumento,
  type PerfilAlumnoDetalleDTO,
} from '@guachafit/shared';
import type { SemaforoPago } from '../../../lib/etiquetas-dominio';
import { CabeceraAlumnoDetalle } from './CabeceraAlumnoDetalle';

afterEach(() => {
  cleanup();
});

const FICHA_SALUD =
  'Cirugía de rodilla: evitar sentadilla profunda, saltos y cambios de dirección bruscos.';

const PERFIL_BASE: PerfilAlumnoDetalleDTO = {
  id: 'c1111111-1111-4111-8111-111111111111',
  usuarioId: 'u1111111-1111-4111-8111-111111111111',
  entrenadorId: 'e1111111-1111-4111-8111-111111111111',
  tipoDocumento: TipoDocumento.V,
  numeroDocumento: '12345678',
  nombres: 'María',
  apellidos: 'López',
  email: 'maria@example.com',
  fechaNacimiento: '1995-04-12',
  edadCalculada: 31,
  telefonoWhatsapp: '+584140000000',
  modalidad: Modalidad.PRESENCIAL,
  estadoActivacion: EstadoAlumno.ACTIVO,
  fichaSaludPrivada: FICHA_SALUD,
  createdAtUtc: '2026-01-01T00:00:00.000Z',
};

function renderCabecera(
  parcial: Partial<PerfilAlumnoDetalleDTO> = {},
  semaforo: SemaforoPago | null = 'al_dia'
) {
  const onVerFichaCompleta = vi.fn();
  const utilidades = render(
    <CabeceraAlumnoDetalle
      alumno={{ ...PERFIL_BASE, ...parcial }}
      semaforo={semaforo}
      archivado={false}
      errorAccion={null}
      exitoAccion={null}
      onCambiarEstado={vi.fn()}
      onArchivar={vi.fn()}
      onRestaurar={vi.fn()}
      onVerFichaCompleta={onVerFichaCompleta}
    />
  );

  return { ...utilidades, onVerFichaCompleta };
}

describe('CabeceraAlumnoDetalle · L1.2 salud y limitaciones', () => {
  it('titula el aviso "Salud y limitaciones" y elimina "Alerta Médica"', () => {
    renderCabecera();

    expect(screen.getByText('Salud y limitaciones')).toBeTruthy();
    expect(screen.queryByText(/Alerta Médica/)).toBeNull();
  });

  it('llama "Ver detalle" al botón y le da el nombre accesible con el nombre del alumno', () => {
    const { onVerFichaCompleta } = renderCabecera();

    const boton = screen.getByRole('button', {
      name: 'Ver salud y limitaciones de María',
    });
    expect(within(boton).getByText('Ver detalle')).toBeTruthy();
    expect(screen.queryByText('Ver Ficha Completa')).toBeNull();

    fireEvent.click(boton);
    expect(onVerFichaCompleta).toHaveBeenCalledTimes(1);
  });

  it('limita el texto a dos líneas y conserva el texto completo en el title', () => {
    renderCabecera();

    const texto = screen.getByText(FICHA_SALUD);
    expect(texto.className).toContain('line-clamp-2');
    expect(texto.className).not.toContain('truncate');
    expect(texto.getAttribute('title')).toBe(FICHA_SALUD);
  });

  it('no renderiza el aviso con ficha vacía o nula', () => {
    renderCabecera({ fichaSaludPrivada: null });
    expect(screen.queryByText('Salud y limitaciones')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Ver salud y limitaciones/ })
    ).toBeNull();

    cleanup();
    renderCabecera({ fichaSaludPrivada: '' });
    expect(screen.queryByText('Salud y limitaciones')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Ver salud y limitaciones/ })
    ).toBeNull();
  });
});

describe('CabeceraAlumnoDetalle · L1.7 modalidad como etiqueta', () => {
  it('muestra "Presencial" en lugar del valor crudo del enum', () => {
    renderCabecera({ modalidad: Modalidad.PRESENCIAL });

    expect(screen.getByText('Presencial')).toBeTruthy();
    expect(screen.queryByText('presencial')).toBeNull();
  });

  it('muestra "Remoto" en lugar del valor crudo del enum', () => {
    renderCabecera({ modalidad: Modalidad.REMOTO });

    expect(screen.getByText('Remoto')).toBeTruthy();
    expect(screen.queryByText('remoto')).toBeNull();
  });
});
