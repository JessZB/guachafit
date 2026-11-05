// @vitest-environment happy-dom
/**
 * 01 · Mis alumnos (flecha de la tarjeta) · contrato T1-T4.
 *
 * Bug del owner: la flecha `>` parece un botón pero no hacía nada porque el
 * contenedor de acciones (`relative z-10`) quedaba por encima del enlace extendido
 * del nombre (`after:absolute after:inset-0`) y la flecha interceptaba el clic.
 * Corrección: `pointer-events-none` en el contenedor decorativo de la flecha.
 *
 * Nota: jsdom no hace hit-testing, así que T1 fija el contrato con la clase
 * (`pointer-events-none`, `aria-hidden`, no enfocable). El clic real sobre la
 * flecha queda para la guía manual.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  EstadoAlumno,
  Modalidad,
  TipoDocumento,
  type AlumnoDirectorioItemDTO,
} from '@guachafit/shared';
import { TarjetaAlumnoDirectorio } from './TarjetaAlumnoDirectorio';

afterEach(() => {
  cleanup();
});

const ALUMNO_ACTIVO: AlumnoDirectorioItemDTO = {
  id: 'al-001',
  usuarioId: 'u-001',
  entrenadorId: 'coach-01',
  nombres: 'Carlos',
  apellidos: 'Mendoza',
  email: 'carlos.mendoza@email.com',
  tipoDocumento: TipoDocumento.V,
  numeroDocumento: '24123456',
  fechaNacimiento: '1998-05-14',
  edadCalculada: 28,
  telefonoWhatsapp: '+584121234567',
  modalidad: Modalidad.PRESENCIAL,
  estadoActivacion: EstadoAlumno.ACTIVO,
  planActivoNombre: 'Presencial Completo',
  semaforoPago: 'al_dia',
  ultimaSesionFecha: null,
  rachaDias: 0,
  rachaUltimaFecha: null,
  createdAtUtc: '2026-01-10T00:00:00.000Z',
};

const ALUMNO_ARCHIVADO: AlumnoDirectorioItemDTO = {
  ...ALUMNO_ACTIVO,
  id: 'al-003',
  usuarioId: 'u-003',
  nombres: 'Roberto',
  apellidos: 'Diaz',
  email: 'roberto.diaz@email.com',
  numeroDocumento: '20112233',
  estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
  semaforoPago: 'sin_cuota',
  deletedAtUtc: '2026-06-01T00:00:00.000Z',
};

function montar(alumno: AlumnoDirectorioItemDTO) {
  const onVerExpediente = vi.fn();
  const onRestaurar = vi.fn();
  const utils = render(
    <TarjetaAlumnoDirectorio
      alumno={alumno}
      onVerExpediente={onVerExpediente}
      onRestaurar={onRestaurar}
    />,
  );
  return { ...utils, onVerExpediente, onRestaurar };
}

/** Contenedor decorativo de la flecha: el padre del `svg` de lucide `chevron-right`. */
function contenedorFlecha(container: HTMLElement): HTMLElement | null {
  const svg = container.querySelector('svg.lucide-chevron-right');
  return (svg?.parentElement as HTMLElement | undefined) ?? null;
}

/** Contenedor de acciones: ancestro directo con `z-10` del enlace de WhatsApp. */
function contenedorAcciones(whatsapp: HTMLElement): HTMLElement | null {
  return whatsapp.closest('.z-10') as HTMLElement | null;
}

/** Un elemento "hereda" `pointer-events-none` si él o un ancestro dentro del contenedor lo declara. */
function heredaPointerEventsNone(elemento: HTMLElement, raiz: HTMLElement): boolean {
  let actual: HTMLElement | null = elemento;
  while (actual) {
    if (actual.className.includes('pointer-events-none')) return true;
    if (actual === raiz) break;
    actual = actual.parentElement;
  }
  return false;
}

