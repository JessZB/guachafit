import { describe, expect, it } from 'vitest';
import type { BloqueDiaRutinaDTO } from '@guachafit/shared';
import {
  actualizarConfiguracionBloque,
  crearBloqueEdicion,
  crearEjercicioEdicion,
  generarTituloBloque,
  parsearBloqueParaEdicion,
} from './rutina-bloques';

function bloqueBase(overrides: Partial<BloqueDiaRutinaDTO> = {}): BloqueDiaRutinaDTO {
  return {
    diaId: 'd1',
    titulo: 'Día 1 (Lunes): Empuje',
    ejercicios: [
      { id: 'e1', nombre: 'Press Plano', series: 4, reps: '8-10', peso: '', rpe: '8.0' },
    ],
    ...overrides,
  };
}

describe('generarTituloBloque (WU6b: título estructurado de plantillas y rutinas)', () => {
  it('compone día, nombre de semana y anotación cuando están presentes', () => {
    expect(generarTituloBloque(2, 3, 'Pierna & Isquios')).toBe(
      'Día 2 (Miércoles): Pierna & Isquios'
    );
  });

  it('omite el paréntesis del día y los dos puntos cuando no corresponde', () => {
    expect(generarTituloBloque(1)).toBe('Día 1');
    expect(generarTituloBloque(3, undefined, '   ')).toBe('Día 3');
    expect(generarTituloBloque(4, 4)).toBe('Día 4 (Jueves)');
  });
});

describe('parsearBloqueParaEdicion (WU6b: normalización del bloque persistido)', () => {
  it('detecta número, día sugerido y anotación desde el título estructurado', () => {
    const editado = parsearBloqueParaEdicion(
      bloqueBase({ titulo: 'Día 2 (Miércoles): Pierna & Isquios' }),
      0
    );

    expect(editado.diaId).toBe('d1');
    expect(editado.diaNumero).toBe(2);
    expect(editado.diaSugerido).toBe(3);
    expect(editado.anotacion).toBe('Pierna & Isquios');
    expect(editado.titulo).toBe('Día 2 (Miércoles): Pierna & Isquios');
  });

  it('prioriza el diaSugerido persistido sobre el texto del título', () => {
    const editado = parsearBloqueParaEdicion(
      bloqueBase({ titulo: 'Día 1 (Lunes)', diaSugerido: 5 }),
      0
    );

    expect(editado.diaSugerido).toBe(5);
    expect(editado.titulo).toBe('Día 1 (Viernes)');
  });

  it('tolera títulos legacy sin el patrón estructurado', () => {
    const editado = parsearBloqueParaEdicion(
      bloqueBase({ titulo: 'Torso pesado: banca y remo', diaSugerido: undefined }),
      2
    );

    expect(editado.diaNumero).toBe(3);
    expect(editado.anotacion).toBe('banca y remo');
    expect(editado.titulo).toBe('Día 3: banca y remo');
  });

  it('completa los defaults de ejercicios sin materializar cargas', () => {
    const editado = parsearBloqueParaEdicion(
      bloqueBase({
        ejercicios: [{ nombre: 'Remo', series: 3, reps: '10', peso: '' }],
      }),
      0
    );

    expect(editado.ejercicios[0]).toMatchObject({
      id: 'e-1-1',
      nombre: 'Remo',
      peso: '',
      series: 3,
      reps: '10',
    });
  });
});

describe('crearBloqueEdicion / crearEjercicioEdicion (defaults operativos)', () => {
  it('crea un bloque con día sugerido, título generado y diaId único', () => {
    const bloque = crearBloqueEdicion(3);
    expect(bloque).toMatchObject({
      diaNumero: 3,
      diaSugerido: 3,
      titulo: 'Día 3 (Miércoles)',
      ejercicios: [],
    });
    expect(bloque.diaId).toMatch(/^d3-/);
    // Dos bloques nuevos nunca comparten diaId (evita colisiones al borrar días intermedios)
    expect(crearBloqueEdicion(3).diaId).not.toBe(bloque.diaId);
  });

  it('crea un ejercicio con carga vacía (cualitativa) y RPE 8 por defecto', () => {
    const ejercicio = crearEjercicioEdicion('Hip Thrust', 'uuid-x', 'e-fijo');
    expect(ejercicio).toMatchObject({
      id: 'e-fijo',
      ejercicioId: 'uuid-x',
      nombre: 'Hip Thrust',
      series: 3,
      reps: '10-12',
      peso: '',
      rpe: '8.0',
      descansoSegundos: 90,
    });
  });
});

describe('actualizarConfiguracionBloque (WU6b: selectores estructurados)', () => {
  it('regenera el título al cambiar número o anotación', () => {
    const [actualizado] = actualizarConfiguracionBloque(
      [crearBloqueEdicion(1)],
      0,
      { diaNumero: 2, anotacion: 'Tracción' }
    );
    expect(actualizado.titulo).toBe('Día 2 (Lunes): Tracción');
  });

  it('trata diaSugerido null/0 como flexible (sin día fijo)', () => {
    const [actualizado] = actualizarConfiguracionBloque(
      [crearBloqueEdicion(1)],
      0,
      { diaSugerido: null }
    );
    expect(actualizado.diaSugerido).toBeUndefined();
    expect(actualizado.titulo).toBe('Día 1');
  });

  it('devuelve el mismo arreglo cuando el índice no existe', () => {
    const bloques = [crearBloqueEdicion(1)];
    expect(actualizarConfiguracionBloque(bloques, 5, { anotacion: 'x' })).toBe(bloques);
  });
});
