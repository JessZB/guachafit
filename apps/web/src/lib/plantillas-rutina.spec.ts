import { describe, expect, it } from 'vitest';
import type { BloqueDiaRutinaDTO } from '@guachafit/shared';
import {
  aplicarOverridesPreview,
  claveOverrideEjercicio,
  construirAjustesPlantilla,
  construirBloquesParaPlantilla,
  firmaFormularioPlantilla,
  normalizarAjustePeso,
  resumirBloques,
  validarNombrePlantilla,
  validarOverrideEjercicio,
  type OverrideAjusteEjercicio,
} from './plantillas-rutina';
import { crearBloqueEdicion, crearEjercicioEdicion, type BloqueEdicion } from './rutina-bloques';

function bloqueEdicion(): BloqueEdicion {
  const bloque = crearBloqueEdicion(1);
  bloque.ejercicios = [
    { ...crearEjercicioEdicion('Press Plano', '11111111-1111-4111-8111-111111111111', 'e1'), peso: '60,5', notas: '  Control escapular  ' },
    { ...crearEjercicioEdicion('Remo con Barra', undefined, 'e2'), peso: '70' },
  ];
  return bloque;
}

function override(parcial: Partial<OverrideAjusteEjercicio> = {}): OverrideAjusteEjercicio {
  return {
    diaId: 'd1',
    ejercicioId: '11111111-1111-4111-8111-111111111111',
    nombreEjercicio: 'Press Plano',
    peso: '',
    series: '',
    reps: '',
    ...parcial,
  };
}

describe('resumirBloques / validarNombrePlantilla', () => {
  it('cuenta días, ejercicios y series totales', () => {
    const bloques: BloqueDiaRutinaDTO[] = [
      {
        diaId: 'd1',
        titulo: 'Día 1',
        ejercicios: [
          { nombre: 'A', series: 4, reps: '8', peso: '' },
          { nombre: 'B', series: 3, reps: '10', peso: '' },
        ],
      },
      { diaId: 'd2', titulo: 'Día 2', ejercicios: [{ nombre: 'C', series: 5, reps: '5', peso: '' }] },
    ];
    expect(resumirBloques(bloques)).toEqual({ totalDias: 2, totalEjercicios: 3, totalSeries: 12 });
  });

  it('exige nombre entre 3 y 120 caracteres', () => {
    expect(validarNombrePlantilla('  Pierna  ')).toBeNull();
    expect(validarNombrePlantilla('Ab')).toBeTruthy();
    expect(validarNombrePlantilla('x'.repeat(121))).toBeTruthy();
  });
});

describe('construirBloquesParaPlantilla (RF-017 Escenario 1)', () => {
  it('normaliza cargas (coma → punto), limpia notas y regenera el título', () => {
    const { bloques, errores } = construirBloquesParaPlantilla([bloqueEdicion()]);

    expect(errores).toEqual([]);
    expect(bloques[0].titulo).toBe('Día 1 (Lunes)');
    expect(bloques[0].ejercicios[0]).toMatchObject({
      nombre: 'Press Plano',
      peso: '60.5',
      notas: 'Control escapular',
      ejercicioId: '11111111-1111-4111-8111-111111111111',
    });
    expect(bloques[0].ejercicios[1]).toMatchObject({ nombre: 'Remo con Barra', peso: '70' });
    expect(bloques[0].ejercicios[1].ejercicioId).toBeUndefined();
  });

  it('reporta un día sin ejercicios y un RPE inválido', () => {
    const vacio = crearBloqueEdicion(1);
    const conRpeMalo = bloqueEdicion();
    conRpeMalo.ejercicios[0].rpe = '11';

    const { errores } = construirBloquesParaPlantilla([vacio, conRpeMalo]);
    expect(errores.some((e) => e.includes('al menos un ejercicio'))).toBe(true);
    expect(errores.some((e) => e.includes('Esfuerzo no válido'))).toBe(true);
  });

  it('bloquea un peso con formato inválido (tres decimales)', () => {
    const bloque = bloqueEdicion();
    bloque.ejercicios[0].peso = '60.555';
    const { errores } = construirBloquesParaPlantilla([bloque]);
    expect(errores.some((e) => e.includes('Carga inválida'))).toBe(true);
  });
});

describe('normalizarAjustePeso (contrato decimal de los ajustes)', () => {
  it('acepta vacío como "sin ajuste"', () => {
    expect(normalizarAjustePeso('')).toEqual({});
    expect(normalizarAjustePeso('   ')).toEqual({});
  });

  it('normaliza coma y rechaza texto o más de 2 decimales', () => {
    expect(normalizarAjustePeso('82,25')).toEqual({ valor: '82.25' });
    expect(normalizarAjustePeso('Corporal').error).toBeTruthy();
    expect(normalizarAjustePeso('60.555').error).toBeTruthy();
  });
});

