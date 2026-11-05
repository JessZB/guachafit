// @vitest-environment happy-dom
/**
 * UX-12 · Componente ListaRiesgoDashboard (Contrato L1–L4).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import {
  ListaRiesgoDashboard,
  type FilaRiesgoDashboard,
} from './ListaRiesgoDashboard';

describe('ListaRiesgoDashboard (UX-12)', () => {
  afterEach(() => cleanup());
  it('L1 · Título y filas: con 2 filas muestra título, filas completas, y oculta texto vacío y Ver todos', () => {
    const filas: FilaRiesgoDashboard[] = [
      { id: '1', nombre: 'Carlos Mendoza', detalle: '5 días de atraso', valor: '$30.00 USD', to: '/coach/alumnos/1' },
      { id: '2', nombre: 'Mariana Pérez', detalle: '2 días de atraso', valor: '$50.00 USD', to: '/coach/alumnos/2' },
    ];

    render(
      <MemoryRouter>
        <ListaRiesgoDashboard
          titulo="Alumnos con Pagos Vencidos"
          icono={AlertTriangle}
          tono="warning"
          filas={filas}
          textoVacio="Sin pagos vencidos por ahora 🎉"
          rutaVerTodos="/coach/cartera?pestana=mora"
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /Alumnos con Pagos Vencidos/i })).toBeTruthy();
    expect(screen.getByText('Carlos Mendoza')).toBeTruthy();
    expect(screen.getByText('5 días de atraso')).toBeTruthy();
    expect(screen.getByText('$30.00 USD')).toBeTruthy();
    expect(screen.getByText('Mariana Pérez')).toBeTruthy();
    expect(screen.getByText('2 días de atraso')).toBeTruthy();
    expect(screen.getByText('$50.00 USD')).toBeTruthy();
    expect(screen.queryByText('Sin pagos vencidos por ahora 🎉')).toBeNull();
    expect(screen.queryByRole('link', { name: /Ver todos/i })).toBeNull();
  });

  it('L2 · Tope de 5: con 7 filas muestra las 5 primeras, oculta 6 y 7, y muestra enlace Ver todos (7)', () => {
    const filas: FilaRiesgoDashboard[] = Array.from({ length: 7 }, (_, i) => ({
      id: `fila-${i + 1}`,
      nombre: `Alumno ${i + 1}`,
      detalle: `${i + 1} días de atraso`,
      valor: `$${(i + 1) * 10}.00 USD`,
      to: `/coach/alumnos/fila-${i + 1}`,
    }));

    render(
      <MemoryRouter>
        <ListaRiesgoDashboard
          titulo="Alumnos con Pagos Vencidos"
          icono={AlertTriangle}
          tono="warning"
          filas={filas}
          textoVacio="Sin pagos vencidos por ahora 🎉"
          rutaVerTodos="/coach/cartera?pestana=mora"
        />
      </MemoryRouter>
    );

    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(`Alumno ${i}`)).toBeTruthy();
    }
    expect(screen.queryByText('Alumno 6')).toBeNull();
    expect(screen.queryByText('Alumno 7')).toBeNull();

    const enlace = screen.getByRole('link', { name: 'Ver todos (7)' });
    expect(enlace).toBeTruthy();
    expect(enlace.getAttribute('href')).toBe('/coach/cartera?pestana=mora');
  });

  it('L3 · Exactamente 5: con 5 filas no muestra enlace Ver todos', () => {
    const filas: FilaRiesgoDashboard[] = Array.from({ length: 5 }, (_, i) => ({
      id: `fila-${i + 1}`,
      nombre: `Alumno ${i + 1}`,
      detalle: `${i + 1} días de atraso`,
      valor: `$${(i + 1) * 10}.00 USD`,
      to: `/coach/alumnos/fila-${i + 1}`,
    }));

    render(
      <MemoryRouter>
        <ListaRiesgoDashboard
          titulo="Alumnos con Pagos Vencidos"
          icono={AlertTriangle}
          tono="warning"
          filas={filas}
          textoVacio="Sin pagos vencidos por ahora 🎉"
          rutaVerTodos="/coach/cartera?pestana=mora"
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link', { name: /Ver todos/i })).toBeNull();
  });

  it('L4 · Vacía: con 0 filas muestra textoVacio y conserva el encabezado', () => {
    render(
      <MemoryRouter>
        <ListaRiesgoDashboard
          titulo="Alumnos con Pagos Vencidos"
          icono={AlertTriangle}
          tono="warning"
          filas={[]}
          textoVacio="Sin pagos vencidos por ahora 🎉"
          rutaVerTodos="/coach/cartera?pestana=mora"
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Sin pagos vencidos por ahora 🎉')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Alumnos con Pagos Vencidos/i })).toBeTruthy();
  });

  it('L5 · Fila enlazada: con 2 filas cada fila es un enlace cuyo nombre accesible contiene el nombre, con su href y con min-h-11', () => {
    const filas: FilaRiesgoDashboard[] = [
      {
        id: '1',
        nombre: 'Carlos Mendoza',
        detalle: '5 días de atraso',
        valor: '$30.00 USD',
        to: '/coach/alumnos/a1',
      },
      {
        id: '2',
        nombre: 'Mariana Pérez',
        detalle: '2 días de atraso',
        valor: '$50.00 USD',
        to: '/coach/alumnos/a2',
      },
    ];

    render(
      <MemoryRouter>
        <ListaRiesgoDashboard
          titulo="Alumnos con Pagos Vencidos"
          icono={AlertTriangle}
          tono="warning"
          filas={filas}
          textoVacio="Sin pagos vencidos por ahora"
          rutaVerTodos="/coach/cartera?pestana=mora"
        />
      </MemoryRouter>
    );

    const enlace1 = screen.getByRole('link', { name: /Carlos Mendoza/i });
    expect(enlace1.getAttribute('href')).toBe('/coach/alumnos/a1');
    expect(enlace1.className).toContain('min-h-11');

    const enlace2 = screen.getByRole('link', { name: /Mariana Pérez/i });
    expect(enlace2.getAttribute('href')).toBe('/coach/alumnos/a2');
    expect(enlace2.className).toContain('min-h-11');
  });

  it('L6 · Sin emoji: con textoVacio sin emoji y 0 filas el contenedor no contiene el carácter 🎉', () => {
    const { container } = render(
      <MemoryRouter>
        <ListaRiesgoDashboard
          titulo="Alumnos con Pagos Vencidos"
          icono={AlertTriangle}
          tono="warning"
          filas={[]}
          textoVacio="Sin pagos vencidos por ahora"
          rutaVerTodos="/coach/cartera?pestana=mora"
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Sin pagos vencidos por ahora')).toBeTruthy();
    expect(container.textContent).not.toContain('🎉');
  });
});
