import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { getTableName } from '@guachafit/database';
import {
  EstadoAlumno,
  EstadoLicencia,
  EstadoUsuario,
  Modalidad,
  Rol,
  TipoDocumento,
} from '@guachafit/shared';
import type {
  AltaManualAlumnoDTO,
  RegistroPublicoAlumnoDTO,
} from '@guachafit/shared';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';
import { AlumnosController } from '../../src/modules/alumnos/alumnos.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
import { EntrenadorService } from '../../src/modules/entrenador/entrenador.service';
import { AlumnoRegistradoEvent } from '../../src/modules/notificaciones/events/eventos-notificacion';

const COACH_USUARIO_ID = '11111111-1111-4111-8111-111111111111';
const COACH_PERFIL_ID = '22222222-2222-4222-8222-222222222222';
const ALUMNO_USUARIO_ID = '33333333-3333-4333-8333-333333333333';
const ALUMNO_PERFIL_ID = '44444444-4444-4444-8444-444444444444';

const coachBase = {
  id: COACH_PERFIL_ID,
  usuarioId: COACH_USUARIO_ID,
  nombres: 'Alejandro',
  apellidos: 'Fit',
  nombreComercial: 'AlexFit Gym',
  coachCode: 'ALEXFIT',
  estadoLicencia: EstadoLicencia.ACTIVA,
  // RF-010 §6 (CASCADA-COACH): la cuenta del coach también forma parte de su operabilidad.
  activo: true,
  capacidadMaxima: 50,
  telefonoContacto: '+584121234567',
};

const cryptoServiceMock = {
  encryptHealthRecord: vi.fn((texto: string) => `encrypted:${texto}`),
  decryptHealthRecord: vi.fn((texto: string) => texto),
  hashPassword: vi.fn(async (password: string) => `hash-${password}`),
  hashSha256: vi.fn((token: string) => `sha256-${token}`),
  generateInvitationToken: vi.fn(() => ({
    rawToken: 'raw-token-de-activacion-1234567890',
    tokenHash: 'token-hash-abc',
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
  })),
} as any;

const altaManualDto: AltaManualAlumnoDTO = {
  nombres: 'Marcos',
  apellidos: 'Pérez',
  email: 'marcos@guachafit.com',
  tipoDocumento: TipoDocumento.V,
  numeroDocumento: '18456123',
  fechaNacimiento: '1994-05-15',
  telefonoWhatsapp: '+584121234567',
  modalidad: Modalidad.PRESENCIAL,
  fichaSaludPrivada: 'Hernia discal L4-L5',
};

const registroPublicoDto: RegistroPublicoAlumnoDTO = {
  coachCode: 'ALEXFIT',
  nombres: 'Valeria',
  apellidos: 'Castillo',
  email: 'valeria@guachafit.com',
  password: 'clave-segura-2026',
  tipoDocumento: TipoDocumento.V,
  numeroDocumento: '26123456',
  fechaNacimiento: '1999-03-10',
  telefonoWhatsapp: '+584149998877',
  modalidad: Modalidad.REMOTO,
};

