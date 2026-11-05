// @vitest-environment happy-dom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EstadoAlumno } from '@guachafit/shared';

import { MenuCuenta } from '../layout/MenuCuenta';
import { Paginacion } from '../common/Paginacion';
import { MenuAccionesAlumno } from '../entrenador/alumno-detalle/MenuAccionesAlumno';
import { MenuAccionesFilaCartera } from '../entrenador/tabla-cartera/MenuAccionesFilaCartera';
import { PanelCatalogo } from '../entrenador/bloques-rutina-editor/PanelCatalogo';

describe('Menús y desplegables con salida animada · Contrato D', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    // @ts-expect-error Limpieza de matchMedia
    delete window.matchMedia;
  });

  describe('1. MenuCuenta', () => {
    function renderMenuCuenta(propsParciales = {}) {
      const onCambiarTema = vi.fn();
      const onCerrarSesion = vi.fn();
      render(
        <MemoryRouter>
          <MenuCuenta
            email="entrenador@guachafit.com"
            rol="entrenador"
            tema="light"
            onCambiarTema={onCambiarTema}
            rutaAjustes="/coach/ajustes"
            onCerrarSesion={onCerrarSesion}
            {...propsParciales}
          />
        </MemoryRouter>
      );
      return { onCambiarTema, onCerrarSesion };
    }

    function abrirMenu(): HTMLElement {
      const trigger = screen.getByRole('button', { name: 'Cuenta' });
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });
      return screen.getByRole('menu');
    }

    it('(i) Cerrar por Escape con matchMedia matches:false permanece montado con data-saliendo="true" y desaparece tras 150 ms', () => {
      renderMenuCuenta();
      const menu = abrirMenu();
      expect(menu.getAttribute('data-saliendo')).toBeNull();

      fireEvent.keyDown(menu, { key: 'Escape', code: 'Escape' });

      // Sigue montado durante la animación con data-saliendo="true"
      expect(screen.queryByRole('menu')).not.toBeNull();
      expect(screen.getByRole('menu').getAttribute('data-saliendo')).toBe('true');

      act(() => {
        vi.advanceTimersByTime(149);
      });
      expect(screen.queryByRole('menu')).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('(ii) Elegir una opción ejecuta la acción UNA sola vez y el menú sale con animación sin duplicar la acción', () => {
      const { onCerrarSesion } = renderMenuCuenta();
      const menu = abrirMenu();

      const itemCerrar = screen.getByRole('menuitem', { name: 'Cerrar sesión' });
      fireEvent.click(itemCerrar);

      expect(onCerrarSesion).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('menu')).not.toBeNull();
      expect(menu.getAttribute('data-saliendo')).toBe('true');

      // Un segundo clic durante la salida no duplica la acción
      fireEvent.click(itemCerrar);
      expect(onCerrarSesion).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });

  describe('2. Paginacion (desplegable de tamaño de página)', () => {
    function renderPaginacion(propsParciales = {}) {
      const onCambiarTamano = vi.fn();
      const onCambiarPagina = vi.fn();
      render(
        <Paginacion
          pagina={1}
          tamano={10}
          total={100}
          onCambiarPagina={onCambiarPagina}
          onCambiarTamano={onCambiarTamano}
          {...propsParciales}
        />
      );
      return { onCambiarTamano, onCambiarPagina };
    }

    function abrirSelector(): HTMLElement {
      const trigger = screen.getByRole('button', { name: /filas por página: 10/i });
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });
      return screen.getByRole('menu');
    }

    it('(i) Cerrar por Escape permanece montado con data-saliendo="true" y desaparece tras 150 ms', () => {
      renderPaginacion();
      const menu = abrirSelector();
      expect(menu.getAttribute('data-saliendo')).toBeNull();

      fireEvent.keyDown(menu, { key: 'Escape', code: 'Escape' });

      expect(screen.queryByRole('menu')).not.toBeNull();
      expect(screen.getByRole('menu').getAttribute('data-saliendo')).toBe('true');

      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('(ii) Elegir un tamaño de página ejecuta la acción UNA vez y el menú sale con animación', () => {
      const { onCambiarTamano } = renderPaginacion();
      const menu = abrirSelector();

      const opcion25 = screen.getByRole('menuitemradio', { name: '25' });
      fireEvent.click(opcion25);

      expect(onCambiarTamano).toHaveBeenCalledTimes(1);
      expect(onCambiarTamano).toHaveBeenCalledWith(25);
      expect(screen.queryByRole('menu')).not.toBeNull();
      expect(menu.getAttribute('data-saliendo')).toBe('true');

      // Clic adicional mientras sale no duplica la acción
      fireEvent.click(opcion25);
      expect(onCambiarTamano).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });

  describe('3. MenuAccionesAlumno', () => {
    function renderMenuAcciones(propsParciales = {}) {
      const onCambiarEstado = vi.fn();
      const onArchivar = vi.fn();
      render(
        <MenuAccionesAlumno
          estado={EstadoAlumno.ACTIVO}
          onCambiarEstado={onCambiarEstado}
          onArchivar={onArchivar}
          {...propsParciales}
        />
      );
      return { onCambiarEstado, onArchivar };
    }

    function abrirMenu(): HTMLElement {
      const trigger = screen.getByRole('button', { name: 'Más acciones' });
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });
      return screen.getByRole('menu');
    }

    it('(i) Cerrar por Escape permanece montado con data-saliendo="true" y desaparece tras 150 ms', () => {
      renderMenuAcciones();
      const menu = abrirMenu();
      expect(menu.getAttribute('data-saliendo')).toBeNull();

      fireEvent.keyDown(menu, { key: 'Escape', code: 'Escape' });

      expect(screen.queryByRole('menu')).not.toBeNull();
      expect(screen.getByRole('menu').getAttribute('data-saliendo')).toBe('true');

      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('(ii) Elegir una opción ("Pausar") ejecuta la acción UNA vez y el menú sale con animación', () => {
      const { onCambiarEstado } = renderMenuAcciones();
      const menu = abrirMenu();

      const itemPausar = screen.getByRole('menuitem', { name: /pausar/i });
      fireEvent.click(itemPausar);

      expect(onCambiarEstado).toHaveBeenCalledTimes(1);
      expect(onCambiarEstado).toHaveBeenCalledWith(EstadoAlumno.INACTIVO_PAUSADO);
      expect(screen.queryByRole('menu')).not.toBeNull();
      expect(menu.getAttribute('data-saliendo')).toBe('true');

      fireEvent.click(itemPausar);
      expect(onCambiarEstado).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });

  describe('4. MenuAccionesFilaCartera', () => {
    function renderMenuFila(propsParciales = {}) {
      const onVerFicha = vi.fn();
      const onRecordatorio = vi.fn();
      render(
        <MenuAccionesFilaCartera
          nombre="Juan Pérez"
          puedeVerFicha={true}
          onVerFicha={onVerFicha}
          onRecordatorio={onRecordatorio}
          {...propsParciales}
        />
      );
      return { onVerFicha, onRecordatorio };
    }

    function abrirMenu(): HTMLElement {
      const trigger = screen.getByRole('button', { name: 'Más acciones para Juan Pérez' });
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' });
      return screen.getByRole('menu');
    }

    it('(i) Cerrar por Escape permanece montado con data-saliendo="true" y desaparece tras 150 ms', () => {
      renderMenuFila();
      const menu = abrirMenu();
      expect(menu.getAttribute('data-saliendo')).toBeNull();

      fireEvent.keyDown(menu, { key: 'Escape', code: 'Escape' });

      expect(screen.queryByRole('menu')).not.toBeNull();
      expect(screen.getByRole('menu').getAttribute('data-saliendo')).toBe('true');

      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('(ii) Elegir una opción ("Ver ficha") ejecuta la acción UNA vez y el menú sale con animación', () => {
      const { onVerFicha } = renderMenuFila();
      const menu = abrirMenu();

      const itemVerFicha = screen.getByRole('menuitem', { name: /ver ficha/i });
      fireEvent.click(itemVerFicha);

      expect(onVerFicha).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('menu')).not.toBeNull();
      expect(menu.getAttribute('data-saliendo')).toBe('true');

      fireEvent.click(itemVerFicha);
      expect(onVerFicha).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });

  describe('5. PanelCatalogo (desplegable de creación rápida)', () => {
    function renderizarPanel(propsParciales = {}) {
      const onCambiarCreacionAbierta = vi.fn();
      const onCrear = vi.fn((e: React.FormEvent) => e.preventDefault());
      render(
        <PanelCatalogo
          ejercicios={[]}
          hayFiltro={false}
          filtroTexto=""
          grupo="Todos"
          onCambiarGrupo={vi.fn()}
          onCambiarFiltro={vi.fn()}
          puedeCrear={true}
          creacion={{
            abierto: true,
            nombre: 'Hip Thrust',
            grupo: 'Piernas',
            patron: 'Bisagra de Cadera',
            enCurso: false,
            error: null,
          }}
          onCambiarCreacionAbierta={onCambiarCreacionAbierta}
          onCambiarCreacion={vi.fn()}
          onCrear={onCrear}
          onAgregarEjercicio={vi.fn()}
          {...propsParciales}
        />
      );
      const form = screen.getByLabelText('Nombre del ejercicio nuevo').closest('form') as HTMLElement;
      return { onCambiarCreacionAbierta, onCrear, form };
    }

    it('(i) Cerrar mediante "Cancelar" permanece montado con data-saliendo="true" y llama a onCambiarCreacionAbierta tras 150 ms', () => {
      const { onCambiarCreacionAbierta, form } = renderizarPanel();
      expect(form.getAttribute('data-saliendo')).toBeNull();

      const botonCancelar = screen.getByRole('button', { name: 'Cancelar' });
      fireEvent.click(botonCancelar);

      // Permanece montado con data-saliendo="true" antes de completar la animación
      expect(form.getAttribute('data-saliendo')).toBe('true');
      expect(onCambiarCreacionAbierta).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(149);
      });
      expect(onCambiarCreacionAbierta).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onCambiarCreacionAbierta).toHaveBeenCalledTimes(1);
      expect(onCambiarCreacionAbierta).toHaveBeenCalledWith(false);
    });

    it('(ii) Enviar ("Crear y agregar a este día") ejecuta la acción UNA vez y el panel sale con animación sin duplicar acción', () => {
      const { onCrear, onCambiarCreacionAbierta, form } = renderizarPanel();

      const botonCrear = screen.getByRole('button', { name: /crear y agregar a este día/i });
      fireEvent.click(botonCrear);

      expect(onCrear).toHaveBeenCalledTimes(1);
      expect(form.getAttribute('data-saliendo')).toBe('true');

      // Un segundo clic durante la salida no duplica el submit
      fireEvent.click(botonCrear);
      expect(onCrear).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(onCambiarCreacionAbierta).toHaveBeenCalledWith(false);
    });
  });
});
