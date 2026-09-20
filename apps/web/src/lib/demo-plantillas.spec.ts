import { describe, expect, it } from 'vitest';
import {
  CrearPlantillaRutinaSchema,
  NivelObjetivoPlantilla,
  UUID_REGEX,
} from '@guachafit/shared';
import {
  CATALOGO_DEMO,
  ENTRENADOR_ID_DEMO,
  PLANTILLAS_DEMO,
  crearPlantillaDemo,
  detallePlantillaDemo,
  generarIdDemo,
  plantillasDemoActivas,
  plantillasDemoResumen,
  resumirPlantillaDemo,
} from './demo-plantillas';

describe('demo-plantillas (WU14: fixtures demo del banco RF-017)', () => {
  it('todo ejercicio de las plantillas demo existe en el catálogo demo (picker coherente)', () => {
    const idsCatalogo = new Set(CATALOGO_DEMO.map((ejercicio) => ejercicio.id));
    for (const plantilla of PLANTILLAS_DEMO) {
      for (const bloque of plantilla.bloques) {
        for (const ejercicio of bloque.ejercicios) {
          expect(ejercicio.ejercicioId, `${plantilla.nombre} · ${ejercicio.nombre}`).toBeTruthy();
          expect(idsCatalogo.has(ejercicio.ejercicioId!), ejercicio.nombre).toBe(true);
        }
      }
    }
  });

  it('los ids del catálogo demo son UUID válidos (contrato de los ajustes de asignación)', () => {
    for (const ejercicio of CATALOGO_DEMO) {
      expect(UUID_REGEX.test(ejercicio.id), ejercicio.nombre).toBe(true);
    }
  });

  it('cada plantilla demo valida contra CrearPlantillaRutinaSchema (contrato real)', () => {
    for (const plantilla of PLANTILLAS_DEMO) {
      const resultado = CrearPlantillaRutinaSchema.safeParse({
        nombre: plantilla.nombre,
        nivelObjetivo: plantilla.nivelObjetivo,
        bloques: plantilla.bloques,
      });
      expect(
        resultado.success,
        `${plantilla.nombre}: ${resultado.success ? '' : JSON.stringify(resultado.error.issues)}`
      ).toBe(true);
    }
  });

  it('cada plantilla demo tiene al menos un día con al menos un ejercicio', () => {
    for (const plantilla of PLANTILLAS_DEMO) {
      expect(plantilla.bloques.length).toBeGreaterThan(0);
      expect(plantilla.bloques.length).toBeLessThanOrEqual(7);
      for (const bloque of plantilla.bloques) {
        expect(bloque.ejercicios.length).toBeGreaterThan(0);
      }
    }
  });

  it('el resumen deriva los conteos del detalle sin duplicarlos', () => {
    const plantilla = PLANTILLAS_DEMO[0];
    const resumen = resumirPlantillaDemo(plantilla);
    expect(resumen.totalDias).toBe(plantilla.bloques.length);
    expect(resumen.totalEjercicios).toBe(
      plantilla.bloques.reduce((total, bloque) => total + bloque.ejercicios.length, 0)
    );
    expect(resumen.activa).toBe(plantilla.activa);
    expect(resumen.nombre).toBe(plantilla.nombre);
  });

  it('los resúmenes demo no repiten ids y coinciden con el detalle', () => {
    const resumenes = plantillasDemoResumen();
    expect(resumenes).toHaveLength(PLANTILLAS_DEMO.length);
    expect(new Set(resumenes.map((p) => p.id)).size).toBe(resumenes.length);
  });

  it('plantillasDemoActivas solo devuelve plantillas activas', () => {
    const activas = plantillasDemoActivas();
    expect(activas.length).toBeGreaterThan(0);
    expect(activas.every((p) => p.activa)).toBe(true);
    expect(activas.length).toBe(PLANTILLAS_DEMO.filter((p) => p.activa).length);
  });

  it('detallePlantillaDemo encuentra por id y devuelve undefined si no existe', () => {
    const primera = PLANTILLAS_DEMO[0];
    expect(detallePlantillaDemo(primera.id)?.nombre).toBe(primera.nombre);
    expect(detallePlantillaDemo('id-inexistente')).toBeUndefined();
  });

  it('crearPlantillaDemo respeta id, fechas y activa al editar (contrato PlantillaRutinaDTO)', () => {
    const bloques = PLANTILLAS_DEMO[0].bloques;
    const editada = crearPlantillaDemo({
      id: '22222222-2222-4222-8222-222222222201',
      nombre: 'Editada',
      nivelObjetivo: NivelObjetivoPlantilla.PRINCIPIANTE,
      bloques,
      activa: false,
      createdAtUtc: '2026-01-01T00:00:00.000Z',
      ahoraUtc: '2026-09-20T12:00:00.000Z',
    });
    expect(editada.id).toBe('22222222-2222-4222-8222-222222222201');
    expect(editada.createdAtUtc).toBe('2026-01-01T00:00:00.000Z');
    expect(editada.updatedAtUtc).toBe('2026-09-20T12:00:00.000Z');
    expect(editada.activa).toBe(false);
    expect(editada.entrenadorId).toBe(ENTRENADOR_ID_DEMO);
  });

  it('crearPlantillaDemo genera id nuevo y activa por defecto al crear', () => {
    const nueva = crearPlantillaDemo({
      nombre: 'Nueva Plantilla Demo',
      nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
      bloques: PLANTILLAS_DEMO[1].bloques,
    });
    expect(UUID_REGEX.test(nueva.id)).toBe(true);
    expect(nueva.activa).toBe(true);
    expect(resumirPlantillaDemo(nueva).totalDias).toBe(PLANTILLAS_DEMO[1].bloques.length);
  });

  it('generarIdDemo produce UUIDs válidos y únicos', () => {
    const primero = generarIdDemo();
    const segundo = generarIdDemo();
    expect(UUID_REGEX.test(primero)).toBe(true);
    expect(primero).not.toBe(segundo);
  });
});
