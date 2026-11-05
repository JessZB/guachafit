// @vitest-environment happy-dom
/**
 * Prompt 74 (Ola 2, módulo `bloques-rutina-editor`) · specs de caracterización.
 *
 * Fijan el comportamiento ACTUAL de `BloquesRutinaEditor` en verde sobre el código
 * SIN TOCAR (ODD `modularizacion-vistas-web-ola2.md`, R5): describen lo que hay, no lo
 * que debería haber. La extracción deberá mantenerlos en verde con el mismo conteo.
 *
 * Red previa: ninguna real (`PlantillasPage.caracterizacion` sustituye este componente
 * por un stub, W50-2). Montaje sin `QueryClientProvider`: el archivo no usa TanStack
 * Query (R9). Consultas solo por rol, label o texto accesible.
 */
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { EjercicioCatalogoDetalleDTO } from '@guachafit/shared';
import { BloquesRutinaEditor } from './BloquesRutinaEditor';
import {
  crearBloqueEdicion,
  crearEjercicioEdicion,
  type BloqueEdicion,
} from '../../lib/rutina-bloques';

afterEach(() => {
  cleanup();
});

function ejercicioCatalogo(nombre: string, grupoMuscular: string, id: string): EjercicioCatalogoDetalleDTO {
  return { id, nombre, grupoMuscular, activo: true, createdAtUtc: '2026-01-01T00:00:00Z' };
}

const CATALOGO_BASE: EjercicioCatalogoDetalleDTO[] = [
  ejercicioCatalogo('Press Banca', 'Pecho', 'c-press'),
  ejercicioCatalogo('Remo Barra', 'Espalda', 'c-remo'),
  ejercicioCatalogo('Sentadilla', 'Piernas', 'c-sentadilla'),
];

function bloqueConEjercicio(nombreDia = ''): BloqueEdicion {
  const bloque = crearBloqueEdicion(1, 'd-caracterizacion-1');
  bloque.anotacion = nombreDia;
  bloque.ejercicios = [
    { ...crearEjercicioEdicion('Press Banca', 'c-press', 'e-caracterizacion-1'), series: 3 },
  ];
  return bloque;
}

interface HarnessOpciones {
  bloquesIniciales?: BloqueEdicion[];
  catalogo?: EjercicioCatalogoDetalleDTO[];
  catalogoError?: string | null;
  mostrarNotas?: boolean;
  minBloques?: number;
  onCrearEjercicio?: (datos: { nombre: string; grupoMuscular: string; patronMovimiento: string }) => Promise<EjercicioCatalogoDetalleDTO | null>;
}

function renderizarEditor(opciones: HarnessOpciones = {}) {
  const onCambiar = vi.fn();
  const onReintentarCatalogo = vi.fn();
  const onCrearEjercicio =
    opciones.onCrearEjercicio ??
    (async () => ejercicioCatalogo('Nuevo', 'Pecho', 'c-nuevo'));
  function Harness() {
    const [bloques, setBloques] = useState<BloqueEdicion[]>(
      opciones.bloquesIniciales ?? [bloqueConEjercicio()]
    );
    return (
      <BloquesRutinaEditor
        bloques={bloques}
        onCambiar={(nuevos) => {
          onCambiar(nuevos);
          setBloques(nuevos);
        }}
        catalogo={opciones.catalogo ?? CATALOGO_BASE}
        catalogoError={opciones.catalogoError ?? null}
        onReintentarCatalogo={onReintentarCatalogo}
        onCrearEjercicio={onCrearEjercicio}
        mostrarNotas={opciones.mostrarNotas ?? false}
        minBloques={opciones.minBloques ?? 1}
      />
    );
  }
  render(<Harness />);
  return { onCambiar, onReintentarCatalogo, onCrearEjercicio };
}

function ultimoBloques(onCambiar: ReturnType<typeof vi.fn>): BloqueEdicion[] {
  return onCambiar.mock.calls[onCambiar.mock.calls.length - 1][0] as BloqueEdicion[];
}

