import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  esClaveDeFotoComidaDelAlumno,
  esClaveDeRecursoDelAlumno,
  esClaveDelAlumnoEnModulo,
  storageKeysDeRecursos,
  validarStorageKeysDeRecursos,
} from './claves-nutricion-reglas';

/** Prompt 106: unitarias de los guards de tenancy de claves de bóveda (RNF-001). */
describe('claves-nutricion-reglas', () => {
  const ALUMNO = 'a1111111-1111-4111-8111-111111111111';
  const OTRO = 'b2222222-2222-4222-8222-222222222222';

  it('acepta claves propias con estructura válida y rechaza ajenas', () => {
    const propia = `comidas/${ALUMNO}/2026-09-06/aaaaaaaa-1111-4111-8111-000000000001.webp`;
    const recursoPropio = `nutricion-recursos/${ALUMNO}/2026-09-06/aaaaaaaa-1111-4111-8111-000000000002.pdf`;
    expect(esClaveDelAlumnoEnModulo(propia, ALUMNO, 'comidas')).toBe(true);
    expect(esClaveDeFotoComidaDelAlumno(propia, ALUMNO)).toBe(true);
    expect(esClaveDeFotoComidaDelAlumno(propia, OTRO)).toBe(false);
    expect(esClaveDeRecursoDelAlumno(recursoPropio, ALUMNO)).toBe(true);
    expect(esClaveDeRecursoDelAlumno(recursoPropio, OTRO)).toBe(false);
  });

  it('rechaza claves de otro módulo aunque el alumno coincida', () => {
    const clave = `comidas/${ALUMNO}/2026-09-06/aaaaaaaa-1111-4111-8111-000000000001.webp`;
    expect(esClaveDeRecursoDelAlumno(clave, ALUMNO)).toBe(false);
  });

  it('extrae solo las claves no vacías (los enlaces externos no tienen)', () => {
    const clave = `nutricion-recursos/${ALUMNO}/2026-09-06/aaaaaaaa-1111-4111-8111-000000000002.pdf`;
    expect(
      storageKeysDeRecursos([
        { titulo: 'Guía', storageKey: clave },
        { titulo: 'Externo', url: 'https://ejemplo.test/guia' },
      ])
    ).toEqual([clave]);
  });

  it('el PUT rechaza con 400 una clave ajena y acepta recursos sin clave', () => {
    expect(() =>
      validarStorageKeysDeRecursos(
        [
          {
            titulo: 'Ajeno',
            storageKey: `nutricion-recursos/${OTRO}/2026-09-06/aaaaaaaa-1111-4111-8111-000000000002.pdf`,
          },
        ],
        ALUMNO
      )
    ).toThrow(BadRequestException);
    expect(() =>
      validarStorageKeysDeRecursos([{ titulo: 'Externo', url: 'https://ejemplo.test' }], ALUMNO)
    ).not.toThrow();
  });
});
