/**
 * Reglas puras del contexto del actor del controlador de finanzas.
 */
import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Rol } from '@guachafit/shared';
import {
  resolverContextoTasaVigente,
  resolverEntrenadorId,
  resolverEntrenadorParaCalculo,
  resolverEntrenadorParaHistorial,
} from './contexto-actor';

const COACH = '11111111-1111-4111-8111-111111111111';
const ALUMNO = '22222222-2222-4222-8222-222222222222';

describe('contexto del actor del controlador de finanzas', () => {
  it('resuelve el entrenador del token y releva al sub si falta', () => {
    expect(resolverEntrenadorId({ entrenadorId: COACH, sub: ALUMNO })).toBe(COACH);
    expect(resolverEntrenadorId({ sub: COACH })).toBe(COACH);
    expect(resolverEntrenadorId({})).toBe('');
  });

  it('la tasa del alumno apunta a sí mismo con contexto propio', () => {
    const contexto = resolverContextoTasaVigente(
      { sub: ALUMNO, rol: Rol.ALUMNO, entrenadorId: COACH },
      'otro-que-se-ignora',
    );

    expect(contexto).toEqual({
      entrenadorId: COACH,
      objetivoClienteId: ALUMNO,
      contextoRls: { usuarioId: ALUMNO },
    });
  });

  it('la tasa del entrenador conserva el cliente pedido con contexto tenant', () => {
    const contexto = resolverContextoTasaVigente(
      { sub: COACH, rol: Rol.ENTRENADOR, entrenadorId: COACH },
      ALUMNO,
    );

    expect(contexto).toEqual({
      entrenadorId: COACH,
      objetivoClienteId: ALUMNO,
      contextoRls: { entrenadorId: COACH },
    });
  });

  it('la tasa falla con 400 si no hay entrenador', () => {
    const error = (() => {
      try {
        resolverContextoTasaVigente({ rol: Rol.ENTRENADOR });
        return null;
      } catch (e) {
        return e;
      }
    })();

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(
      'No se pudo determinar el contexto del entrenador para la tasa.',
    );
  });

  it('el cálculo usa el coach del alumno y el propio del entrenador', () => {
    expect(resolverEntrenadorParaCalculo({ rol: Rol.ALUMNO, entrenadorId: COACH })).toBe(COACH);
    expect(resolverEntrenadorParaCalculo({ rol: Rol.ENTRENADOR, sub: COACH })).toBe(COACH);
    expect(() => resolverEntrenadorParaCalculo({ rol: Rol.ENTRENADOR })).toThrow(BadRequestException);
  });

  it('el historial usa el coach del alumno y releva al sub del entrenador', () => {
    expect(resolverEntrenadorParaHistorial({ rol: Rol.ALUMNO, entrenadorId: COACH })).toBe(COACH);
    expect(resolverEntrenadorParaHistorial({ rol: Rol.ENTRENADOR, sub: COACH })).toBe(COACH);
  });
});
