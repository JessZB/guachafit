/**
 * RF-018 "Mi perfil" — LOTE API · DATOS del perfil (contratos A, B, C y D del prompt 01).
 *
 * FASE ROJA: el código de producción de RF-018 todavía NO existe. Estos tests lo fijan:
 * - `ActualizarMiPerfilSchema`, `MiPerfilDTO` y `MENSAJE_DATO_NO_EDITABLE` en `@guachafit/shared`.
 * - Migración `0017` de `usuarios`: `correoPendiente`, `tokenCambioCorreoHash` y
 *   `tokenCambioCorreoExpira` (Drizzle: `correoPendiente`, `tokenCambioCorreoHash`,
 *   `tokenCambioCorreoExpira`).
 * - `GET/PATCH /usuarios/me/perfil` (JWT, cualquier rol) montados en el `UsuariosController`
 *   existente y servidos por un `UsuariosService` (`obtenerMiPerfil` / `actualizarMiPerfil`).
 *
 * Superficie de producción asumida (ambigüedad anotada en el reporte): el nombre
 * `UsuariosService` y sus dos métodos. El resto de los contratos se toman literales del prompt.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getTableColumns, getTableName, usuarios } from '@guachafit/database';
import {
  ActualizarMiPerfilSchema,
  EstadoUsuario,
  MENSAJE_DATO_NO_EDITABLE,
  MENSAJE_FICHA_NO_ENCONTRADA,
  Rol,
  TipoDocumento,
  type MiPerfilDTO,
} from '@guachafit/shared';
import { DRIZZLE_DB, WITH_TENANT } from '../../src/database/database.module';
import { CryptoService } from '../../src/common/services/crypto.service';
import { JWT_SECRET_DESARROLLO } from '../../src/common/config/secretos-jwt';
import { MENSAJE_SESION_VENCIDA } from '../../src/common/mensajes-acceso';
import { configurarErroresGlobales } from '../../src/common/errores/filtro-errores-global';
import { UsuariosController } from '../../src/modules/usuarios/usuarios.controller';
import { UsuariosService } from '../../src/modules/usuarios/usuarios.service';
import { AuthService } from '../../src/modules/auth/auth.service';

afterEach(() => vi.restoreAllMocks());

const USUARIO_ID = '11111111-1111-4111-8111-111111111111';
const COACH_ID = '22222222-2222-4222-8222-222222222222';
const SUPERADMIN_ID = '33333333-3333-4333-8333-333333333333';
const PERFIL_ALUMNO_ID = '44444444-4444-4444-8444-444444444444';
const PERFIL_ENTRENADOR_ID = '55555555-5555-4555-8555-555555555555';

// ============================================================================
// A. Contratos compartidos de los datos del perfil
// ============================================================================
describe('RF-018 · A · contrato compartido de ActualizarMiPerfil', () => {
  it('[A1] admite los datos editables con sus límites exactos', () => {
    expect(ActualizarMiPerfilSchema.safeParse({ nombres: 'Ana' }).success).toBe(true);
    expect(ActualizarMiPerfilSchema.safeParse({ apellidos: 'Pérez' }).success).toBe(true);
    expect(ActualizarMiPerfilSchema.safeParse({ telefono: '+584121234567' }).success).toBe(true);
    expect(ActualizarMiPerfilSchema.safeParse({ nombreComercial: 'Gimnasio Ana' }).success).toBe(true);
    // `null` borra el nombre comercial (entrenador).
    expect(ActualizarMiPerfilSchema.safeParse({ nombreComercial: null }).success).toBe(true);

    // Bordes: nombres/apellidos 2–100, teléfono 8–30, nombreComercial hasta 150.
    expect(ActualizarMiPerfilSchema.safeParse({ nombres: 'A' }).success).toBe(false);
    expect(ActualizarMiPerfilSchema.safeParse({ nombres: 'A'.repeat(101) }).success).toBe(false);
    expect(ActualizarMiPerfilSchema.safeParse({ nombres: 'A'.repeat(100) }).success).toBe(true);
    expect(ActualizarMiPerfilSchema.safeParse({ apellidos: 'A' }).success).toBe(false);
    expect(ActualizarMiPerfilSchema.safeParse({ apellidos: 'A'.repeat(100) }).success).toBe(true);
    expect(ActualizarMiPerfilSchema.safeParse({ telefono: '1234567' }).success).toBe(false);
    expect(ActualizarMiPerfilSchema.safeParse({ telefono: '1'.repeat(8) }).success).toBe(true);
    expect(ActualizarMiPerfilSchema.safeParse({ telefono: '1'.repeat(30) }).success).toBe(true);
    expect(ActualizarMiPerfilSchema.safeParse({ telefono: '1'.repeat(31) }).success).toBe(false);
    expect(ActualizarMiPerfilSchema.safeParse({ nombreComercial: 'x'.repeat(150) }).success).toBe(true);
    expect(ActualizarMiPerfilSchema.safeParse({ nombreComercial: 'x'.repeat(151) }).success).toBe(false);
  });

  it('[A1] es un objeto ESTRICTO: cualquier clave fuera del contrato es error', () => {
    for (const clave of ['numeroDocumento', 'fechaNacimiento', 'email', 'rol', 'id', 'usuarioId']) {
      expect(
        ActualizarMiPerfilSchema.safeParse({ [clave]: 'dato-no-editable' }).success,
        `clave desconocida: ${clave}`
      ).toBe(false);
    }
  });

  it('[A1] objeto vacío → error con el mensaje "Indica al menos un dato para actualizar."', () => {
    const vacio = ActualizarMiPerfilSchema.safeParse({});
    expect(vacio.success).toBe(false);
    if (!vacio.success) {
      expect(vacio.error.issues.map((issue) => issue.message)).toContain(
        'Indica al menos un dato para actualizar.'
      );
    }
  });

  it('[A6] MiPerfilDTO describe la forma completa del perfil (solo compila si existe)', () => {
    const dto: MiPerfilDTO = {
      id: USUARIO_ID,
      email: 'ana@guachafit.com',
      rol: Rol.ALUMNO,
      correoPendiente: null,
      correoPendienteExpiraUtc: null,
      alumno: null,
      entrenador: null,
    };
    expect(dto.correoPendiente).toBeNull();
  });
});

// ============================================================================
// B. Migración 0017: columnas nuevas en `usuarios`
// (la expectativa del journal `0017` vive en arranque-migraciones-pendientes.spec.ts)
// ============================================================================
describe('RF-018 · B · columnas de la migración 0017 en usuarios (Drizzle)', () => {
  it('[B7] correoPendiente, tokenCambioCorreoHash y tokenCambioCorreoExpira existen y son opcionales', () => {
    const columnas = getTableColumns(usuarios) as Record<string, any>;

    expect(columnas.correoPendiente?.name).toBe('correo_pendiente');
    expect(columnas.correoPendiente?.dataType).toBe('string');
    expect(columnas.correoPendiente?.notNull).toBe(false);

    expect(columnas.tokenCambioCorreoHash?.name).toBe('token_cambio_correo_hash');
    expect(columnas.tokenCambioCorreoHash?.dataType).toBe('string');
    expect(columnas.tokenCambioCorreoHash?.notNull).toBe(false);

    expect(columnas.tokenCambioCorreoExpira?.name).toBe('token_cambio_correo_expira');
    expect(columnas.tokenCambioCorreoExpira?.dataType).toBe('date');
    expect(columnas.tokenCambioCorreoExpira?.notNull).toBe(false);
  });
});

// ============================================================================
// C/D. UsuariosService: perfil propio (lectura y edición por rol)
// ============================================================================
function usuarioBase(extra: Record<string, unknown> = {}) {
  return {
    id: USUARIO_ID,
    email: 'ana@guachafit.com',
    rol: Rol.ALUMNO,
    estado: EstadoUsuario.ACTIVO,
    activo: true,
    // Datos que NUNCA deben salir en el DTO.
    passwordHash: 'hash-secreto',
    tokenRecuperacionHash: 'recuperacion-secreto',
    tokenInvitacionHash: 'invitacion-secreto',
    tokenCambioCorreoHash: 'cambio-secreto',
    correoPendiente: null,
    tokenCambioCorreoExpira: null,
    ...extra,
  };
}

function perfilAlumnoBase(extra: Record<string, unknown> = {}) {
  return {
    id: PERFIL_ALUMNO_ID,
    usuarioId: USUARIO_ID,
    entrenadorId: COACH_ID,
    nombres: 'Ana',
    apellidos: 'Pérez',
    telefonoWhatsapp: '+584121234567',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '24123456',
    fechaNacimiento: '1998-05-14',
    zonaHoraria: 'America/Caracas',
    deletedAtUtc: null,
    ...extra,
  };
}

function perfilEntrenadorBase(extra: Record<string, unknown> = {}) {
  return {
    id: PERFIL_ENTRENADOR_ID,
    usuarioId: COACH_ID,
    nombres: 'Luis',
    apellidos: 'Pérez',
    nombreComercial: 'Gimnasio Luis',
    telefonoContacto: '+584149990000',
    ...extra,
  };
}

/**
 * Simula la base de datos de los datos del perfil. Las lecturas se resuelven por nombre de tabla
 * (como en `api4-recuperacion-password.spec.ts`) y las escrituras se aplican sobre el estado para
 * que una relectura posterior vea el cambio.
 */
