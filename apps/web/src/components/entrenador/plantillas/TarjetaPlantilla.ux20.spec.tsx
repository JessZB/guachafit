// @vitest-environment jsdom
/**
 * UX-20 · Contratos C4 (CFG-24) y C5 (CFG-25): TarjetaPlantilla.
 *
 * Contrato C4 (CFG-24):
 * - Cuando puedeAsignar es false y tituloAsignarBloqueado tiene texto, ese texto
 *   se muestra VISIBLE en el DOM bajo el botón (no solo en title) y el botón
 *   «Asignar a alumnos» tiene aria-describedby apuntando al id del elemento con ese texto.
 * - Con puedeAsignar true, ese texto no existe y el botón no tiene aria-describedby.
 * - El botón sigue deshabilitado (.disabled === true) cuando puedeAsignar es false.
 *
 * Contrato C5 (CFG-25):
 * - En TarjetaPlantilla, todo svg dentro de los botones (Editar, Desactivar, Reactivar, Asignar, confirmación inline)
 *   tiene aria-hidden="true".
 * - Un test por estado (activa; desactivada; confirmación inline de desactivar).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TarjetaPlantilla, type TarjetaPlantillaProps } from './TarjetaPlantilla';
import { NivelObjetivoPlantilla, type PlantillaRutinaResumenDTO } from '@guachafit/shared';

const PLANTILLA_ACTIVA: PlantillaRutinaResumenDTO = {
  id: 'plantilla-activa-1',
  entrenadorId: 'e-1',
  nombre: 'Hipertrofia Pierna',
  nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
  totalDias: 2,
  totalEjercicios: 8,
  activa: true,
  createdAtUtc: '2026-10-01T10:00:00.000Z',
  updatedAtUtc: '2026-10-15T10:00:00.000Z',
};

const PLANTILLA_DESACTIVADA: PlantillaRutinaResumenDTO = {
  ...PLANTILLA_ACTIVA,
  id: 'plantilla-desactivada-1',
  nombre: 'Hipertrofia Pierna Desactivada',
  activa: false,
};

function renderTarjeta(propsParciales: Partial<TarjetaPlantillaProps> = {}) {
  const propsPorDefecto: TarjetaPlantillaProps = {
    plantilla: PLANTILLA_ACTIVA,
    confirmandoDesactivar: false,
    accionEnCurso: false,
    cargandoDetalle: false,
    puedeAsignar: true,
    tituloAsignarBloqueado: undefined,
    onAsignar: vi.fn(),
    onEditar: vi.fn(),
    onPedirDesactivar: vi.fn(),
    onConfirmarDesactivar: vi.fn(),
    onCancelarDesactivar: vi.fn(),
    onReactivar: vi.fn(),
    ...propsParciales,
  };

  return render(<TarjetaPlantilla {...propsPorDefecto} />);
}

afterEach(() => {
  cleanup();
});

describe('TarjetaPlantilla · contratos C4 y C5', () => {
  describe('C4 · Asignar sin conexión (CFG-24)', () => {
    it('C4.1 · con puedeAsignar=false y tituloAsignarBloqueado: texto visible en el DOM bajo el botón y aria-describedby enlazado', () => {
      renderTarjeta({
        puedeAsignar: false,
        tituloAsignarBloqueado: 'Necesitas internet para asignar',
      });

      const boton = screen.getByRole('button', { name: /Asignar a alumnos/ }) as HTMLButtonElement;
      expect(boton.disabled).toBe(true);

      // El texto se muestra VISIBLE en el DOM bajo el botón
      const textoMotivo = screen.getByText('Necesitas internet para asignar');
      expect(textoMotivo).toBeTruthy();
      expect(textoMotivo.id).toBeTruthy();

      // aria-describedby apunta al id del elemento con ese texto
      expect(boton.getAttribute('aria-describedby')).toBe(textoMotivo.id);
    });

    it('C4.2 · con puedeAsignar=true: el texto no existe y el botón no tiene aria-describedby', () => {
      renderTarjeta({
        puedeAsignar: true,
        tituloAsignarBloqueado: undefined,
      });

      const boton = screen.getByRole('button', { name: /Asignar a alumnos/ }) as HTMLButtonElement;
      expect(boton.disabled).toBe(false);
      expect(screen.queryByText('Necesitas internet para asignar')).toBeNull();
      expect(boton.getAttribute('aria-describedby')).toBeNull();
    });
  });

  describe('C5 · Iconos aria-hidden (CFG-25)', () => {
    it('C5.1 · estado activa: todo svg dentro de los botones (Asignar, Editar, Desactivar) tiene aria-hidden="true"', () => {
      const { container } = renderTarjeta({
        plantilla: PLANTILLA_ACTIVA,
        confirmandoDesactivar: false,
      });

      const botones = container.querySelectorAll('button');
      expect(botones.length).toBeGreaterThan(0);

      for (const boton of botones) {
        const svgs = boton.querySelectorAll('svg');
        for (const svg of svgs) {
          expect(svg.getAttribute('aria-hidden')).toBe('true');
        }
      }
    });

    it('C5.2 · estado desactivada: todo svg dentro de los botones (Editar, Reactivar) tiene aria-hidden="true"', () => {
      const { container } = renderTarjeta({
        plantilla: PLANTILLA_DESACTIVADA,
        confirmandoDesactivar: false,
      });

      const botones = container.querySelectorAll('button');
      expect(botones.length).toBeGreaterThan(0);

      for (const boton of botones) {
        const svgs = boton.querySelectorAll('svg');
        for (const svg of svgs) {
          expect(svg.getAttribute('aria-hidden')).toBe('true');
        }
      }
    });

    it('C5.3 · estado confirmación inline de desactivar: todo svg dentro de los botones tiene aria-hidden="true"', () => {
      const { container } = renderTarjeta({
        plantilla: PLANTILLA_ACTIVA,
        confirmandoDesactivar: true,
      });

      const botones = container.querySelectorAll('button');
      expect(botones.length).toBeGreaterThan(0);

      for (const boton of botones) {
        const svgs = boton.querySelectorAll('svg');
        for (const svg of svgs) {
          expect(svg.getAttribute('aria-hidden')).toBe('true');
        }
      }
    });
  });
});
