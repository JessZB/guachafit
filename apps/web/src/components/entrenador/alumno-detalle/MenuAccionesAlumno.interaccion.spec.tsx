// @vitest-environment jsdom
/**
 * 07 · Ficha del alumno (L7 · cabecera) · menú "Más acciones" (en verde).
 *
 * Contrato L7.1–L7.4: el menú vive en `MenuAccionesAlumno` (Radix DropdownMenu, ya
 * instalado y usado por `Header`/`Paginacion`) y la cabecera lo monta salvo con
 * `archivado`.
 *
 * Apertura en jsdom: no hay specs de `Paginacion` ni `Header` de los que copiar el
 * patrón (no existen en el repo) y `@testing-library/user-event` no está instalado,
 * así que se usa teclado (`ArrowDown`, que Radix abre sin el click nativo que
 * `Enter` dispararía en el botón) con `fireEvent`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EstadoAlumno } from '@guachafit/shared';
import { MenuAccionesAlumno } from './MenuAccionesAlumno';

afterEach(() => {
  cleanup();
});

function renderMenu(estado: EstadoAlumno) {
  const onCambiarEstado = vi.fn();
  const onArchivar = vi.fn();
  render(
    <MenuAccionesAlumno
      estado={estado}
      onCambiarEstado={onCambiarEstado}
      onArchivar={onArchivar}
    />,
  );
  return { onCambiarEstado, onArchivar };
}

/** Abre el menú Radix con teclado (ver cabecera del archivo). */
async function abrirMenu(): Promise<void> {
  const trigger = screen.getByRole('button', { name: 'Más acciones' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });
  await screen.findByRole('menu');
}

describe('MenuAccionesAlumno · L7.1 visibles', () => {
  it('muestra el trigger "Más acciones" (menu, min-h-11) y ningún botón de acción fuera del menú', () => {
    renderMenu(EstadoAlumno.ACTIVO);

    const trigger = screen.getByRole('button', { name: 'Más acciones' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.className).toContain('min-h-11');

    expect(screen.queryByRole('button', { name: 'Pausar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reactivar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Suspender por pago' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archivar' })).toBeNull();
  });
});

describe('MenuAccionesAlumno · L7.2 contenido del menú', () => {
  it('con estado ACTIVO ofrece Pausar, Suspender por pago y Archivar', async () => {
    renderMenu(EstadoAlumno.ACTIVO);
    await abrirMenu();

    expect(screen.getByRole('menuitem', { name: 'Pausar' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Suspender por pago' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Archivar' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Reactivar' })).toBeNull();
  });

  it('con estado INACTIVO_PAUSADO ofrece Reactivar, Suspender por pago y Archivar', async () => {
    renderMenu(EstadoAlumno.INACTIVO_PAUSADO);
    await abrirMenu();

    expect(screen.getByRole('menuitem', { name: 'Reactivar' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Suspender por pago' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Archivar' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Pausar' })).toBeNull();
  });

  it('con estado SUSPENDIDO_PAGO ofrece Reactivar y Archivar (sin Suspender por pago)', async () => {
    renderMenu(EstadoAlumno.SUSPENDIDO_PAGO);
    await abrirMenu();

    expect(screen.getByRole('menuitem', { name: 'Reactivar' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Archivar' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Suspender por pago' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Pausar' })).toBeNull();
  });

  it('V8 · con estado INACTIVO_PAUSADO el ítem "Reactivar" tiene title="Reactivar alumno"', async () => {
    renderMenu(EstadoAlumno.INACTIVO_PAUSADO);
    await abrirMenu();

    const reactivar = screen.getByRole('menuitem', { name: 'Reactivar' });
    expect(reactivar.getAttribute('title')).toBe('Reactivar alumno');
  });

  it('el contenido del menú respeta prefers-reduced-motion', async () => {
    renderMenu(EstadoAlumno.ACTIVO);
    await abrirMenu();

    expect(screen.getByRole('menu').className).toContain('motion-reduce:animate-none');
  });
});

describe('MenuAccionesAlumno · L7.3 acciones', () => {
  it('"Pausar" llama a onCambiarEstado(INACTIVO_PAUSADO) una vez y cierra el menú', async () => {
    const { onCambiarEstado } = renderMenu(EstadoAlumno.ACTIVO);
    await abrirMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Pausar' }));
    expect(onCambiarEstado).toHaveBeenCalledTimes(1);
    expect(onCambiarEstado).toHaveBeenCalledWith(EstadoAlumno.INACTIVO_PAUSADO);
    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'Pausar' })).toBeNull(),
    );
  });

  it('"Reactivar" llama a onCambiarEstado(ACTIVO) una vez y cierra el menú', async () => {
    const { onCambiarEstado } = renderMenu(EstadoAlumno.INACTIVO_PAUSADO);
    await abrirMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Reactivar' }));
    expect(onCambiarEstado).toHaveBeenCalledTimes(1);
    expect(onCambiarEstado).toHaveBeenCalledWith(EstadoAlumno.ACTIVO);
    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'Reactivar' })).toBeNull(),
    );
  });

  it('"Suspender por pago" llama a onCambiarEstado(SUSPENDIDO_PAGO) una vez y cierra el menú', async () => {
    const { onCambiarEstado } = renderMenu(EstadoAlumno.ACTIVO);
    await abrirMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Suspender por pago' }));
    expect(onCambiarEstado).toHaveBeenCalledTimes(1);
    expect(onCambiarEstado).toHaveBeenCalledWith(EstadoAlumno.SUSPENDIDO_PAGO);
    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'Suspender por pago' })).toBeNull(),
    );
  });

  it('"Archivar" llama a onArchivar una vez y cierra el menú', async () => {
    const { onArchivar } = renderMenu(EstadoAlumno.ACTIVO);
    await abrirMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Archivar' }));
    expect(onArchivar).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: 'Archivar' })).toBeNull(),
    );
  });
});