function crearDbPerfil(opciones: {
  usuario?: any;
  perfilAlumno?: any;
  perfilEntrenador?: any;
}) {
  const estado = {
    usuario: opciones.usuario ?? null,
    perfilAlumno: opciones.perfilAlumno ?? null,
    perfilEntrenador: opciones.perfilEntrenador ?? null,
  };
  const actualizaciones: { tabla: string; valores: any }[] = [];

  const filasDe = (tabla: any): any[] => {
    const nombre = getTableName(tabla);
    if (nombre === 'usuarios') return estado.usuario ? [estado.usuario] : [];
    if (nombre === 'perfiles_alumno') return estado.perfilAlumno ? [estado.perfilAlumno] : [];
    if (nombre === 'perfiles_entrenador') return estado.perfilEntrenador ? [estado.perfilEntrenador] : [];
    return [];
  };

  const consulta = (filas: any[]): any => {
    const q: any = {
      innerJoin: () => q,
      leftJoin: () => q,
      where: () => q,
      orderBy: () => q,
      limit: () => Promise.resolve(filas),
      then: (resolver: any, rechazar: any) => Promise.resolve(filas).then(resolver, rechazar),
    };
    return q;
  };

  const db: any = {
    select: () => ({ from: (tabla: any) => consulta(filasDe(tabla)) }),
    update: (tabla: any) => ({
      set: (valores: any) => {
        const nombre = getTableName(tabla);
        actualizaciones.push({ tabla: nombre, valores });
        if (nombre === 'usuarios' && estado.usuario) Object.assign(estado.usuario, valores);
        if (nombre === 'perfiles_alumno' && estado.perfilAlumno) Object.assign(estado.perfilAlumno, valores);
        if (nombre === 'perfiles_entrenador' && estado.perfilEntrenador) {
          Object.assign(estado.perfilEntrenador, valores);
        }
        const filas = filasDe(tabla);
        return {
          where: () => ({
            returning: () => Promise.resolve(filas),
            then: (resolver: any, rechazar: any) => Promise.resolve([] as any[]).then(resolver, rechazar),
          }),
        };
      },
    }),
  };

  return { db, actualizaciones };
}