describe('BloquesRutinaEditor · caracterización: pestañas de días', () => {
  it('1: muestra la pestaña del día con su nombre de semana y el botón "Añadir día"', () => {
    renderizarEditor();
    expect(screen.getByRole('button', { name: 'Día 1 (Lunes)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Añadir día' })).toBeTruthy();
  });

  it('2: "Añadir día" agrega un bloque y lo activa; al llegar a 7 el botón desaparece', () => {
    const { onCambiar } = renderizarEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir día' }));
    expect(ultimoBloques(onCambiar)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Día 2 (Martes)' })).toBeTruthy();
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByRole('button', { name: 'Añadir día' }));
    expect(screen.queryByRole('button', { name: 'Añadir día' })).toBeNull();
  });

  it('3: cambiar de pestaña muestra los ejercicios de ese día', () => {
    const segundo = crearBloqueEdicion(2, 'd-caracterizacion-2');
    segundo.ejercicios = [{ ...crearEjercicioEdicion('Sentadilla', 'c-sentadilla', 'e-2'), series: 4 }];
    renderizarEditor({ bloquesIniciales: [bloqueConEjercicio(), segundo] });
    expect(screen.getByRole('heading', { name: 'Press Banca' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Día 2 (Martes)' }));
    expect(screen.getByRole('heading', { name: 'Sentadilla' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Press Banca' })).toBeNull();
  });
});

describe('BloquesRutinaEditor · caracterización: configuración del día', () => {
  it('4: "Número de día" emite el diaNumero elegido', () => {
    const { onCambiar } = renderizarEditor();
    fireEvent.change(screen.getByLabelText('Número de día'), { target: { value: '3' } });
    expect(ultimoBloques(onCambiar)[0].diaNumero).toBe(3);
  });

  it('5: "Día de la semana sugerido" emite el día elegido y renombra la pestaña', () => {
    const { onCambiar } = renderizarEditor();
    fireEvent.change(screen.getByLabelText('Día de la semana sugerido'), { target: { value: '3' } });
    expect(ultimoBloques(onCambiar)[0].diaSugerido).toBe(3);
    expect(screen.getByRole('button', { name: 'Día 1 (Miércoles)' })).toBeTruthy();
  });

  it('6: "Nombre corto del día (opcional)" actualiza la vista previa "Así lo verá tu alumno:"', () => {
    renderizarEditor();
    fireEvent.change(screen.getByLabelText('Nombre corto del día (opcional)'), {
      target: { value: 'Empuje' },
    });
    expect(screen.getByText('Día 1 (Lunes): Empuje')).toBeTruthy();
  });

  it('7: "Enfoque o indicaciones (opcional)" emite el enfoque escrito', () => {
    const { onCambiar } = renderizarEditor();
    fireEvent.change(screen.getByLabelText('Enfoque o indicaciones (opcional)'), {
      target: { value: 'Hipertrofia RPE 8' },
    });
    expect(ultimoBloques(onCambiar)[0].enfoque).toBe('Hipertrofia RPE 8');
  });

  it('8: "Eliminar este día" pide confirmación y solo borra con "Sí, eliminar"', () => {
    const segundo = crearBloqueEdicion(2, 'd-caracterizacion-2');
    const { onCambiar } = renderizarEditor({ bloquesIniciales: [bloqueConEjercicio(), segundo] });
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar este día' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('¿Eliminar este día?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Día 2 (Martes)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar este día' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }));
    expect(ultimoBloques(onCambiar)).toHaveLength(1);
  });

  it('9: con un solo día y minBloques 1 muestra el mínimo y no ofrece eliminar', () => {
    renderizarEditor();
    expect(screen.getByText('Mínimo 1 día')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Eliminar este día' })).toBeNull();
  });
});

describe('BloquesRutinaEditor · caracterización: ejercicios del día', () => {
  it('10: el día sin ejercicios muestra el vacío que invita a elegir de la lista', () => {
    const vacio = crearBloqueEdicion(1, 'd-vacio-1');
    renderizarEditor({ bloquesIniciales: [vacio] });
    expect(screen.getByText('Ejercicios de este día (0):')).toBeTruthy();
    expect(
      screen.getByText('Aún no has agregado ejercicios a este día. Elige uno de la lista de abajo.')
    ).toBeTruthy();
  });

  it('11: renombrar con "Editar el nombre de…" y "Confirmar nombre" emite el nombre nuevo', () => {
    const { onCambiar } = renderizarEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Editar el nombre de Press Banca' }));
    const input = screen.getByLabelText('Nombre del ejercicio 1');
    fireEvent.change(input, { target: { value: 'Press Inclinado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar nombre' }));
    expect(ultimoBloques(onCambiar)[0].ejercicios[0].nombre).toBe('Press Inclinado');
  });

  it('12: "Eliminar Press Banca" pide confirmación y borra solo con "Sí, eliminar"', () => {
    const { onCambiar } = renderizarEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Press Banca' }));
    expect(screen.getByText('¿Eliminar este ejercicio?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }));
    expect(ultimoBloques(onCambiar)[0].ejercicios).toHaveLength(0);
  });

  it('13: el stepper emite series +1/-1 y bloquea en los topes 1 y 20', () => {
    const { onCambiar } = renderizarEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar series' }));
    expect(ultimoBloques(onCambiar)[0].ejercicios[0].series).toBe(4);
    fireEvent.click(screen.getByRole('button', { name: 'Reducir series' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reducir series' }));
    expect(ultimoBloques(onCambiar)[0].ejercicios[0].series).toBe(2);
  });

  it('14: "Repeticiones" acepta rangos y no emite letras', () => {
    const { onCambiar } = renderizarEditor();
    const input = screen.getByLabelText('Repeticiones') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '8-10' } });
    expect(ultimoBloques(onCambiar)[0].ejercicios[0].reps).toBe('8-10');
    onCambiar.mockClear();
    fireEvent.change(screen.getByLabelText('Repeticiones'), { target: { value: 'abc' } });
    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('15: "Esfuerzo (1-10)" y "Descanso" emiten lo elegido', () => {
    const { onCambiar } = renderizarEditor();
    fireEvent.change(screen.getByLabelText('Esfuerzo (1-10)'), { target: { value: '9' } });
    expect(ultimoBloques(onCambiar)[0].ejercicios[0].rpe).toBe('9');
    fireEvent.change(screen.getByLabelText('Descanso'), { target: { value: '120' } });
    expect(ultimoBloques(onCambiar)[0].ejercicios[0].descansoSegundos).toBe(120);
  });

  it('16: las notas solo aparecen con mostrarNotas', () => {
    renderizarEditor();
    expect(screen.queryByLabelText('Notas técnicas para tu alumno (opcional)')).toBeNull();
    cleanup();
    const { onCambiar } = renderizarEditor({ mostrarNotas: true });
    const notas = screen.getByLabelText('Notas técnicas para tu alumno (opcional)');
    fireEvent.change(notas, { target: { value: 'Bajada en 3 segundos' } });
    expect(ultimoBloques(onCambiar)[0].ejercicios[0].notas).toBe('Bajada en 3 segundos');
  });
});

describe('BloquesRutinaEditor · caracterización: catálogo y creación', () => {
  it('17: el filtro por grupo y "Buscar ejercicio" reducen la lista visible', () => {
    renderizarEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Espalda' }));
    expect(screen.queryByRole('button', { name: 'Añadir Press Banca' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Añadir Remo Barra' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    fireEvent.change(screen.getByLabelText('Buscar ejercicio'), { target: { value: 'sentadilla' } });
    expect(screen.queryByRole('button', { name: 'Añadir Press Banca' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Añadir Sentadilla' })).toBeTruthy();
  });

  it('18: "Añadir Remo Barra" agrega el ejercicio con su id de catálogo', () => {
    const { onCambiar } = renderizarEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Añadir Remo Barra' }));
    const ejercicios = ultimoBloques(onCambiar)[0].ejercicios;
    expect(ejercicios).toHaveLength(2);
    expect(ejercicios[1].nombre).toBe('Remo Barra');
    expect(ejercicios[1].ejercicioId).toBe('c-remo');
  });

  it('19: catálogo vacío muestra "Sin resultados en el catálogo" y atajo para crear', () => {
    renderizarEditor({ catalogo: [] });
    expect(screen.getByText('Sin resultados en el catálogo')).toBeTruthy();
    expect(
      screen.getByText('Tu catálogo está vacío: crea tu primer ejercicio para asignarlo.')
    ).toBeTruthy();
    const botonesCrear = screen.getAllByRole('button', { name: 'Crear ejercicio nuevo' });
    fireEvent.click(botonesCrear[botonesCrear.length - 1]);
    expect(screen.getByLabelText('Nombre del ejercicio nuevo')).toBeTruthy();
  });

  it('20: con filtro sin coincidencias sugiere ajustar la búsqueda o crear lo que falta', () => {
    renderizarEditor();
    fireEvent.change(screen.getByLabelText('Buscar ejercicio'), { target: { value: 'inexistente' } });
    expect(screen.getByText('Sin resultados en el catálogo')).toBeTruthy();
    expect(
      screen.getByText(
        'Ajusta el grupo muscular o el término de búsqueda, o crea el ejercicio que falta.'
      )
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /Crear «inexistente»/ })).toBeTruthy();
  });

  it('21: catalogoError muestra el error con "Reintentar carga"', () => {
    const { onReintentarCatalogo } = renderizarEditor({
      catalogo: [],
      catalogoError: 'No se pudo cargar el catálogo de ejercicios. Revisa la conexión.',
    });
    expect(screen.getByText('No se pudo cargar el catálogo')).toBeTruthy();
    expect(
      screen.getByText('No se pudo cargar el catálogo de ejercicios. Revisa la conexión.')
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar carga' }));
    expect(onReintentarCatalogo).toHaveBeenCalledTimes(1);
  });

  it('22: crear con éxito agrega el ejercicio al día y cierra el formulario', async () => {
    const creado = ejercicioCatalogo('Hip Thrust', 'Piernas', 'c-hip');
    const onCrearEjercicio = vi.fn(async () => creado);
    const { onCambiar } = renderizarEditor({ onCrearEjercicio });
    fireEvent.click(screen.getByRole('button', { name: 'Crear ejercicio nuevo' }));
    fireEvent.change(screen.getByLabelText('Nombre del ejercicio nuevo'), {
      target: { value: 'Hip Thrust' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear y agregar a este día' }));
    expect(await screen.findByRole('heading', { name: 'Hip Thrust' })).toBeTruthy();
    expect(screen.queryByLabelText('Nombre del ejercicio nuevo')).toBeNull();
    expect(onCrearEjercicio).toHaveBeenCalledWith({
      nombre: 'Hip Thrust',
      grupoMuscular: 'Pecho',
      patronMovimiento: 'Empuje',
    });
    const ejercicios = ultimoBloques(onCambiar)[0].ejercicios;
    expect(ejercicios[ejercicios.length - 1].nombre).toBe('Hip Thrust');
    expect(ejercicios[ejercicios.length - 1].ejercicioId).toBe('c-hip');
  });

  it('23: crear con fallo muestra la alerta y no agrega nada', async () => {
    const { onCambiar } = renderizarEditor({ onCrearEjercicio: async () => null });
    const llamadasPrevias = onCambiar.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Crear ejercicio nuevo' }));
    fireEvent.change(screen.getByLabelText('Nombre del ejercicio nuevo'), {
      target: { value: 'Fallo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear y agregar a este día' }));
    expect(
      await screen.findByText(
        'No se pudo crear el ejercicio en el catálogo. Revisa la conexión e inténtalo de nuevo.'
      )
    ).toBeTruthy();
    expect(onCambiar.mock.calls.length).toBe(llamadasPrevias);
  });
});

describe('BloquesRutinaEditor · caracterización: pie de resumen', () => {
  it('24: el pie resume días, ejercicios y series prescritas', () => {
    renderizarEditor();
    expect(screen.getByText(/1 día · 1 ejercicio/)).toBeTruthy();
    expect(screen.getByText('3 series prescritas')).toBeTruthy();
  });

  it('25: al recibir bloques más cortos reajusta la pestaña activa sin romperse', () => {
    const segundo = crearBloqueEdicion(2, 'd-caracterizacion-2');
    const { rerender } = renderizarHarnessEstatico([bloqueConEjercicio(), segundo]);
    fireEvent.click(screen.getByRole('button', { name: 'Día 2 (Martes)' }));
    rerender([bloqueConEjercicio()]);
    expect(screen.getByRole('button', { name: 'Día 1 (Lunes)' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Press Banca' })).toBeTruthy();
  });
});

function renderizarHarnessEstatico(bloques: BloqueEdicion[]) {
  const onCambiar = vi.fn();
  function Estatico({ actuales }: { actuales: BloqueEdicion[] }) {
    return (
      <BloquesRutinaEditor
        bloques={actuales}
        onCambiar={onCambiar}
        catalogo={CATALOGO_BASE}
        mostrarNotas={false}
      />
    );
  }
  const resultado = render(<Estatico actuales={bloques} />);
  return {
    rerender: (siguientes: BloqueEdicion[]) => resultado.rerender(<Estatico actuales={siguientes} />),
  };
}