// =============================================================================
// A. Alta manual: sin correo falso, con token real para compartir el enlace
// =============================================================================
describe('WU-E (RF-011 RN-05): Alta manual entrega el enlace de activación', () => {
  function crearDbAltaManual(usuarioExistente: any = null) {
    const usuarioCreado = {
      id: ALUMNO_USUARIO_ID,
      email: 'marcos@guachafit.com',
      rol: Rol.ALUMNO,
    };
    const perfilCreado = {
      id: ALUMNO_PERFIL_ID,
      nombres: 'Marcos',
      apellidos: 'Pérez',
      fechaNacimiento: '1994-05-15',
      modalidad: Modalidad.PRESENCIAL,
      estadoActivacion: EstadoAlumno.ACTIVO,
    };

    const db: any = {
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve(usuarioExistente ? [usuarioExistente] : []),
        }),
      }),
      insert: (table: any) => ({
        values: () => ({
          returning: () =>
            Promise.resolve([
              getTableName(table) === 'usuarios' ? usuarioCreado : perfilCreado,
            ]),
        }),
      }),
      // RNF-003/ADR-011 (etapa 3): el INSERT del perfil corre dentro de withTenant (RLS).
      execute: async () => undefined,
    };
    db.transaction = async (cb: any) => cb(db);
    return db;
  }

  it('devuelve el token de invitación con un mensaje honesto (sin afirmar envío de correo)', async () => {
    const service = new AlumnosService(crearDbAltaManual(), cryptoServiceMock);

    const resultado = await service.crearAlumnoManual(COACH_USUARIO_ID, altaManualDto);

    expect(resultado.tokenInvitacion).toBe('raw-token-de-activacion-1234567890');
    expect(resultado.mensaje).toContain('Comparte el enlace de activación');
    expect(resultado.mensaje.toLowerCase()).not.toContain('correo');
    expect(resultado.id).toBe(ALUMNO_PERFIL_ID);
  });

  it('mantiene la unicidad de correo con 409', async () => {
    const service = new AlumnosService(
      crearDbAltaManual({ id: 'existente', email: 'marcos@guachafit.com' }),
      cryptoServiceMock
    );

    await expect(
      service.crearAlumnoManual(COACH_USUARIO_ID, altaManualDto)
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

// =============================================================================
// B. Resolución pública del coach_code (RN-06 / RN-07.1)
// =============================================================================
describe('WU-E (RF-011 RN-06/RN-07.1): resolución pública del coach_code', () => {
  function crearDbResolucion(coach: any | null) {
    return {
      select: () => ({
        from: () => {
          // RF-010 §6 (CASCADA-COACH): el resolver une `perfiles_entrenador` con `usuarios`
          // para evaluar la operabilidad completa (licencia vigente + cuenta habilitada).
          const consulta: any = {
            innerJoin: () => consulta,
            where: () => Promise.resolve(coach ? [coach] : []),
          };
          return consulta;
        },
      }),
    } as any;
  }

  it('resuelve un coach con licencia ACTIVA sin exponer datos sensibles', async () => {
    const service = new AlumnosService(crearDbResolucion({ ...coachBase }), cryptoServiceMock);

    const resultado = await service.resolverCoachPublico('alexfit');

    expect(resultado).toEqual({
      coachCode: 'ALEXFIT',
      nombre: 'Alejandro Fit',
      nombreComercial: 'AlexFit Gym',
    });
    // Nunca se filtran teléfono/capacidad/licencia al público.
    expect(resultado as any).not.toHaveProperty('telefonoContacto');
    expect(resultado as any).not.toHaveProperty('estadoLicencia');
  });

  it('rechaza con 404 un código inexistente', async () => {
    const service = new AlumnosService(crearDbResolucion(null), cryptoServiceMock);

    await expect(service.resolverCoachPublico('NOEXISTE')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('rechaza con 404 un coach con licencia suspendida (mismo mensaje que inexistente)', async () => {
    const service = new AlumnosService(
      crearDbResolucion({
        ...coachBase,
        estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
      }),
      cryptoServiceMock
    );

    await expect(service.resolverCoachPublico('ALEXFIT')).rejects.toThrow(
      'El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach.'
    );
  });

  it('rechaza con 404 un coach con cuenta deshabilitada y licencia activa (mismo mensaje)', async () => {
    const service = new AlumnosService(
      crearDbResolucion({ ...coachBase, activo: false }),
      cryptoServiceMock
    );

    await expect(service.resolverCoachPublico('ALEXFIT')).rejects.toThrow(
      'El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach.'
    );
  });

  it('al reactivar la cuenta del coach el código vuelve a resolver (desbloqueo inmediato)', async () => {
    const coach = { ...coachBase, activo: false };
    const service = new AlumnosService(crearDbResolucion(coach), cryptoServiceMock);

    await expect(service.resolverCoachPublico('ALEXFIT')).rejects.toBeInstanceOf(
      NotFoundException
    );

    coach.activo = true;
    await expect(service.resolverCoachPublico('ALEXFIT')).resolves.toMatchObject({
      coachCode: 'ALEXFIT',
    });
  });

  it('el controller valida el formato del código con 400 antes de consultar', async () => {
    const resolver = vi.fn();
    const controller = new AlumnosController({ resolverCoachPublico: resolver } as any);

    await expect(controller.resolverCoachPublico('ab')).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(resolver).not.toHaveBeenCalled();

    await expect(controller.resolverCoachPublico(' alexfit ')).resolves.toBeUndefined();
    expect(resolver).toHaveBeenCalledWith('ALEXFIT');
  });
});

// =============================================================================
// C. Registro público: licencia vigente + notificación al coach (RN-07.1/RN-07.4)
// =============================================================================
describe('WU-E (RF-011 RN-07): registro público valida licencia y notifica al coach', () => {
  function crearDbRegistroPublico(coach: any | null, usuarioExistente: any = null) {
    const inserts: string[] = [];
    const usuarioCreado = { id: ALUMNO_USUARIO_ID, email: 'valeria@guachafit.com' };
    const perfilCreado = {
      id: ALUMNO_PERFIL_ID,
      nombres: 'Valeria',
      apellidos: 'Castillo',
      fechaNacimiento: '1999-03-10',
      modalidad: Modalidad.REMOTO,
      estadoActivacion: EstadoAlumno.ACTIVO,
    };

    const db: any = {
      select: () => ({
        from: (table: any) => {
          // RF-010 §6 (CASCADA-COACH): la validación del código une `perfiles_entrenador` con
          // `usuarios` para exigir licencia vigente Y cuenta habilitada.
          const consulta: any = {
            innerJoin: () => consulta,
            where: () =>
              Promise.resolve(
                getTableName(table) === 'perfiles_entrenador'
                  ? coach
                    ? [coach]
                    : []
                  : usuarioExistente
                  ? [usuarioExistente]
                  : []
              ),
          };
          return consulta;
        },
      }),
      insert: (table: any) => ({
        values: () => ({
          returning: () => {
            inserts.push(getTableName(table));
            return Promise.resolve([
              getTableName(table) === 'usuarios' ? usuarioCreado : perfilCreado,
            ]);
          },
        }),
      }),
      // RNF-003/ADR-011 (etapa 3): el INSERT del perfil corre dentro de withTenant (RLS).
      execute: async () => undefined,
    };
    db.transaction = async (cb: any) => cb(db);

    return { db, inserts };
  }

  it('crea la cuenta vinculada y publica ALUMNO_REGISTRADO al coach por el bus de eventos', async () => {
    const { db, inserts } = crearDbRegistroPublico({ ...coachBase });
    const emitAsync = vi.fn().mockResolvedValue([{ inAppId: 'n-1' }]);
    const service = new AlumnosService(db, cryptoServiceMock, { emitAsync } as any);

    const resultado = await service.registroPublico(registroPublicoDto);

    expect(resultado.id).toBe(ALUMNO_PERFIL_ID);
    expect(inserts).toEqual(['usuarios', 'perfiles_alumno']);
    expect(emitAsync).toHaveBeenCalledTimes(1);
    expect(emitAsync).toHaveBeenCalledWith(
      AlumnoRegistradoEvent.NOMBRE,
      expect.objectContaining({
        payload: expect.objectContaining({
          tipoEvento: 'ALUMNO_REGISTRADO',
          categoria: 'ALUMNOS',
          destinatarioUserId: COACH_USUARIO_ID,
          entrenadorId: COACH_USUARIO_ID,
          esCriticoSeguridad: false,
          linkAccion: `/coach/alumnos/${ALUMNO_PERFIL_ID}`,
          referenciaId: ALUMNO_PERFIL_ID,
        }),
      })
    );
    const evento = emitAsync.mock.calls[0][1].payload;
    expect(evento.cuerpo).toContain('Valeria Castillo');
    expect(evento.titulo).toContain('Nuevo alumno registrado');
  });

  it('rechaza con 404 si la licencia del coach está suspendida y NO crea ninguna fila', async () => {
    const { db, inserts } = crearDbRegistroPublico({
      ...coachBase,
      estadoLicencia: EstadoLicencia.SUSPENDIDA_SUPERADMIN,
    });
    const emitAsync = vi.fn();
    const service = new AlumnosService(db, cryptoServiceMock, { emitAsync } as any);

    await expect(service.registroPublico(registroPublicoDto)).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(inserts).toEqual([]);
    expect(emitAsync).not.toHaveBeenCalled();
  });

  it('rechaza con 404 si la cuenta del coach está deshabilitada (licencia activa) y NO crea filas', async () => {
    const { db, inserts } = crearDbRegistroPublico({ ...coachBase, activo: false });
    const emitAsync = vi.fn();
    const service = new AlumnosService(db, cryptoServiceMock, { emitAsync } as any);

    await expect(service.registroPublico(registroPublicoDto)).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(inserts).toEqual([]);
    expect(emitAsync).not.toHaveBeenCalled();
  });

  it('rechaza con 404 un coach inexistente', async () => {
    const { db } = crearDbRegistroPublico(null);
    const service = new AlumnosService(db, cryptoServiceMock);

    await expect(service.registroPublico(registroPublicoDto)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('un fallo del bus de eventos NUNCA tumba el registro del alumno (fire-and-forget)', async () => {
    const { db } = crearDbRegistroPublico({ ...coachBase });
    const emitAsync = vi.fn().mockRejectedValue(new Error('cola caída'));
    const service = new AlumnosService(db, cryptoServiceMock, { emitAsync } as any);

    await expect(service.registroPublico(registroPublicoDto)).resolves.toMatchObject({
      id: ALUMNO_PERFIL_ID,
    });
    // Deja que el `.catch()` del fire-and-forget consuma la promesa rechazada.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(emitAsync).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// D. Canje del token de invitación (token válido / expirado / usado / cuenta caída)
// =============================================================================
describe('WU-E (RF-011 RN-05 / RF-012): establecerPasswordConToken', () => {
  function crearDbAuth(usuarioInicial: any | null, perfilInicial: any | null) {
    const store = {
      usuario: usuarioInicial ? { ...usuarioInicial } : null,
      perfil: perfilInicial ? { ...perfilInicial } : null,
    };
    // RF-010 §6 (CASCADA-COACH): el canje del alumno consulta la operabilidad de su entrenador
    // (cuenta habilitada + licencia vigente) antes de escribir.
    const coachOperable = {
      usuarioId: COACH_USUARIO_ID,
      estadoLicencia: EstadoLicencia.ACTIVA,
      activo: true,
    };
    const db: any = {
      select: () => ({
        from: (table: any) => {
          const nombre = getTableName(table);
          const consulta: any = {
            innerJoin: () => consulta,
            // El chequeo de operabilidad usa `.limit(1)`; el resto de lecturas resuelve directo.
            where: () => {
              const filas =
                nombre === 'usuarios'
                  ? store.usuario
                    ? [store.usuario]
                    : []
                  : nombre === 'perfiles_entrenador'
                  ? [coachOperable]
                  : store.perfil
                  ? [store.perfil]
                  : [];
              return {
                limit: () => Promise.resolve(filas),
                then: (resolve: any, reject: any) => Promise.resolve(filas).then(resolve, reject),
              };
            },
          };
          return consulta;
        },
      }),
      update: (table: any) => ({
        set: (valores: any) => ({
          where: () => {
            if (getTableName(table) === 'usuarios' && store.usuario) {
              Object.assign(store.usuario, valores);
            }
            return Promise.resolve([]);
          },
        }),
      }),
      // RNF-003/ADR-011 (etapa 3): el canje lee el perfil (RLS) dentro de withTenant.
      execute: async () => undefined,
    };
    db.transaction = async (cb: any) => cb(db);
    return { db, store };
  }

  const usuarioAlumnoBase = {
    id: ALUMNO_USUARIO_ID,
    email: 'valeria@guachafit.com',
    rol: Rol.ALUMNO,
    estado: EstadoUsuario.ACTIVO,
    activo: true,
    passwordHash: null,
    tokenInvitacionHash: 'sha256-token-valido',
    tokenInvitacionExpira: new Date(Date.now() + 3600 * 1000),
  };

  it('token válido de alumno activo: guarda la contraseña, consume el token y devuelve sesión', async () => {
    const { db, store } = crearDbAuth(usuarioAlumnoBase, {
      id: ALUMNO_PERFIL_ID,
      usuarioId: ALUMNO_USUARIO_ID,
      entrenadorId: COACH_USUARIO_ID,
      deletedAtUtc: null,
    });
    const crypto = {
      hashSha256: (token: string) => `sha256-${token}`,
      hashPassword: async (password: string) => `hash-${password}`,
    } as any;
    const service = new AuthService(db, crypto);

    const resultado = await service.establecerPasswordConToken({
      token: 'token-valido',
      password: 'nueva-clave-2026',
    });

    expect(resultado.accessToken).toBeTruthy();
    expect(resultado.refreshToken).toBeTruthy();
    expect(resultado.usuario.entrenadorId).toBe(COACH_USUARIO_ID);
    expect(store.usuario.passwordHash).toBe('hash-nueva-clave-2026');
    expect(store.usuario.tokenInvitacionHash).toBeNull();
    expect(store.usuario.tokenInvitacionExpira).toBeNull();
  });

  it('token expirado (sin coincidencia vigente): 404 y no escribe contraseña', async () => {
    const { db, store } = crearDbAuth(null, null);
    const crypto = {
      hashSha256: (token: string) => `sha256-${token}`,
      hashPassword: async (password: string) => `hash-${password}`,
    } as any;
    const service = new AuthService(db, crypto);

    await expect(
      service.establecerPasswordConToken({ token: 'token-expirado', password: 'nueva-clave-2026' })
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(store.usuario).toBeNull();
  });

  it('token ya usado (limpia el hash al consumirse): 404 en el segundo intento', async () => {
    // Tras el primer canje el usuario persiste SIN token; la consulta no lo encuentra.
    const { db } = crearDbAuth(null, null);
    const crypto = {
      hashSha256: (token: string) => `sha256-${token}`,
      hashPassword: async (password: string) => `hash-${password}`,
    } as any;
    const service = new AuthService(db, crypto);

    await expect(
      service.establecerPasswordConToken({ token: 'token-usado', password: 'otra-clave-2026' })
    ).rejects.toThrow('El enlace de invitación no es válido o ha expirado (TTL 48 horas).');
  });

  it('alumno archivado (baja lógica): 401 y NO se consume el token ni se escribe contraseña', async () => {
    const { db, store } = crearDbAuth(usuarioAlumnoBase, {
      id: ALUMNO_PERFIL_ID,
      usuarioId: ALUMNO_USUARIO_ID,
      entrenadorId: COACH_USUARIO_ID,
      deletedAtUtc: new Date('2026-01-10T12:00:00Z'),
    });
    const crypto = {
      hashSha256: (token: string) => `sha256-${token}`,
      hashPassword: async (password: string) => `hash-${password}`,
    } as any;
    const service = new AuthService(db, crypto);

    await expect(
      service.establecerPasswordConToken({ token: 'token-valido', password: 'nueva-clave-2026' })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(store.usuario.passwordHash).toBeNull();
    expect(store.usuario.tokenInvitacionHash).toBe('sha256-token-valido');
  });

  it('usuario inactivo o bloqueado: 401 sin consumir el token', async () => {
    for (const parche of [{ activo: false }, { estado: EstadoUsuario.BLOQUEADO }]) {
      const { db, store } = crearDbAuth(
        { ...usuarioAlumnoBase, ...parche },
        { id: ALUMNO_PERFIL_ID, usuarioId: ALUMNO_USUARIO_ID, entrenadorId: COACH_USUARIO_ID }
      );
      const crypto = {
        hashSha256: (token: string) => `sha256-${token}`,
        hashPassword: async (password: string) => `hash-${password}`,
      } as any;
      const service = new AuthService(db, crypto);

      await expect(
        service.establecerPasswordConToken({ token: 'token-valido', password: 'nueva-clave-2026' })
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(store.usuario.tokenInvitacionHash).toBe('sha256-token-valido');
    }
  });
});

// =============================================================================
// F. Cableado HTTP real del resolver público (Nest + supertest)
// =============================================================================
describe('WU-E (RF-011 RN-06): cableado HTTP de GET /alumnos/coach/:code', () => {
  async function crearApp(): Promise<{ app: INestApplication; resolver: ReturnType<typeof vi.fn> }> {
    const resolver = vi.fn(async (code: string) => ({
      coachCode: code,
      nombre: 'Alejandro Fit',
      nombreComercial: 'AlexFit Gym',
    }));

    const moduleRef = await Test.createTestingModule({
      controllers: [AlumnosController],
      providers: [{ provide: AlumnosService, useValue: { resolverCoachPublico: resolver } }],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    return { app, resolver };
  }

  it('responde 200 sin token y normaliza el código antes de resolver', async () => {
    const { app, resolver } = await crearApp();

    const res = await request(app.getHttpServer()).get('/alumnos/coach/alexfit');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      coachCode: 'ALEXFIT',
      nombre: 'Alejandro Fit',
      nombreComercial: 'AlexFit Gym',
    });
    expect(resolver).toHaveBeenCalledWith('ALEXFIT');

    await app.close();
  });

  it('un código con formato inválido responde 400 sin llamar al servicio', async () => {
    const { app, resolver } = await crearApp();

    const res = await request(app.getHttpServer()).get('/alumnos/coach/ab');

    expect(res.status).toBe(400);
    expect(resolver).not.toHaveBeenCalled();

    await app.close();
  });
});

// =============================================================================
// E. Perfil real del entrenador (fuente del coachCode)
// =============================================================================
describe('WU-E (RF-011 RN-06): GET /entrenador/perfil expone el coachCode real', () => {
  it('devuelve el perfil del coach autenticado', async () => {
    const db: any = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ ...coachBase }]),
        }),
      }),
    };
    const service = new EntrenadorService(db, (async (_ctx: any, cb: any) => cb(db)) as any);

    const perfil = await service.obtenerPerfil(COACH_USUARIO_ID);

    expect(perfil.coachCode).toBe('ALEXFIT');
    expect(perfil.estadoLicencia).toBe(EstadoLicencia.ACTIVA);
    expect(perfil.nombreComercial).toBe('AlexFit Gym');
  });

  it('404 si el usuario autenticado no tiene perfil de entrenador', async () => {
    const db: any = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    };
    const service = new EntrenadorService(db, (async (_ctx: any, cb: any) => cb(db)) as any);

    await expect(service.obtenerPerfil('sin-perfil')).rejects.toBeInstanceOf(NotFoundException);
  });
});