async function crearServicio(opciones: {
  usuario?: any;
  perfilAlumno?: any;
  perfilEntrenador?: any;
}) {
  const { db, actualizaciones } = crearDbPerfil(opciones);
  const contextos: any[] = [];
  const withTenant = vi.fn(async (contexto: any, fn: any) => {
    contextos.push(contexto);
    return fn(db);
  });
  const moduleRef = await Test.createTestingModule({
    providers: [
      UsuariosService,
      { provide: DRIZZLE_DB, useValue: db },
      { provide: WITH_TENANT, useValue: withTenant },
      { provide: CryptoService, useValue: { hashSha256: (texto: string) => `sha256-${texto}` } },
      {
        provide: EventEmitter2,
        useValue: { emitAsync: vi.fn(async () => [{ encolado: true, correoEnCamino: true }]) },
      },
    ],
  }).compile();
  return { servicio: moduleRef.get(UsuariosService), actualizaciones, contextos };
}

describe('RF-018 · C · UsuariosService.obtenerMiPerfil', () => {
  it('[C8] alumno: devuelve sus datos editables y de solo lectura, sin hashes', async () => {
    const { servicio } = await crearServicio({
      usuario: usuarioBase(),
      perfilAlumno: perfilAlumnoBase(),
    });

    const perfil = await servicio.obtenerMiPerfil(USUARIO_ID);

    expect(perfil).toEqual({
      id: USUARIO_ID,
      email: 'ana@guachafit.com',
      rol: Rol.ALUMNO,
      correoPendiente: null,
      correoPendienteExpiraUtc: null,
      alumno: {
        nombres: 'Ana',
        apellidos: 'Pérez',
        telefonoWhatsapp: '+584121234567',
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '24123456',
        fechaNacimiento: '1998-05-14',
        zonaHoraria: 'America/Caracas',
      },
      entrenador: null,
    });

    // Nunca viajan la contraseña ni los hashes de token.
    const json = JSON.stringify(perfil);
    for (const secreto of ['hash-secreto', 'recuperacion-secreto', 'invitacion-secreto', 'cambio-secreto']) {
      expect(json).not.toContain(secreto);
    }
    expect(json).not.toContain('passwordHash');
  });

  it('[C8] con un cambio de correo pendiente expone el correo y su vencimiento en ISO', async () => {
    const { servicio } = await crearServicio({
      usuario: usuarioBase({
        correoPendiente: 'nueva@guachafit.com',
        tokenCambioCorreoExpira: new Date('2026-10-07T12:00:00.000Z'),
      }),
      perfilAlumno: perfilAlumnoBase(),
    });

    const perfil = await servicio.obtenerMiPerfil(USUARIO_ID);

    expect(perfil.correoPendiente).toBe('nueva@guachafit.com');
    expect(perfil.correoPendienteExpiraUtc).toBe('2026-10-07T12:00:00.000Z');
  });

  it('[C8] entrenador: devuelve su ficha y `alumno: null`', async () => {
    const { servicio } = await crearServicio({
      usuario: usuarioBase({ id: COACH_ID, email: 'luis@guachafit.com', rol: Rol.ENTRENADOR }),
      perfilEntrenador: perfilEntrenadorBase(),
    });

    const perfil = await servicio.obtenerMiPerfil(COACH_ID);

    expect(perfil).toEqual({
      id: COACH_ID,
      email: 'luis@guachafit.com',
      rol: Rol.ENTRENADOR,
      correoPendiente: null,
      correoPendienteExpiraUtc: null,
      alumno: null,
      entrenador: {
        nombres: 'Luis',
        apellidos: 'Pérez',
        nombreComercial: 'Gimnasio Luis',
        telefonoContacto: '+584149990000',
      },
    });
  });

  it('[C8] superadmin: sin ficha (`alumno: null`, `entrenador: null`)', async () => {
    const { servicio } = await crearServicio({
      usuario: usuarioBase({ id: SUPERADMIN_ID, email: 'admin@guachafit.com', rol: Rol.SUPERADMIN }),
    });

    const perfil = await servicio.obtenerMiPerfil(SUPERADMIN_ID);

    expect(perfil.rol).toBe(Rol.SUPERADMIN);
    expect(perfil.alumno).toBeNull();
    expect(perfil.entrenador).toBeNull();
  });

  it('[S3] alumno sin ficha: el GET responde con `alumno: null` (no falla)', async () => {
    const { servicio } = await crearServicio({ usuario: usuarioBase() });

    const perfil = await servicio.obtenerMiPerfil(USUARIO_ID);

    expect(perfil.rol).toBe(Rol.ALUMNO);
    expect(perfil.alumno).toBeNull();
  });

  it('[S3] entrenador sin ficha: el GET responde con `entrenador: null`', async () => {
    const { servicio } = await crearServicio({
      usuario: usuarioBase({ id: COACH_ID, email: 'luis@guachafit.com', rol: Rol.ENTRENADOR }),
    });

    const perfil = await servicio.obtenerMiPerfil(COACH_ID);

    expect(perfil.rol).toBe(Rol.ENTRENADOR);
    expect(perfil.entrenador).toBeNull();
  });
});