describe('validarOverrideEjercicio / construirAjustesPlantilla (Escenario 2)', () => {
  it('ignora overrides sin cambios (no inventa ajustes vacíos)', () => {
    const { ajustes, errores } = construirAjustesPlantilla({
      [claveOverrideEjercicio('d1', 'uuid-1', 'Press')]: override(),
    });
    expect(ajustes).toEqual([]);
    expect(errores).toEqual([]);
  });

  it('mapea solo los campos modificados y conserva el ejercicioId', () => {
    const clave = claveOverrideEjercicio('d1', '11111111-1111-4111-8111-111111111111', 'Press Plano');
    const { ajustes, errores } = construirAjustesPlantilla({
      [clave]: override({ peso: '62,5', series: '5' }),
    });

    expect(errores).toEqual([]);
    expect(ajustes).toEqual([
      {
        diaId: 'd1',
        ejercicioId: '11111111-1111-4111-8111-111111111111',
        pesoPrescritoKg: '62.5',
        series: 5,
      },
    ]);
  });

  it('usa el nombre cuando el ejercicio no tiene id de catálogo', () => {
    const clave = claveOverrideEjercicio('d1', undefined, 'Remo con Barra');
    const { ajustes } = construirAjustesPlantilla({
      [clave]: override({ ejercicioId: undefined, nombreEjercicio: 'Remo con Barra', reps: '6-8' }),
    });

    expect(ajustes).toEqual([{ diaId: 'd1', nombre: 'Remo con Barra', reps: '6-8' }]);
  });

  it('bloquea series fuera de rango y peso inválido con error por clave', () => {
    const clave = claveOverrideEjercicio('d1', 'uuid-a', 'Press');
    const { ajustes, errores } = construirAjustesPlantilla({
      [clave]: override({ ejercicioId: 'uuid-a', peso: 'pesado', series: '0' }),
    });

    expect(ajustes).toEqual([]);
    expect(errores[0].clave).toBe(clave);
    expect(errores[0].mensaje).toContain('Press');
    expect(validarOverrideEjercicio(override({ series: '51' })).series).toBeTruthy();
  });
});

describe('aplicarOverridesPreview (previsualización de la asignación)', () => {
  const bloques: BloqueDiaRutinaDTO[] = [
    {
      diaId: 'd1',
      titulo: 'Día 1',
      ejercicios: [
        {
          nombre: 'Press Plano',
          ejercicioId: '11111111-1111-4111-8111-111111111111',
          series: 4,
          reps: '8-10',
          peso: '60',
        },
      ],
    },
  ];

  it('aplica los overrides válidos sobre la copia de preview', () => {
    const clave = claveOverrideEjercicio('d1', '11111111-1111-4111-8111-111111111111', 'Press Plano');
    const [bloque] = aplicarOverridesPreview(bloques, {
      [clave]: override({ peso: '65', series: '5', reps: '6-8' }),
    });

    expect(bloque.ejercicios[0]).toMatchObject({ peso: '65', series: 5, reps: '6-8' });
    // La plantilla original no se muta
    expect(bloques[0].ejercicios[0].peso).toBe('60');
  });

  it('ignora valores inválidos en la preview', () => {
    const clave = claveOverrideEjercicio('d1', '11111111-1111-4111-8111-111111111111', 'Press Plano');
    const [bloque] = aplicarOverridesPreview(bloques, {
      [clave]: override({ peso: 'pesado', series: '0' }),
    });

    expect(bloque.ejercicios[0]).toMatchObject({ peso: '60', series: 4 });
  });
});

describe('firmaFormularioPlantilla (aviso de cambios sin guardar)', () => {
  it('es igual para el mismo formulario y cambia al editar nombre, nivel o días', () => {
    const bloques = [crearBloqueEdicion(1)];
    const base = firmaFormularioPlantilla('Fuerza', 'PRINCIPIANTE', bloques);

    expect(firmaFormularioPlantilla('Fuerza', 'PRINCIPIANTE', [...bloques])).toBe(base);
    expect(firmaFormularioPlantilla('Fuerza 2', 'PRINCIPIANTE', bloques)).not.toBe(base);
    expect(firmaFormularioPlantilla('Fuerza', 'AVANZADO', bloques)).not.toBe(base);
    expect(
      firmaFormularioPlantilla('Fuerza', 'PRINCIPIANTE', [
        { ...bloques[0], ejercicios: [crearEjercicioEdicion('Sentadilla')] },
      ])
    ).not.toBe(base);
  });
});
