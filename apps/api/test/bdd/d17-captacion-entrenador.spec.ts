import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, Logger } from '@nestjs/common';
import { getTableName } from '@guachafit/database';
import {
  ActualizarCaptacionDTO,
  CaptacionEntrenadorDTO,
  CaptacionEntrenadorResultadoDTO,
  EstadoLicencia,
  PerfilEntrenadorDTO,
} from '@guachafit/shared';
import { EntrenadorService } from '../../src/modules/entrenador/entrenador.service';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';

describe('D17 · Tarea 3: Captación del entrenador (rotar, actualizar, obtener y conteo de registros)', () => {
  const COACH_USUARIO_ID = '11111111-1111-4111-8111-111111111111';
  const COACH_PERFIL_ID = '22222222-2222-4222-8222-222222222222';
  const CODIGO_INICIAL = 'COACHINI';

  let coachEnBd: any;
  let alumnosEnBd: any[];
  let actualizacionesCoach: any[];
  let mockDb: any;
  let mockWithTenant: any;
  let entrenadorService: EntrenadorService;
  let alumnosService: AlumnosService;

  beforeEach(() => {
    actualizacionesCoach = [];

    coachEnBd = {
      id: COACH_PERFIL_ID,
      usuarioId: COACH_USUARIO_ID,
      nombres: 'Carlos',
      apellidos: 'Entrenador',
      nombreComercial: 'Carlos Fitness',
      coachCode: CODIGO_INICIAL,
      capacidadMaxima: 50,
      tasaCambioGlobal: '65.0000',
      telefonoContacto: '+584121234567',
      estadoLicencia: EstadoLicencia.ACTIVA,
      captacionActiva: true,
      enlaceRotadoEnUtc: null,
      createdAtUtc: new Date('2026-01-01T00:00:00Z'),
      updatedAtUtc: new Date('2026-01-01T00:00:00Z'),
    };

    alumnosEnBd = [];

    mockDb = {
      select: vi.fn((campos?: any) => ({
        from: vi.fn((table: any) => {
          const tableName = getTableName(table);
          const queryObj: any = {
            innerJoin: vi.fn(() => queryObj),
            where: vi.fn((_cond: any) => {
              if (tableName === 'perfiles_entrenador') {
                return Promise.resolve([
                  {
                    ...coachEnBd,
                    activo: true,
                  },
                ]);
              }
              if (tableName === 'perfiles_alumno') {
                return Promise.resolve(alumnosEnBd);
              }
              return Promise.resolve([]);
            }),
          };
          return queryObj;
        }),
      })),
      update: vi.fn((table: any) => ({
        set: vi.fn((valores: any) => ({
          where: vi.fn((_cond: any) => {
            const tableName = getTableName(table);
            if (tableName === 'perfiles_entrenador') {
              actualizacionesCoach.push(valores);
              Object.assign(coachEnBd, valores);
              return {
                returning: vi.fn().mockResolvedValue([{ ...coachEnBd }]),
                then: (resolve: any) => resolve([{ ...coachEnBd }]),
              };
            }
            return {
              returning: vi.fn().mockResolvedValue([]),
              then: (resolve: any) => resolve([]),
            };
          }),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
    };

    mockWithTenant = vi.fn(async (_context: { entrenadorId: string }, fn: any) => fn(mockDb));

    entrenadorService = new EntrenadorService(mockDb, mockWithTenant);
    alumnosService = new AlumnosService(
      mockDb,
      {
        hashPassword: vi.fn(),
        generateInvitationToken: vi.fn(() => ({
          rawToken: 'raw',
          tokenHash: 'hash',
          expiresAt: new Date(),
        })),
      } as any
    );
  });

  describe('3.1 rotarEnlaceCaptacion', () => {
    it('cambia el coach_code por uno distinto y válido, fija enlaceRotadoEnUtc y no altera captacionActiva', async () => {
      coachEnBd.captacionActiva = true;
      coachEnBd.enlaceRotadoEnUtc = null;

      expect(
        entrenadorService.rotarEnlaceCaptacion,
        'rotarEnlaceCaptacion debe existir en EntrenadorService'
      ).toBeDefined();

      const resultado: CaptacionEntrenadorResultadoDTO = await entrenadorService.rotarEnlaceCaptacion(
        COACH_USUARIO_ID
      );

      // Código nuevo generado válido
      expect(resultado.coachCode).toBeDefined();
      expect(resultado.coachCode).not.toBe(CODIGO_INICIAL);
      expect(resultado.coachCode).toHaveLength(8);
      expect(resultado.coachCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);

      // Preserva captacionActiva
      expect(resultado.captacionActiva).toBe(true);
      expect(coachEnBd.captacionActiva).toBe(true);

      // Fija enlaceRotadoEnUtc con fecha reciente
      expect(resultado.enlaceRotadoEnUtc).not.toBeNull();
      expect(coachEnBd.enlaceRotadoEnUtc).not.toBeNull();

      // Resultado de la mutación
      expect(resultado.cambioAplicado).toBe(true);
      expect(resultado.mensaje).toBe('Tu enlace anterior dejó de funcionar. Comparte el nuevo.');
    });

    it('la rotación preserva captacionActiva en false cuando ya estaba pausada', async () => {
      coachEnBd.captacionActiva = false;

      expect(
        entrenadorService.rotarEnlaceCaptacion,
        'rotarEnlaceCaptacion debe existir en EntrenadorService'
      ).toBeDefined();

      const resultado = await entrenadorService.rotarEnlaceCaptacion(COACH_USUARIO_ID);

      expect(resultado.captacionActiva).toBe(false);
      expect(coachEnBd.captacionActiva).toBe(false);
    });

    it('el código anterior deja de resolver en el acto (resolverCoachPublico lanza NotFoundException)', async () => {
      expect(
        entrenadorService.rotarEnlaceCaptacion,
        'rotarEnlaceCaptacion debe existir en EntrenadorService'
      ).toBeDefined();

      // Tras rotar, la DB tiene el nuevo código
      await entrenadorService.rotarEnlaceCaptacion(COACH_USUARIO_ID);

      // Si alguien intenta resolver el código anterior CODIGO_INICIAL
      // debe lanzar NotFoundException inmediatamente sin periodo de gracia
      mockDb.select.mockImplementation(() => ({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve([]), // no encuentra CODIGO_INICIAL
          }),
        }),
      }));

      await expect(alumnosService.resolverCoachPublico(CODIGO_INICIAL)).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('el registro de log no contiene ningún código de entrenador', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      expect(
        entrenadorService.rotarEnlaceCaptacion,
        'rotarEnlaceCaptacion debe existir en EntrenadorService'
      ).toBeDefined();

      const resultado = await entrenadorService.rotarEnlaceCaptacion(COACH_USUARIO_ID);

      const llamadas = logSpy.mock.calls.map((c) => String(c[0]));
      const logRotacion = llamadas.find((l) => l.includes('rotó su enlace'));

      expect(logRotacion).toBeDefined();
      expect(logRotacion).toContain(`Captación: el entrenador ${COACH_USUARIO_ID} rotó su enlace.`);
      expect(logRotacion).not.toContain(CODIGO_INICIAL);
      expect(logRotacion).not.toContain(resultado.coachCode);
    });
  });

  describe('3.2 actualizarCaptacion (idempotencia y mensajes exactos)', () => {
    it('pausar captación cuando estaba activa: cambioAplicado=true y mensaje correspondiente', async () => {
      coachEnBd.captacionActiva = true;

      expect(
        entrenadorService.actualizarCaptacion,
        'actualizarCaptacion debe existir en EntrenadorService'
      ).toBeDefined();

      const resultado: CaptacionEntrenadorResultadoDTO = await entrenadorService.actualizarCaptacion(
        COACH_USUARIO_ID,
        { activa: false }
      );

      expect(resultado.cambioAplicado).toBe(true);
      expect(resultado.captacionActiva).toBe(false);
      expect(resultado.mensaje).toBe('Captación pausada. Tu enlace no admite nuevos registros.');
      expect(actualizacionesCoach.length).toBeGreaterThan(0);
      expect(mockWithTenant).toHaveBeenCalledWith(
        { entrenadorId: COACH_USUARIO_ID },
        expect.any(Function)
      );
    });

    it('pausar captación cuando YA estaba pausada: idempotente, cambioAplicado=false y no escribe en DB', async () => {
      coachEnBd.captacionActiva = false;
      actualizacionesCoach = [];

      expect(
        entrenadorService.actualizarCaptacion,
        'actualizarCaptacion debe existir en EntrenadorService'
      ).toBeDefined();

      const resultado = await entrenadorService.actualizarCaptacion(COACH_USUARIO_ID, {
        activa: false,
      });

      expect(resultado.cambioAplicado).toBe(false);
      expect(resultado.captacionActiva).toBe(false);
      expect(resultado.mensaje).toBe('La captación ya estaba pausada.');
      expect(actualizacionesCoach.length).toBe(0);
    });

    it('reanudar captación cuando estaba pausada: cambioAplicado=true y mensaje correspondiente', async () => {
      coachEnBd.captacionActiva = false;

      expect(
        entrenadorService.actualizarCaptacion,
        'actualizarCaptacion debe existir en EntrenadorService'
      ).toBeDefined();

      const resultado = await entrenadorService.actualizarCaptacion(COACH_USUARIO_ID, {
        activa: true,
      });

      expect(resultado.cambioAplicado).toBe(true);
      expect(resultado.captacionActiva).toBe(true);
      expect(resultado.mensaje).toBe('Captación reanudada.');
      expect(actualizacionesCoach.length).toBeGreaterThan(0);
      expect(mockWithTenant).toHaveBeenCalledWith(
        { entrenadorId: COACH_USUARIO_ID },
        expect.any(Function)
      );
    });

    it('reanudar captación cuando YA estaba activa: idempotente, cambioAplicado=false y no escribe en DB', async () => {
      coachEnBd.captacionActiva = true;
      actualizacionesCoach = [];

      expect(
        entrenadorService.actualizarCaptacion,
        'actualizarCaptacion debe existir en EntrenadorService'
      ).toBeDefined();

      const resultado = await entrenadorService.actualizarCaptacion(COACH_USUARIO_ID, {
        activa: true,
      });

      expect(resultado.cambioAplicado).toBe(false);
      expect(resultado.captacionActiva).toBe(true);
      expect(resultado.mensaje).toBe('La captación ya estaba activa.');
      expect(actualizacionesCoach.length).toBe(0);
    });

    it('el log de actualización no contiene ningún código de entrenador', async () => {
      const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      coachEnBd.captacionActiva = true;

      expect(
        entrenadorService.actualizarCaptacion,
        'actualizarCaptacion debe existir en EntrenadorService'
      ).toBeDefined();

      await entrenadorService.actualizarCaptacion(COACH_USUARIO_ID, { activa: false });

      const llamadas = logSpy.mock.calls.map((c) => String(c[0]));
      const logPausa = llamadas.find((l) => l.includes('pausó su captación'));

      expect(logPausa).toBeDefined();
      expect(logPausa).toContain(`Captación: el entrenador ${COACH_USUARIO_ID} pausó su captación.`);
      expect(logPausa).not.toContain(CODIGO_INICIAL);
    });
  });

  describe('3.3 registrosPorEnlace (conteo según rotación y origen_registro)', () => {
    it('si nunca rotó (enlaceRotadoEnUtc es null), cuenta todos los de origen "enlace" e ignora "manual"', async () => {
      coachEnBd.enlaceRotadoEnUtc = null;

      alumnosEnBd = [
        { id: 'a1', origenRegistro: 'enlace', createdAtUtc: new Date('2026-02-01') },
        { id: 'a2', origenRegistro: 'enlace', createdAtUtc: new Date('2026-03-01') },
        { id: 'a3', origenRegistro: 'manual', createdAtUtc: new Date('2026-03-15') },
      ];

      expect(
        entrenadorService.obtenerCaptacion,
        'obtenerCaptacion debe existir en EntrenadorService'
      ).toBeDefined();

      const resultado: CaptacionEntrenadorDTO = await entrenadorService.obtenerCaptacion(
        COACH_USUARIO_ID
      );

      expect(resultado.registrosPorEnlace).toBe(2);
      expect(mockWithTenant).toHaveBeenCalledWith(
        { entrenadorId: COACH_USUARIO_ID },
        expect.any(Function)
      );
    });

    it('si rotó en fecha T, cuenta solo los de origen "enlace" con createdAtUtc >= T', async () => {
      const FECHA_ROTACION = new Date('2026-05-01T12:00:00Z');
      coachEnBd.enlaceRotadoEnUtc = FECHA_ROTACION;

      alumnosEnBd = [
        // Antes de la rotación (no debe contarse)
        { id: 'a1', origenRegistro: 'enlace', createdAtUtc: new Date('2026-04-15T00:00:00Z') },
        // Después de la rotación con origen 'enlace' (debe contarse)
        { id: 'a2', origenRegistro: 'enlace', createdAtUtc: new Date('2026-05-02T00:00:00Z') },
        { id: 'a3', origenRegistro: 'enlace', createdAtUtc: new Date('2026-05-10T00:00:00Z') },
        // Después de la rotación pero origen 'manual' (no debe contarse)
        { id: 'a4', origenRegistro: 'manual', createdAtUtc: new Date('2026-05-12T00:00:00Z') },
      ];

      expect(
        entrenadorService.obtenerCaptacion,
        'obtenerCaptacion debe existir en EntrenadorService'
      ).toBeDefined();

      const resultado = await entrenadorService.obtenerCaptacion(COACH_USUARIO_ID);

      expect(resultado.registrosPorEnlace).toBe(2);
      expect(mockWithTenant).toHaveBeenCalledWith(
        { entrenadorId: COACH_USUARIO_ID },
        expect.any(Function)
      );
    });
  });

  describe('3.4 obtenerPerfil incluye campos de captación', () => {
    it('GET /entrenador/perfil añade captacionActiva, enlaceRotadoEnUtc y registrosPorEnlace', async () => {
      coachEnBd.captacionActiva = true;
      coachEnBd.enlaceRotadoEnUtc = new Date('2026-06-01T10:00:00Z');
      alumnosEnBd = [
        { id: 'a1', origenRegistro: 'enlace', createdAtUtc: new Date('2026-06-02T10:00:00Z') },
      ];

      const perfil: PerfilEntrenadorDTO = await entrenadorService.obtenerPerfil(COACH_USUARIO_ID);

      expect(perfil).toHaveProperty('captacionActiva');
      expect(perfil.captacionActiva).toBe(true);

      expect(perfil).toHaveProperty('enlaceRotadoEnUtc');
      expect(perfil.enlaceRotadoEnUtc).toBeDefined();

      expect(perfil).toHaveProperty('registrosPorEnlace');
      expect(perfil.registrosPorEnlace).toBe(1);

      expect(mockWithTenant).toHaveBeenCalledWith(
        { entrenadorId: COACH_USUARIO_ID },
        expect.any(Function)
      );
    });
  });
});