describe('RF-018 · D · UsuariosService.actualizarMiPerfil', () => {
  it('[D10] alumno: guarda nombres/apellidos y el teléfono en `telefonoWhatsapp`', async () => {
    const { servicio, actualizaciones, contextos } = await crearServicio({
      usuario: usuarioBase(),
      perfilAlumno: perfilAlumnoBase(),
    });

    const actualizado = await servicio.actualizarMiPerfil(USUARIO_ID, {
      nombres: 'Ana María',
      telefono: '+584149998877',
    });

    expect(actualizaciones).toHaveLength(1);
    expect(actualizaciones[0].tabla).toBe('perfiles_alumno');
    expect(actualizaciones[0].valores).toMatchObject({
      nombres: 'Ana María',
      telefonoWhatsapp: '+584149998877',
    });
    expect(actualizaciones[0].valores).not.toHaveProperty('telefono');
    expect(actualizado.alumno?.nombres).toBe('Ana María');
    expect(actualizado.alumno?.telefonoWhatsapp).toBe('+584149998877');
    // RLS self del perfil del alumno (RNF-003): la escritura va con el contexto del propio usuario.
    expect(contextos).toContainEqual({ usuarioId: USUARIO_ID });
  });

  it('[D10][S3] alumno con `nombreComercial` (texto o `null`) → 400 MENSAJE_DATO_NO_EDITABLE y no escribe', async () => {
    for (const nombreComercial of ['Gimnasio Ana', null] as const) {
      const { servicio, actualizaciones } = await crearServicio({
        usuario: usuarioBase(),
        perfilAlumno: perfilAlumnoBase(),
      });

      const error = await servicio
        .actualizarMiPerfil(USUARIO_ID, { nombreComercial })
        .catch((e: unknown) => e);

      expect(error, `nombreComercial: ${nombreComercial}`).toMatchObject({
        status: 400,
        message: MENSAJE_DATO_NO_EDITABLE,
      });
      expect(actualizaciones).toEqual([]);
    }
  });

  it('[D11] entrenador: guarda el teléfono en `telefonoContacto` y `nombreComercial: null` lo borra', async () => {
    const { servicio, actualizaciones } = await crearServicio({
      usuario: usuarioBase({ id: COACH_ID, email: 'luis@guachafit.com', rol: Rol.ENTRENADOR }),
      perfilEntrenador: perfilEntrenadorBase(),
    });

    const actualizado = await servicio.actualizarMiPerfil(COACH_ID, {
      telefono: '+584141112233',
      nombreComercial: null,
    });

    expect(actualizaciones).toHaveLength(1);
    expect(actualizaciones[0].tabla).toBe('perfiles_entrenador');
    expect(actualizaciones[0].valores).toMatchObject({
      telefonoContacto: '+584141112233',
      nombreComercial: null,
    });
    expect(actualizaciones[0].valores).not.toHaveProperty('telefono');
    expect(actualizado.entrenador?.telefonoContacto).toBe('+584141112233');
    expect(actualizado.entrenador?.nombreComercial).toBeNull();
  });

  it('[D12] superadmin: cualquier campo → 400 MENSAJE_DATO_NO_EDITABLE y no escribe', async () => {
    for (const dto of [
      { nombres: 'Nuevo' },
      { apellidos: 'Nuevo' },
      { telefono: '+584141112233' },
      { nombreComercial: 'Negocio' },
    ]) {
      const { servicio, actualizaciones } = await crearServicio({
        usuario: usuarioBase({ id: SUPERADMIN_ID, email: 'admin@guachafit.com', rol: Rol.SUPERADMIN }),
      });

      const error = await servicio.actualizarMiPerfil(SUPERADMIN_ID, dto as any).catch((e: unknown) => e);

      expect(error).toMatchObject({ status: 400, message: MENSAJE_DATO_NO_EDITABLE });
      expect(actualizaciones).toEqual([]);
    }
  });

  it('[S2] ficha ausente: el UPDATE no afecta filas → 404 MENSAJE_FICHA_NO_ENCONTRADA', async () => {
    const { servicio, actualizaciones } = await crearServicio({ usuario: usuarioBase() });

    const error = await servicio
      .actualizarMiPerfil(USUARIO_ID, { nombres: 'Ana María' })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 404, message: MENSAJE_FICHA_NO_ENCONTRADA });
    // El UPDATE se intentó, pero sin ficha: la respuesta ya no finge un 200 exitoso.
    expect(actualizaciones).toHaveLength(1);
    expect(actualizaciones[0].tabla).toBe('perfiles_alumno');
  });
});

