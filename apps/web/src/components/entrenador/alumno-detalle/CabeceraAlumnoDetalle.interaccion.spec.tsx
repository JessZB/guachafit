// @vitest-environment happy-dom
/**
 * 07 · Ficha del alumno (L7 · cabecera) · tests de la cabecera (en verde).
 *
 * L7 mueve las acciones a un menú "Más acciones" (Radix), el aviso de salud a un
 * chip con panel y añade una franja de datos clave bajo la cabecera.
 *
 * Casos L1.2 obsoletos por L7 (cambiados al contrato nuevo):
 * - 'llama "Ver detalle" al botón…' → ya no hay "Ver detalle": el chip se abre y
 *   el panel trae "Editar en Perfil" (L7.5/L7.6).
 * - 'limita el texto a dos líneas y conserva el texto completo en el title' →
 *   plegado no hay texto ni `title` con la ficha ni `line-clamp-2` (L7.5/L7.6).
 * - 'titula el aviso "Salud y limitaciones"…' → el título vive en el chip con
 *   `aria-expanded`/`aria-controls` (L7.5).
 * - 'no renderiza el aviso con ficha vacía o nula' → adaptado al chip ausente.
 *
 * L1.7 (modalidad) sigue vigente y no se toca.
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
  opciones: { archivado?: boolean; semaforo?: SemaforoPago | null } = {},
) {
  const onCambiarEstado = vi.fn();
  const onArchivar = vi.fn();
  const onRestaurar = vi.fn();
  const onVerFichaCompleta = vi.fn();
  const arbol = (datos: Partial<PerfilAlumnoDetalleDTO>) => (
    <CabeceraAlumnoDetalle
      alumno={{ ...PERFIL_BASE, ...datos }}
      semaforo={opciones.semaforo ?? 'al_dia'}
      archivado={opciones.archivado ?? false}
      errorAccion={null}
      exitoAccion={null}
      onCambiarEstado={onCambiarEstado}
      onArchivar={onArchivar}
      onRestaurar={onRestaurar}
      onVerFichaCompleta={onVerFichaCompleta}
    />
  );
  const utilidades = render(arbol(parcial));

  return {
    ...utilidades,
    onCambiarEstado,
    onArchivar,
    onRestaurar,
    onVerFichaCompleta,
    /** Re-renderiza la cabecera con otro perfil (misma instancia de componente). */
    rerenderCon: (datos: Partial<PerfilAlumnoDetalleDTO>) => utilidades.rerender(arbol(datos)),
  };
}

/** Abre "Más acciones" con teclado (Radix en jsdom sin user-event). */
async function abrirMenuCabecera(): Promise<void> {
  const trigger = screen.getByRole('button', { name: 'Más acciones' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });
  await screen.findByRole('menu');
}

/** Devuelve el chip de salud (botón "Salud y limitaciones"). */
function chipSalud(): HTMLElement {
  return screen.getByRole('button', { name: 'Salud y limitaciones' });
}

describe('CabeceraAlumnoDetalle · L7.1 visibles', () => {
  it('WhatsApp visible y botón "Más acciones" (menu, min-h-11); sin botones de acción fuera del menú', () => {
    renderCabecera();

    expect(screen.getByRole('link', { name: 'WhatsApp' })).toBeTruthy();
    const trigger = screen.getByRole('button', { name: 'Más acciones' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.className).toContain('min-h-11');

    expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reactivar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Suspender por pago' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archivar' })).toBeNull();
  });
});

describe('CabeceraAlumnoDetalle · L7.2 menú en la cabecera', () => {
  it('con estado ACTIVO el menú ofrece Pausar, Suspender por pago y Archivar', async () => {
    renderCabecera({ estadoActivacion: EstadoAlumno.ACTIVO });
    await abrirMenuCabecera();

    expect(screen.getByRole('menuitem', { name: 'Pausar' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Suspender por pago' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Archivar' })).toBeTruthy();
  });
});

describe('CabeceraAlumnoDetalle · L7.3 acción desde la cabecera', () => {
  it('"Pausar" en el menú llama a onCambiarEstado(INACTIVO_PAUSADO) una vez', async () => {
    const { onCambiarEstado } = renderCabecera({ estadoActivacion: EstadoAlumno.ACTIVO });
    await abrirMenuCabecera();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Pausar' }));
    expect(onCambiarEstado).toHaveBeenCalledTimes(1);
    expect(onCambiarEstado).toHaveBeenCalledWith(EstadoAlumno.INACTIVO_PAUSADO);
  });
});