describe('TarjetaAlumnoDirectorio · flecha decorativa', () => {
  it('T1 · alumno no archivado: el contenedor de la flecha es decorativo y deja pasar el clic', () => {
    const { container } = montar(ALUMNO_ACTIVO);

    const flecha = contenedorFlecha(container);
    expect(flecha).toBeTruthy();
    expect(flecha!.getAttribute('aria-hidden')).toBe('true');
    expect(flecha!.className).toContain('pointer-events-none');
    expect(flecha!.hasAttribute('tabindex')).toBe(false);
    expect(flecha!.tagName).not.toBe('BUTTON');
    expect(flecha!.tagName).not.toBe('A');
  });

  it('T2 · el botón del nombre llama a onVerExpediente con el id', () => {
    const { onVerExpediente, onRestaurar } = montar(ALUMNO_ACTIVO);

    fireEvent.click(screen.getByRole('button', { name: 'Ver expediente de Carlos Mendoza' }));

    expect(onVerExpediente).toHaveBeenCalledTimes(1);
    expect(onVerExpediente).toHaveBeenCalledWith('al-001');
    expect(onRestaurar).not.toHaveBeenCalled();
  });

  it('T3 · alumno archivado: sin flecha, con Restaurar que no navega', () => {
    const { container, onVerExpediente, onRestaurar } = montar(ALUMNO_ARCHIVADO);

    expect(contenedorFlecha(container)).toBeNull();
    const restaurar = screen.getByRole('button', { name: 'Restaurar alumno Roberto Diaz' });
    expect(restaurar).toBeTruthy();

    fireEvent.click(restaurar);
    expect(onRestaurar).toHaveBeenCalledTimes(1);
    expect(onVerExpediente).not.toHaveBeenCalled();
  });

  it('T4 · el enlace de WhatsApp no llama a onVerExpediente', () => {
    const { onVerExpediente } = montar(ALUMNO_ACTIVO);

    const whatsapp = screen.getByRole('link', { name: 'Enviar mensaje de WhatsApp a Carlos' });
    fireEvent.click(whatsapp);

    expect(onVerExpediente).not.toHaveBeenCalled();
  });
});

describe('TarjetaAlumnoDirectorio · contenedor de acciones (T5-T7)', () => {
  it('T5 · el contenedor z-10 con WhatsApp y flecha deja pasar el clic', () => {
    montar(ALUMNO_ACTIVO);
    const whatsapp = screen.getByRole('link', { name: 'Enviar mensaje de WhatsApp a Carlos' });

    const acciones = contenedorAcciones(whatsapp);
    expect(acciones).toBeTruthy();
    expect(acciones!.className).toContain('pointer-events-none');
    // Contiene tanto el enlace como el contenedor decorativo de la flecha.
    expect(acciones!.querySelector('svg.lucide-chevron-right')).toBeTruthy();
  });

  it('T6 · los únicos controles con clic llevan pointer-events-auto (activo)', () => {
    montar(ALUMNO_ACTIVO);
    const whatsapp = screen.getByRole('link', { name: 'Enviar mensaje de WhatsApp a Carlos' });

    expect(whatsapp.className).toContain('pointer-events-auto');
  });

  it('T6 · los únicos controles con clic llevan pointer-events-auto (archivado)', () => {
    montar(ALUMNO_ARCHIVADO);
    const whatsapp = screen.getByRole('link', { name: 'Enviar mensaje de WhatsApp a Roberto' });
    const restaurar = screen.getByRole('button', { name: 'Restaurar alumno Roberto Diaz' });

    expect(whatsapp.className).toContain('pointer-events-auto');
    expect(restaurar.className).toContain('pointer-events-auto');
  });

  it('T7 · todo control dentro del contenedor es pointer-events-auto y lo decorativo no intercepta', () => {
    // Interpretación documentada: un `aria-hidden` DENTRO de un `a`/`button` hereda del control
    // (auto) y es correcto; la regla "none o hereda de none" aplica a lo decorativo que no vive
    // dentro de un control (p. ej. la flecha). Si un control nuevo sin `pointer-events-auto`
    // rompiera el clic, este test falla.
    for (const alumno of [ALUMNO_ACTIVO, ALUMNO_ARCHIVADO]) {
      const { container, unmount } = render(
        <TarjetaAlumnoDirectorio
          alumno={alumno}
          onVerExpediente={vi.fn()}
          onRestaurar={vi.fn()}
        />,
      );
      const whatsapp = screen.getByRole('link', {
        name: `Enviar mensaje de WhatsApp a ${alumno.nombres}`,
      });
      const acciones = contenedorAcciones(whatsapp)!;

      for (const control of Array.from(acciones.querySelectorAll<HTMLElement>('a, button'))) {
        expect(control.className).toContain('pointer-events-auto');
      }

      for (const decorativo of Array.from(
        acciones.querySelectorAll<HTMLElement>('[aria-hidden="true"]'),
      )) {
        const dentroDeControl = decorativo.closest('a, button');
        if (dentroDeControl) {
          expect(dentroDeControl.className).toContain('pointer-events-auto');
        } else {
          expect(heredaPointerEventsNone(decorativo, acciones)).toBe(true);
        }
      }

      unmount();
    }
  });
});
