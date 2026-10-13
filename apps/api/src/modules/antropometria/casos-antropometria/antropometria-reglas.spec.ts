import { describe, it, expect } from 'vitest';
import { Rol } from '@guachafit/shared';
import {
  toIsoUtcString,
  esClaveFotoDelAlumno,
  contextoRlsDeCaller,
  resolverAliasPerimetros,
  construirPerimetrosDTO,
  construirPlieguesDTO,
} from './antropometria-reglas';

const ALUMNO = 'a3333333-3333-4333-8333-333333333333';
const OTRO = 'a2222222-2222-4222-8222-222222222222';
const CLAVE = '00000000-0000-4000-8000-0000000000ab';

describe('antropometria-reglas (pure, no I/O)', () => {
  describe('toIsoUtcString', () => {
    it('returns null for null/undefined', () => {
      expect(toIsoUtcString(null)).toBeNull();
      expect(toIsoUtcString(undefined)).toBeNull();
    });

    it('serializes Date and ISO strings identically', () => {
      const d = new Date('2026-09-06T10:00:00.000Z');
      expect(toIsoUtcString(d)).toBe('2026-09-06T10:00:00.000Z');
      expect(toIsoUtcString('2026-09-06T10:00:00.000Z')).toBe('2026-09-06T10:00:00.000Z');
    });
  });

  describe('esClaveFotoDelAlumno (RNF-001)', () => {
    it('accepts a key of the own vault with valid structure', () => {
      expect(esClaveFotoDelAlumno(`antropometria/${ALUMNO}/2026/${CLAVE}.webp`, ALUMNO)).toBe(true);
    });

    it('rejects keys of another student', () => {
      expect(esClaveFotoDelAlumno(`antropometria/${OTRO}/2026/${CLAVE}.webp`, ALUMNO)).toBe(false);
    });

    it('rejects keys of another module or arbitrary text', () => {
      expect(esClaveFotoDelAlumno(`comidas/${ALUMNO}/2026/${CLAVE}.webp`, ALUMNO)).toBe(false);
      expect(esClaveFotoDelAlumno('clave-arbitraria', ALUMNO)).toBe(false);
    });

    it('rejects disallowed extensions and malformed UUIDs', () => {
      expect(esClaveFotoDelAlumno(`antropometria/${ALUMNO}/2026/${CLAVE}.png`, ALUMNO)).toBe(false);
      expect(esClaveFotoDelAlumno(`antropometria/${ALUMNO}/2026/no-es-uuid.webp`, ALUMNO)).toBe(
        false
      );
    });

    it('is case-insensitive on the student prefix', () => {
      const clave = `antropometria/${ALUMNO}/2026/${CLAVE}.webp`;
      expect(esClaveFotoDelAlumno(clave, ALUMNO.toUpperCase())).toBe(true);
    });
  });

  describe('contextoRlsDeCaller (RNF-003/ADR-011)', () => {
    it('ALUMNO resolves to self-select', () => {
      expect(contextoRlsDeCaller({ id: ALUMNO, rol: Rol.ALUMNO })).toEqual({
        usuarioId: ALUMNO,
      });
    });

    it('ENTRENADOR resolves to the coach tenant (entrenadorId wins)', () => {
      expect(
        contextoRlsDeCaller({ id: 'coach', rol: Rol.ENTRENADOR, entrenadorId: 'coach-1' })
      ).toEqual({ entrenadorId: 'coach-1' });
      expect(contextoRlsDeCaller({ id: 'coach', rol: Rol.ENTRENADOR })).toEqual({
        entrenadorId: 'coach',
      });
    });

    it('SUPERADMIN resolves to explicit bypass', () => {
      expect(contextoRlsDeCaller({ id: 'root', rol: Rol.SUPERADMIN })).toEqual({
        isSuperadmin: true,
      });
    });
  });

  describe('resolverAliasPerimetros (RN-02)', () => {
    it('new payload takes precedence over legacy aliases', () => {
      expect(
        resolverAliasPerimetros({
          brazoRelajadoCm: '37.50',
          brazoCm: '36.00',
          musloMedioCm: '58.00',
          musloCm: '57.00',
        })
      ).toEqual({ brazoRelajadoCm: '37.50', musloMedioCm: '58.00' });
    });

    it('legacy aliases feed the new model when the new fields are absent', () => {
      expect(resolverAliasPerimetros({ brazoCm: '36.00', musloCm: '57.00' })).toEqual({
        brazoRelajadoCm: '36.00',
        musloMedioCm: '57.00',
      });
    });

    it('returns nulls when nothing is provided', () => {
      expect(resolverAliasPerimetros(undefined)).toEqual({
        brazoRelajadoCm: null,
        musloMedioCm: null,
      });
      expect(resolverAliasPerimetros({})).toEqual({ brazoRelajadoCm: null, musloMedioCm: null });
    });
  });

  describe('construirPerimetrosDTO / construirPlieguesDTO', () => {
    it('returns null blocks when there are no measurements (no invented zeros)', () => {
      expect(construirPerimetrosDTO({})).toBeNull();
      expect(construirPlieguesDTO({})).toBeNull();
    });

    it('mirrors legacy aliases into the new model on read', () => {
      const perimetros = construirPerimetrosDTO({ brazoCm: '36.00', musloCm: '57.00' });
      expect(perimetros?.brazoRelajadoCm).toBe('36.00');
      expect(perimetros?.brazoCm).toBe('36.00');
      expect(perimetros?.musloMedioCm).toBe('57.00');
      expect(perimetros?.musloCm).toBe('57.00');
    });

    it('new columns win over legacy ones on read', () => {
      const perimetros = construirPerimetrosDTO({
        brazoCm: '36.00',
        brazoRelajadoCm: '37.50',
      });
      expect(perimetros?.brazoRelajadoCm).toBe('37.50');
      expect(perimetros?.brazoCm).toBe('37.50');
    });

    it('builds the full skinfold block', () => {
      expect(
        construirPlieguesDTO({
          pliegueTricepsMm: '12.50',
          pliegueSubescapularMm: '14.00',
          pliegueSuprailiacoMm: '18.50',
          pliegueAbdominalMm: '22.00',
        })
      ).toEqual({
        tricepsMm: '12.50',
        subescapularMm: '14.00',
        suprailiacoMm: '18.50',
        abdominalMm: '22.00',
      });
    });
  });
});
