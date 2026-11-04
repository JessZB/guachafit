import { describe, it, expect, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { getTableName } from '@guachafit/database';
import {
  COACH_CODE_REGEX,
  CrearEntrenadorDTO,
  EstadoLicencia,
  EstadoUsuario,
  Rol,
} from '@guachafit/shared';
import { crearEntrenador } from '../../src/modules/auth/casos-auth/crear-entrenador';
import type { ContextoAuth } from '../../src/modules/auth/casos-auth/contexto-auth';
import {
  ALFABETO_COACH_CODE,
  LONGITUD_COACH_CODE,
  generarCoachCode,
  generarCoachCodeUnico,
} from '../../src/modules/auth/casos-auth/generar-coach-code';

const ALFABETO_COACH_CODE_CONTRATO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LONGITUD_COACH_CODE_CONTRATO = 8;

describe('D17 · Tarea 1: Generador de código de entrenador (generarCoachCode / generarCoachCodeUnico)', () => {
  it('exporta las constantes de alfabeto (32 caracteres sin O/0/I/1) y longitud 8', () => {
    expect(
      ALFABETO_COACH_CODE,
      'ALFABETO_COACH_CODE debe exportarse en generar-coach-code.ts'
    ).toBe(ALFABETO_COACH_CODE_CONTRATO);
    expect(
      LONGITUD_COACH_CODE,
      'LONGITUD_COACH_CODE debe exportarse en generar-coach-code.ts'
    ).toBe(LONGITUD_COACH_CODE_CONTRATO);
    expect(ALFABETO_COACH_CODE_CONTRATO).toHaveLength(32);
    expect(ALFABETO_COACH_CODE_CONTRATO).not.toMatch(/[O0I1]/);
  });

  it('generarCoachCode() produce un código de longitud 8 usando únicamente el alfabeto permitido', () => {
    expect(
      generarCoachCode,
      'generarCoachCode debe exportarse como función en generar-coach-code.ts'
    ).toBeDefined();

    const codigo = generarCoachCode();
    expect(typeof codigo).toBe('string');
    expect(codigo).toHaveLength(LONGITUD_COACH_CODE_CONTRATO);

    // Ningún carácter ambiguo permitido
    expect(codigo).not.toMatch(/[O0I1]/);

    // Todos los caracteres pertenecen al alfabeto
    for (const char of codigo) {
      expect(ALFABETO_COACH_CODE_CONTRATO).toContain(char);
    }
  });

  it('generarCoachCode() cumple COACH_CODE_REGEX y el patrón estricto del alfabeto', () => {
    expect(
      generarCoachCode,
      'generarCoachCode debe exportarse en generar-coach-code.ts'
    ).toBeDefined();

    const codigo = generarCoachCode();
    expect(codigo).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    if (COACH_CODE_REGEX) {
      expect(codigo).toMatch(COACH_CODE_REGEX);
    }
  });

  it('generarCoachCode(entero) con entero inyectado produce el código de forma determinista', () => {
    expect(
      generarCoachCode,
      'generarCoachCode debe exportarse en generar-coach-code.ts'
    ).toBeDefined();

    // 1) Si la función generadora devuelve siempre 0, debe retornar 'A' repetido 8 veces
    const enteroCero = vi.fn((_max: number) => 0);
    const codigoCero = generarCoachCode(enteroCero);
    expect(codigoCero).toBe('A'.repeat(8));
    expect(enteroCero).toHaveBeenCalledTimes(8);
    expect(enteroCero).toHaveBeenCalledWith(32);

    // 2) Si inyectamos una secuencia conocida de índices [0, 1, 2, 3, 4, 5, 6, 7]
    let indice = 0;
    const enteroSecuencial = vi.fn((_max: number) => indice++);
    const codigoSecuencial = generarCoachCode(enteroSecuencial);
    expect(codigoSecuencial).toBe(ALFABETO_COACH_CODE_CONTRATO.slice(0, 8));
  });

  it('generarCoachCodeUnico devuelve el primer código libre cuando no hay colisión', async () => {
    expect(
      generarCoachCodeUnico,
      'generarCoachCodeUnico debe exportarse en generar-coach-code.ts'
    ).toBeDefined();

    const mockExiste = vi.fn().mockResolvedValue(false);
    const mockGenerar = vi.fn().mockReturnValue('K7M9P2X4');

    const resultado = await generarCoachCodeUnico(mockExiste, mockGenerar, 5);

    expect(resultado).toBe('K7M9P2X4');
    expect(mockGenerar).toHaveBeenCalledTimes(1);
    expect(mockExiste).toHaveBeenCalledTimes(1);
    expect(mockExiste).toHaveBeenCalledWith('K7M9P2X4');
  });

  it('generarCoachCodeUnico reintenta cuando existe devuelve true y devuelve el primero libre', async () => {
    expect(
      generarCoachCodeUnico,
      'generarCoachCodeUnico debe exportarse en generar-coach-code.ts'
    ).toBeDefined();

    const mockExiste = vi
      .fn()
      .mockResolvedValueOnce(true) // colisión 1
      .mockResolvedValueOnce(true) // colisión 2
      .mockResolvedValueOnce(false); // libre

    const mockGenerar = vi
      .fn()
      .mockReturnValueOnce('CODEAAA1')
      .mockReturnValueOnce('CODEBBB2')
      .mockReturnValueOnce('CODECCC3');

    const resultado = await generarCoachCodeUnico(mockExiste, mockGenerar, 5);

    expect(resultado).toBe('CODECCC3');
    expect(mockGenerar).toHaveBeenCalledTimes(3);
    expect(mockExiste).toHaveBeenCalledTimes(3);
    expect(mockExiste).toHaveBeenNthCalledWith(1, 'CODEAAA1');
    expect(mockExiste).toHaveBeenNthCalledWith(2, 'CODEBBB2');
    expect(mockExiste).toHaveBeenNthCalledWith(3, 'CODECCC3');
  });

  it('generarCoachCodeUnico lanza Error("No se pudo generar un código de entrenador único.") tras maxIntentos', async () => {
    expect(
      generarCoachCodeUnico,
      'generarCoachCodeUnico debe exportarse en generar-coach-code.ts'
    ).toBeDefined();

    const mockExiste = vi.fn().mockResolvedValue(true);
    const mockGenerar = vi.fn().mockReturnValue('COLLIDED');

    await expect(
      generarCoachCodeUnico(mockExiste, mockGenerar, 5)
    ).rejects.toThrow('No se pudo generar un código de entrenador único.');

    expect(mockGenerar).toHaveBeenCalledTimes(5);
    expect(mockExiste).toHaveBeenCalledTimes(5);
  });
});

// -----------------------------------------------------------------------------
// D17 · Tarea 2: Alta de entrenador (crearEntrenador)
// -----------------------------------------------------------------------------
describe('D17 · Tarea 2: Alta de entrenador (crearEntrenador con coachCode opcional y autogenerado)', () => {
  const USUARIO_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
  const COACH_ID = 'bbbbbbbb-2222-4222-8222-222222222222';

  const baseDto = {
    nombres: 'Roberto',
    apellidos: 'Mendoza',
    email: 'roberto@guachafit.com',
    capacidadMaxima: 30,
    tasaCambioGlobal: '65.0000',
    telefonoContacto: '+584121234567',
  };

  function crearContextoAuth(opciones: {
    emailExistente?: boolean;
    coachCodeExistente?: string | null;
  } = {}) {
    let coachGuardado: any = null;

    const mockDb: any = {
      select: vi.fn(() => ({
        from: vi.fn((table: any) => {
          const tableName = getTableName(table);
          return {
            where: vi.fn((_condicion: any) => {
              if (tableName === 'usuarios') {
                return Promise.resolve(
                  opciones.emailExistente ? [{ id: 'existente', email: baseDto.email }] : []
                );
              }
              if (tableName === 'perfiles_entrenador') {
                if (opciones.coachCodeExistente) {
                  return Promise.resolve([{ id: 'existente', coachCode: opciones.coachCodeExistente }]);
                }
                return Promise.resolve([]);
              }
              return Promise.resolve([]);
            }),
          };
        }),
      })),
      insert: vi.fn((table: any) => ({
        values: vi.fn((vals: any) => {
          const tableName = getTableName(table);
          const record = {
            id: tableName === 'usuarios' ? USUARIO_ID : COACH_ID,
            ...vals,
            createdAtUtc: new Date(),
            updatedAtUtc: new Date(),
          };
          if (tableName === 'perfiles_entrenador') {
            coachGuardado = record;
          }
          return {
            returning: vi.fn().mockResolvedValue([record]),
          };
        }),
      })),
    };

    const ctx: ContextoAuth = {
      db: mockDb,
      cryptoService: {
        hashPassword: vi.fn(async (p: string) => `hash-${p}`),
        generateInvitationToken: vi.fn(() => ({
          rawToken: 'raw-invitation-token-1234567890',
          tokenHash: 'token-hash-123',
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        })),
      } as any,
      eventEmitter: {
        emitAsync: vi.fn().mockResolvedValue([{ encolado: true, correoEnCamino: true }]),
      } as any,
      logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as any,
    };

    return { ctx, mockDb, getCoachGuardado: () => coachGuardado };
  }

  it('sin coachCode en el DTO: genera un código que cumple el alfabeto, lo guarda en perfiles_entrenador y lo devuelve', async () => {
    const { ctx, getCoachGuardado } = crearContextoAuth();

    // DTO sin coachCode
    const dtoSinCoachCode = { ...baseDto } as CrearEntrenadorDTO;

    const resultado = await crearEntrenador(ctx, dtoSinCoachCode);

    // Debe devolver el código generado en la respuesta
    expect(resultado.coachCode).toBeDefined();
    expect(typeof resultado.coachCode).toBe('string');
    expect(resultado.coachCode).toHaveLength(8);
    expect(resultado.coachCode).not.toMatch(/[O0I1]/);
    expect(resultado.coachCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);

    // En la base de datos se debe haber persistido exactamente ese código
    const guardado = getCoachGuardado();
    expect(guardado).toBeDefined();
    expect(guardado.coachCode).toBe(resultado.coachCode);
  });

  it('con coachCode dado: se respeta normalizado y se guarda en perfiles_entrenador', async () => {
    const { ctx, getCoachGuardado } = crearContextoAuth();

    const dtoConCode: CrearEntrenadorDTO = {
      ...baseDto,
      coachCode: '  micoach1  ',
    };

    const resultado = await crearEntrenador(ctx, dtoConCode);

    expect(resultado.coachCode).toBe('MICOACH1');
    const guardado = getCoachGuardado();
    expect(guardado.coachCode).toBe('MICOACH1');
  });

  it('con coachCode duplicado: sigue lanzando 409 ConflictException', async () => {
    const { ctx } = crearContextoAuth({ coachCodeExistente: 'DUPLICADO' });

    const dtoDuplicado: CrearEntrenadorDTO = {
      ...baseDto,
      coachCode: 'DUPLICADO',
    };

    await expect(crearEntrenador(ctx, dtoDuplicado)).rejects.toThrow(ConflictException);
    await expect(crearEntrenador(ctx, dtoDuplicado)).rejects.toThrow(
      'Ese código de entrenador ya está en uso.'
    );
  });
});
