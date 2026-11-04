import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getTableName } from '@guachafit/database';
import {
  EstadoAlumno,
  EstadoLicencia,
  EstadoUsuario,
  Modalidad,
  Rol,
  TipoDocumento,
  type AltaManualAlumnoDTO,
  type RegistroPublicoAlumnoDTO,
} from '@guachafit/shared';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';

describe('D17 · Tarea 5: Registro público y resolución de captación (pausa, cupo y origen_registro)', () => {
  const COACH_USUARIO_ID = '11111111-1111-4111-8111-111111111111';
  const COACH_PERFIL_ID = '22222222-2222-4222-8222-222222222222';
  const ALUMNO_USUARIO_ID = '33333333-3333-4333-8333-333333333333';
  const ALUMNO_PERFIL_ID = '44444444-4444-4444-8444-444444444444';
  const COACH_CODE = 'FITNESS1';

  const MENSAJE_404_UNIFORME =
    'El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach.';

  let coachEnBd: any;
  let alumnosEnBd: any[];
  let usuariosEnBd: any[];
  let insercionesAlumno: any[];
  let mockDb: any;
  let mockWithTenant: any;
  let alumnosService: AlumnosService;

  const cryptoMock = {
    encryptHealthRecord: vi.fn((texto: string) => `encrypted:${texto}`),
    decryptHealthRecord: vi.fn((texto: string) => texto),
    hashPassword: vi.fn(async (password: string) => `hash-${password}`),
    hashSha256: vi.fn((token: string) => `sha256-${token}`),
    generateInvitationToken: vi.fn(() => ({
      rawToken: 'raw-token-1234567890',
      tokenHash: 'token-hash-123',
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
    })),
  } as any;

  const registroPublicoDto: RegistroPublicoAlumnoDTO = {
    coachCode: COACH_CODE,
    nombres: 'Laura',
    apellidos: 'Torres',
    email: 'laura@guachafit.com',
    password: 'clave-segura-2026',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '28123456',
    fechaNacimiento: '1998-04-12',
    telefonoWhatsapp: '+584141112233',
    modalidad: Modalidad.REMOTO,
  };

  const altaManualDto: AltaManualAlumnoDTO = {
    nombres: 'Diego',
    apellidos: 'Morales',
    email: 'diego@guachafit.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '29876543',
    fechaNacimiento: '1997-08-20',
    telefonoWhatsapp: '+584129998877',
    modalidad: Modalidad.PRESENCIAL,
    fichaSaludPrivada: 'Sin antecedentes relevantes',
  };

  beforeEach(() => {
    insercionesAlumno = [];
    usuariosEnBd = [];
    alumnosEnBd = [];
    cryptoMock.hashPassword.mockClear();
    cryptoMock.hashPassword.mockImplementation(async (password: string) => `hash-${password}`);

    coachEnBd = {
      id: COACH_PERFIL_ID,
      usuarioId: COACH_USUARIO_ID,
      nombres: 'Marcos',
      apellidos: 'Entrenador',
      nombreComercial: 'Marcos Gym',
      coachCode: COACH_CODE,
      capacidadMaxima: 3, // Cupo para tests
      telefonoContacto: '+584121234567',
      estadoLicencia: EstadoLicencia.ACTIVA,
      activo: true,
      captacionActiva: true,
      enlaceRotadoEnUtc: null,
    };

    mockDb = {
      select: vi.fn(() => ({
        from: vi.fn((table: any) => {
          const tableName = getTableName(table);
          const queryObj: any = {
            innerJoin: vi.fn(() => queryObj),
            where: vi.fn((_cond: any) => {
              if (tableName === 'perfiles_entrenador') {
                return Promise.resolve(coachEnBd ? [{ ...coachEnBd }] : []);
              }
              if (tableName === 'usuarios') {
                return Promise.resolve(usuariosEnBd);
              }
              if (tableName === 'perfiles_alumno') {
                return Promise.resolve(alumnosEnBd);
              }
              return Promise.resolve([]);
            }),
            for: vi.fn(() => queryObj),
          };
          return queryObj;
        }),
      })),
      insert: vi.fn((table: any) => ({
        values: vi.fn((vals: any) => {
          const tableName = getTableName(table);
          const record = {
            id: tableName === 'usuarios' ? ALUMNO_USUARIO_ID : ALUMNO_PERFIL_ID,
            ...vals,
            createdAtUtc: new Date(),
            updatedAtUtc: new Date(),
          };
          if (tableName === 'perfiles_alumno') {
            insercionesAlumno.push(vals);
          }
          return {
            returning: vi.fn().mockResolvedValue([record]),
            then: (resolve: any) => resolve([record]),
          };
        }),
      })),
      transaction: vi.fn(async (cb: any) => cb(mockDb)),
    };

    mockWithTenant = vi.fn(async (_tenantContext: any, fn: any) => fn(mockDb));

    alumnosService = new AlumnosService(
      mockDb,
      cryptoMock,
      { emitAsync: vi.fn().mockResolvedValue([{ inAppId: 'notif-1' }]) } as any,
      mockWithTenant
    );
  });

  describe('5.1 Captación pausada (404 uniforme indistinguible de código inexistente)', () => {
    it('resolverCoachPublico: con captación pausada lanza NotFoundException con el mensaje uniforme', async () => {
      coachEnBd.captacionActiva = false;

      await expect(alumnosService.resolverCoachPublico(COACH_CODE)).rejects.toThrow(
        NotFoundException
      );
      await expect(alumnosService.resolverCoachPublico(COACH_CODE)).rejects.toThrow(
        MENSAJE_404_UNIFORME
      );
    });

    it('registroPublico: con captación pausada lanza NotFoundException con el mismo mensaje uniforme', async () => {
      coachEnBd.captacionActiva = false;

      await expect(alumnosService.registroPublico(registroPublicoDto)).rejects.toThrow(
        NotFoundException
      );
      await expect(alumnosService.registroPublico(registroPublicoDto)).rejects.toThrow(
        MENSAJE_404_UNIFORME
      );
    });

    it('el mensaje de error ante captación pausada es exactamente igual al de código inexistente', async () => {
      // 1) Error con código inexistente
      coachEnBd = null;
      let errorInexistente: any;
      try {
        await alumnosService.resolverCoachPublico('NOEXISTE');
      } catch (e) {
        errorInexistente = e;
      }

      // 2) Error con captación pausada
      coachEnBd = {
        id: COACH_PERFIL_ID,
        usuarioId: COACH_USUARIO_ID,
        coachCode: COACH_CODE,
        estadoLicencia: EstadoLicencia.ACTIVA,
        activo: true,
        captacionActiva: false,
      };
      let errorPausada: any;
      try {
        await alumnosService.resolverCoachPublico(COACH_CODE);
      } catch (e) {
        errorPausada = e;
      }

      expect(errorInexistente).toBeInstanceOf(NotFoundException);
      expect(errorPausada).toBeInstanceOf(NotFoundException);
      expect(errorPausada.message).toBe(errorInexistente.message);
      expect(errorPausada.message).toBe(MENSAJE_404_UNIFORME);
    });
  });

  describe('5.2 Cupo lleno (alumnos ACTIVO >= capacidadMaxima)', () => {
    it('resolverCoachPublico: con cupo lleno lanza NotFoundException con el mensaje uniforme', async () => {
      coachEnBd.capacidadMaxima = 2;
      // 2 alumnos activos
      alumnosEnBd = [
        { id: 'al-1', estadoActivacion: EstadoAlumno.ACTIVO, deletedAtUtc: null },
        { id: 'al-2', estadoActivacion: EstadoAlumno.ACTIVO, deletedAtUtc: null },
      ];

      await expect(alumnosService.resolverCoachPublico(COACH_CODE)).rejects.toThrow(
        NotFoundException
      );
      await expect(alumnosService.resolverCoachPublico(COACH_CODE)).rejects.toThrow(
        MENSAJE_404_UNIFORME
      );
    });

    it('registroPublico: con cupo lleno lanza NotFoundException con el mensaje uniforme', async () => {
      coachEnBd.capacidadMaxima = 2;
      alumnosEnBd = [
        { id: 'al-1', estadoActivacion: EstadoAlumno.ACTIVO, deletedAtUtc: null },
        { id: 'al-2', estadoActivacion: EstadoAlumno.ACTIVO, deletedAtUtc: null },
      ];

      await expect(alumnosService.registroPublico(registroPublicoDto)).rejects.toThrow(
        NotFoundException
      );
      await expect(alumnosService.registroPublico(registroPublicoDto)).rejects.toThrow(
        MENSAJE_404_UNIFORME
      );
    });

    it('alumnos con baja lógica o no activos no consumen cupo (permiten resolver y registrar)', async () => {
      coachEnBd.capacidadMaxima = 2;
      // 1 activo, inactivos/suspendidos (no consumen cupo), 1 dado de baja lógica
      alumnosEnBd = [
        { id: 'al-1', estadoActivacion: EstadoAlumno.ACTIVO, deletedAtUtc: null },
        { id: 'al-2', estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO, deletedAtUtc: null },
        { id: 'al-3', estadoActivacion: EstadoAlumno.SUSPENDIDO_PAGO, deletedAtUtc: null },
        { id: 'al-4', estadoActivacion: EstadoAlumno.ACTIVO, deletedAtUtc: new Date() },
      ];

      // Debe resolver con éxito porque solo hay 1 alumno activo
      const resCoach = await alumnosService.resolverCoachPublico(COACH_CODE);
      expect(resCoach.coachCode).toBe(COACH_CODE);

      // Y debe permitir registrar
      const resRegistro = await alumnosService.registroPublico(registroPublicoDto);
      expect(resRegistro.id).toBe(ALUMNO_PERFIL_ID);
    });
  });

  describe('5.3 Registro por enlace guarda origenRegistro="enlace" y alta manual guarda "manual"', () => {
    it('registroPublico guarda en perfiles_alumno con origenRegistro="enlace"', async () => {
      coachEnBd.captacionActiva = true;
      coachEnBd.capacidadMaxima = 50;
      alumnosEnBd = [];

      await alumnosService.registroPublico(registroPublicoDto);

      expect(insercionesAlumno.length).toBe(1);
      const insercion = insercionesAlumno[0];
      expect(insercion).toHaveProperty('origenRegistro');
      expect(insercion.origenRegistro).toBe('enlace');
    });

    it('crearAlumnoManual (alta manual) guarda en perfiles_alumno con origenRegistro="manual"', async () => {
      await alumnosService.crearAlumnoManual(COACH_USUARIO_ID, altaManualDto);

      expect(insercionesAlumno.length).toBe(1);
      const insercion = insercionesAlumno[0];
      expect(insercion).toHaveProperty('origenRegistro');
      expect(insercion.origenRegistro).toBe('manual');
    });
  });

  describe('5.4 Orden de comprobaciones (Sección 3.4 del contrato)', () => {
    it('1) Código inexistente → 404', async () => {
      coachEnBd = null;
      await expect(alumnosService.resolverCoachPublico('INEXISTENTE')).rejects.toThrow(
        NotFoundException
      );
    });

    it('2) Licencia suspendida o cuenta inactiva → 404', async () => {
      coachEnBd.estadoLicencia = EstadoLicencia.SUSPENDIDA_SUPERADMIN;
      await expect(alumnosService.resolverCoachPublico(COACH_CODE)).rejects.toThrow(
        NotFoundException
      );

      coachEnBd.estadoLicencia = EstadoLicencia.ACTIVA;
      coachEnBd.activo = false;
      await expect(alumnosService.resolverCoachPublico(COACH_CODE)).rejects.toThrow(
        NotFoundException
      );
    });

    it('3) Captación pausada → 404 antes de evaluar cupo', async () => {
      coachEnBd.captacionActiva = false;
      coachEnBd.capacidadMaxima = 0; // cupo también lleno

      await expect(alumnosService.resolverCoachPublico(COACH_CODE)).rejects.toThrow(
        MENSAJE_404_UNIFORME
      );
    });

    it('4) Cupo lleno → 404 antes de evaluar unicidad de correo en registro', async () => {
      coachEnBd.captacionActiva = true;
      coachEnBd.capacidadMaxima = 1;
      alumnosEnBd = [{ id: 'a1', estadoActivacion: EstadoAlumno.ACTIVO, deletedAtUtc: null }];

      // Correo ya existente
      usuariosEnBd = [{ id: 'u-existente', email: registroPublicoDto.email }];

      // Debe fallar con 404 (cupo lleno), NO con 409 (correo repetido)
      await expect(alumnosService.registroPublico(registroPublicoDto)).rejects.toThrow(
        NotFoundException
      );
      await expect(alumnosService.registroPublico(registroPublicoDto)).rejects.toThrow(
        MENSAJE_404_UNIFORME
      );
    });

    it('5) Con captación activa y cupo disponible, correo repetido arroja 409 ConflictException', async () => {
      coachEnBd.captacionActiva = true;
      coachEnBd.capacidadMaxima = 50;
      alumnosEnBd = [];

      // Correo ya existente
      usuariosEnBd = [{ id: 'u-existente', email: registroPublicoDto.email }];

      await expect(alumnosService.registroPublico(registroPublicoDto)).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('5.5 Hash de contraseña previo a withTenant (optimización de contención de bloqueo)', () => {
    it('el hash de la contraseña se calcula antes de withTenant', async () => {
      coachEnBd.captacionActiva = true;
      coachEnBd.capacidadMaxima = 50;
      alumnosEnBd = [];

      const ordenLlamadas: string[] = [];
      cryptoMock.hashPassword.mockImplementationOnce(async (p: string) => {
        ordenLlamadas.push('hashPassword');
        return `hash-${p}`;
      });
      mockWithTenant.mockImplementationOnce(async (ctx: any, fn: any) => {
        ordenLlamadas.push('withTenant');
        return fn(mockDb);
      });

      await alumnosService.registroPublico(registroPublicoDto);

      expect(ordenLlamadas).toEqual(['hashPassword', 'withTenant']);
      expect(cryptoMock.hashPassword).toHaveBeenCalledWith(registroPublicoDto.password);
    });

    it('código inexistente no llama a hashPassword cuando el rechazo ocurre en el filtro previo', async () => {
      coachEnBd = null;
      cryptoMock.hashPassword.mockClear();

      await expect(
        alumnosService.registroPublico({ ...registroPublicoDto, coachCode: 'NOEXISTE' })
      ).rejects.toThrow(NotFoundException);

      expect(cryptoMock.hashPassword).not.toHaveBeenCalled();
    });

    it('captación pausada no llama a hashPassword cuando el rechazo ocurre en el filtro previo', async () => {
      coachEnBd.captacionActiva = false;
      cryptoMock.hashPassword.mockClear();

      await expect(alumnosService.registroPublico(registroPublicoDto)).rejects.toThrow(
        NotFoundException
      );

      expect(cryptoMock.hashPassword).not.toHaveBeenCalled();
    });

    it('cupo lleno: hashPassword se ejecuta antes de withTenant y la transacción rechaza el cupo', async () => {
      coachEnBd.captacionActiva = true;
      coachEnBd.capacidadMaxima = 1;
      alumnosEnBd = [{ id: 'a1', estadoActivacion: EstadoAlumno.ACTIVO, deletedAtUtc: null }];

      const ordenLlamadas: string[] = [];
      cryptoMock.hashPassword.mockImplementationOnce(async (p: string) => {
        ordenLlamadas.push('hashPassword');
        return `hash-${p}`;
      });
      mockWithTenant.mockImplementationOnce(async (ctx: any, fn: any) => {
        ordenLlamadas.push('withTenant');
        return fn(mockDb);
      });

      await expect(alumnosService.registroPublico(registroPublicoDto)).rejects.toThrow(
        NotFoundException
      );

      expect(ordenLlamadas).toEqual(['hashPassword', 'withTenant']);
    });
  });
});
