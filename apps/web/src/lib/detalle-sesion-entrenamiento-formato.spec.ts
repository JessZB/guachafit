/**
 * Módulo `detalle-sesion-entrenamiento` · spec de lógica pura del formato.
 *
 * Cubre `lib/detalle-sesion-entrenamiento-formato.ts` (extraído verbatim del
 * contenedor). Sin jsdom: funciones puras sin DOM.
 */
import { describe, expect, it } from 'vitest';
import {
  porcentajeLegible,
  pesoLegible,
} from './detalle-sesion-entrenamiento-formato';

describe('porcentajeLegible', () => {
  it('convierte el decimal del contrato a texto corto', () => {
    expect(porcentajeLegible('85.00')).toBe('85%');
  });

  it('redondea a dos decimales como máximo', () => {
    expect(porcentajeLegible('83.333')).toBe('83.33%');
  });

  it('declara el ausente como null, sin inventar un 0%', () => {
    expect(porcentajeLegible(null)).toBeNull();
    expect(porcentajeLegible(undefined)).toBeNull();
    expect(porcentajeLegible('')).toBeNull();
  });

  it('declara el no numérico como null', () => {
    expect(porcentajeLegible('no-numérico')).toBeNull();
  });
});

describe('pesoLegible', () => {
  it('formatea el peso del contrato con su unidad', () => {
    expect(pesoLegible('28.00')).toBe('28 kg');
  });

  it('el cero se declara como carga corporal', () => {
    expect(pesoLegible('0')).toBe('Corporal');
    expect(pesoLegible('0.00')).toBe('Corporal');
  });

  it('declara el ausente o no numérico como null', () => {
    expect(pesoLegible(null)).toBeNull();
    expect(pesoLegible(undefined)).toBeNull();
    expect(pesoLegible('')).toBeNull();
    expect(pesoLegible('sin-dato')).toBeNull();
  });
});