// ============================================================================
// C/D. Rutas HTTP /usuarios/me/perfil (Nest + supertest, servicio simulado)
// ============================================================================
const JWT_SECRET = process.env.JWT_SECRET || JWT_SECRET_DESARROLLO;

function token(rol: Rol, sub: string): string {
  return jwt.sign({ sub, email: 'cuenta@guachafit.com', rol }, JWT_SECRET, { expiresIn: '15m' });
}

async function crearApp(servicio: Record<string, unknown>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [UsuariosController],
    providers: [
      { provide: DRIZZLE_DB, useValue: {} },
      { provide: UsuariosService, useValue: servicio },
      { provide: AuthService, useValue: {} },
      { provide: CryptoService, useValue: {} },
      { provide: EventEmitter2, useValue: { emitAsync: vi.fn(async () => []) } },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configurarErroresGlobales(app);
  await app.init();
  return app;
}

function dtoAlumno(): MiPerfilDTO {
  return {
    id: USUARIO_ID,
    email: 'ana@guachafit.com',
    rol: Rol.ALUMNO,
    correoPendiente: null,
    correoPendienteExpiraUtc: null,
    alumno: {
      nombres: 'Ana',
      apellidos: 'Pérez',
      telefonoWhatsapp: '+584121234567',
      tipoDocumento: TipoDocumento.V,
      numeroDocumento: '24123456',
      fechaNacimiento: '1998-05-14',
      zonaHoraria: 'America/Caracas',
    },
    entrenador: null,
  };
}

describe('RF-018 · C · GET /usuarios/me/perfil', () => {
  it.each([
    ['Alumno', Rol.ALUMNO, USUARIO_ID],
    ['Entrenador', Rol.ENTRENADOR, COACH_ID],
    ['Superadmin', Rol.SUPERADMIN, SUPERADMIN_ID],
  ] as const)('%s → 200 con el MiPerfilDTO (el id sale del token)', async (_nombre, rol, sub) => {
    const servicio = { obtenerMiPerfil: vi.fn(async () => dtoAlumno()) };
    const app = await crearApp(servicio);

    const res = await request(app.getHttpServer())
      .get('/usuarios/me/perfil')
      .set('Authorization', `Bearer ${token(rol, sub)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(dtoAlumno());
    expect(servicio.obtenerMiPerfil).toHaveBeenCalledWith(sub);
    await app.close();
  });

  it('[C9] sin token → 401 con mensaje claro y el servicio nunca se invoca', async () => {
    const servicio = { obtenerMiPerfil: vi.fn(async () => dtoAlumno()) };
    const app = await crearApp(servicio);

    const res = await request(app.getHttpServer()).get('/usuarios/me/perfil');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe(MENSAJE_SESION_VENCIDA);
    expect(servicio.obtenerMiPerfil).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('RF-018 · D · PATCH /usuarios/me/perfil', () => {
  it('[D14] delega en el servicio con el id del token y el dto validado', async () => {
    const servicio = {
      actualizarMiPerfil: vi.fn(async () => dtoAlumno()),
      obtenerMiPerfil: vi.fn(async () => dtoAlumno()),
    };
    const app = await crearApp(servicio);

    const res = await request(app.getHttpServer())
      .patch('/usuarios/me/perfil')
      .set('Authorization', `Bearer ${token(Rol.ALUMNO, USUARIO_ID)}`)
      .send({ nombres: 'Carlos', apellidos: 'Mendoza', telefono: '+584141112233' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(dtoAlumno());
    expect(servicio.actualizarMiPerfil).toHaveBeenCalledWith(USUARIO_ID, {
      nombres: 'Carlos',
      apellidos: 'Mendoza',
      telefono: '+584141112233',
    });
    await app.close();
  });

  it('[D13] campos fuera del contrato → 400 y el servicio no se invoca', async () => {
    const caso = [
      ['numeroDocumento', '24123456'],
      ['fechaNacimiento', '1998-05-14'],
      ['email', 'otra@guachafit.com'],
      ['usuarioId', COACH_ID],
    ] as const;

    for (const [campo, valor] of caso) {
      const servicio = { actualizarMiPerfil: vi.fn(async () => dtoAlumno()) };
      const app = await crearApp(servicio);

      const res = await request(app.getHttpServer())
        .patch('/usuarios/me/perfil')
        .set('Authorization', `Bearer ${token(Rol.ALUMNO, USUARIO_ID)}`)
        .send({ [campo]: valor });

      expect(res.status, `campo ${campo}`).toBe(400);
      expect(servicio.actualizarMiPerfil).not.toHaveBeenCalled();
      await app.close();
    }
  });

  it('[C9/D14] sin token → 401 y el servicio nunca se invoca', async () => {
    const servicio = { actualizarMiPerfil: vi.fn(async () => dtoAlumno()) };
    const app = await crearApp(servicio);

    const res = await request(app.getHttpServer())
      .patch('/usuarios/me/perfil')
      .send({ nombres: 'Carlos' });

    expect(res.status).toBe(401);
    expect(servicio.actualizarMiPerfil).not.toHaveBeenCalled();
    await app.close();
  });
});