describe('CabeceraAlumnoDetalle · L7.4 archivado (regresión)', () => {
  it('sin "Más acciones": se ve "Restaurar Alumno" que llama a onRestaurar y WhatsApp sigue visible', () => {
    const { onRestaurar } = renderCabecera({}, { archivado: true });

    expect(screen.queryByRole('button', { name: 'Más acciones' })).toBeNull();
    const restaurar = screen.getByRole('button', { name: 'Restaurar Alumno' });
    fireEvent.click(restaurar);
    expect(onRestaurar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toBeTruthy();
  });
});

describe('CabeceraAlumnoDetalle · L7.5 chip de salud plegado', () => {
  it('el chip es un botón "Salud y limitaciones" con aria-expanded=false y aria-controls con id', () => {
    const { container } = renderCabecera();

    const chip = chipSalud();
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    const panelId = chip.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(container.querySelector(`#${CSS.escape(panelId!)}`)).toBeNull();
  });

  it('plegado el texto de la ficha no está en el documento ni en ningún title, y no hay line-clamp-2', () => {
    const { container } = renderCabecera();

    chipSalud();
    expect(screen.queryByText(FICHA_SALUD)).toBeNull();
    const conTitle = Array.from(container.querySelectorAll('[title]'));
    expect(conTitle.some((el) => el.getAttribute('title')?.includes(FICHA_SALUD))).toBe(
      false,
    );
    expect(screen.queryByText('Ver detalle')).toBeNull();
  });

  it('sin ficha (null o "") no hay chip', () => {
    renderCabecera({ fichaSaludPrivada: null });
    expect(screen.queryByRole('button', { name: 'Salud y limitaciones' })).toBeNull();

    cleanup();
    renderCabecera({ fichaSaludPrivada: '' });
    expect(screen.queryByRole('button', { name: 'Salud y limitaciones' })).toBeNull();
  });
});

describe('CabeceraAlumnoDetalle · L7.6 chip de salud desplegado', () => {
  it('al pulsar el chip aparece el panel con el id de aria-controls y el texto completo sin line-clamp-2', () => {
    const { container } = renderCabecera();

    fireEvent.click(chipSalud());
    const chip = screen.getByRole('button', { name: 'Salud y limitaciones' });
    expect(chip.getAttribute('aria-expanded')).toBe('true');

    const panelId = chip.getAttribute('aria-controls');
    const panel = container.querySelector(`#${CSS.escape(panelId!)}`);
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain(FICHA_SALUD);
    expect(panel!.querySelector('.line-clamp-2')).toBeNull();
  });

  it('el panel trae "Editar en Perfil" que llama a onVerFichaCompleta una vez', () => {
    const { container, onVerFichaCompleta } = renderCabecera();

    fireEvent.click(chipSalud());
    const chip = screen.getByRole('button', { name: 'Salud y limitaciones' });
    const panel = container.querySelector(`#${CSS.escape(chip.getAttribute('aria-controls')!)}`);
    const editar = within(panel as HTMLElement).getByRole('button', {
      name: 'Editar en Perfil',
    });
    fireEvent.click(editar);
    expect(onVerFichaCompleta).toHaveBeenCalledTimes(1);
  });

  it('al pulsar otra vez el chip el panel desaparece', () => {
    renderCabecera();

    fireEvent.click(chipSalud());
    expect(screen.getByText(FICHA_SALUD)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salud y limitaciones' }));
    expect(screen.queryByText(FICHA_SALUD)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Salud y limitaciones' }).getAttribute(
        'aria-expanded',
      ),
    ).toBe('false');
  });

  it('con Escape dentro del panel se pliega y el foco vuelve al chip', () => {
    const { container } = renderCabecera();

    fireEvent.click(chipSalud());
    const chip = screen.getByRole('button', { name: 'Salud y limitaciones' });
    const panel = container.querySelector(`#${CSS.escape(chip.getAttribute('aria-controls')!)}`);
    fireEvent.keyDown(panel!, { key: 'Escape', code: 'Escape' });

    expect(screen.queryByText(FICHA_SALUD)).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Salud y limitaciones' }),
    );
  });

  it('V5 · con Escape en el chip también se pliega, aria-expanded=false y el foco queda en el chip', () => {
    renderCabecera();

    fireEvent.click(chipSalud());
    const chip = screen.getByRole('button', { name: 'Salud y limitaciones' });
    expect(chip.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(chip, { key: 'Escape', code: 'Escape' });

    const chipPlegado = screen.getByRole('button', { name: 'Salud y limitaciones' });
    expect(chipPlegado.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(FICHA_SALUD)).toBeNull();
    expect(document.activeElement).toBe(chipPlegado);
  });

  it('V6 · el panel desplegado tiene tabIndex 0', () => {
    const { container } = renderCabecera();

    fireEvent.click(chipSalud());
    const chip = screen.getByRole('button', { name: 'Salud y limitaciones' });
    const panel = container.querySelector(`#${CSS.escape(chip.getAttribute('aria-controls')!)}`);
    expect(panel).not.toBeNull();
    expect(panel!.getAttribute('tabindex')).toBe('0');
  });

  it('V7 · re-renderizar con otro alumno.id pliega el panel', () => {
    const vista = renderCabecera();

    fireEvent.click(chipSalud());
    expect(screen.getByText(FICHA_SALUD)).toBeTruthy();

    vista.rerenderCon({ id: 'c2222222-2222-4222-8222-222222222222' });

    expect(screen.queryByText(FICHA_SALUD)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Salud y limitaciones' }).getAttribute(
        'aria-expanded',
      ),
    ).toBe('false');
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
