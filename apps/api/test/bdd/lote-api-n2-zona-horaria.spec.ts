import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { BadRequestException, type INestApplication } from '@nestjs/common';
import {
  ActualizarPerfilAlumnoSchema,
  ActualizarZonaHorariaAlumnoSchema,
  EstadoAlumno,
  EstadoLicencia,
  EstadoUsuario,
  MENSAJE_ZONA_HORARIA_INVALIDA,
  Modalidad,
  Rol,
  TipoDocumento,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
  esZonaHorariaIanaValida,
} from '@guachafit/shared';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { JWT_SECRET_DESARROLLO } from '../../src/common/config/secretos-jwt';
import { configurarErroresGlobales } from '../../src/common/errores/filtro-errores-global';
import { parsearContrato } from '../../src/common/errores/parsear-contrato';
import { AlumnosController } from '../../src/modules/alumnos/alumnos.controller';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';
import { AuthService } from '../../src/modules/auth/auth.service';

/**
 * LOTE API-N2 (RF-002, decisión del dueño 2026-10-05) — criterio 1: zona horaria en el perfil del
 * alumno. Es la zona que decide la ventana del reporte diario (18:00–23:59) y el plazo de las
 * 12:00 del día siguiente. El alumno la consulta (`/auth/me`) y la cambia para sí mismo; su
 * entrenador la consulta y la cambia en la ficha (`GET`/`PATCH /alumnos/:id`).
 */

const COACH_ID = '11111111-1111-4111-8111-111111111111';
const COACH_AJENO_ID = '22222222-2222-4222-8222-222222222222';
const ALUMNO_USUARIO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ALUMNO_PERFIL_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUPERADMIN_ID = '50000000-0000-4000-8000-000000000001';

const mockCrypto = {
  encryptHealthRecord: (texto: string) => `encrypted:${texto}`,
  decryptHealthRecord: (texto: string) => texto.replace('encrypted:', ''),
} as any;

function perfilBase(extra: Record<string, unknown> = {}) {
  return {
    id: ALUMNO_PERFIL_ID,
    usuarioId: ALUMNO_USUARIO_ID,
    entrenadorId: COACH_ID,
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '24123456',
    nombres: 'Carlos',
    apellidos: 'Mendoza',
    email: 'carlos@guachafit.com',
    fechaNacimiento: '1998-05-14',
    telefonoWhatsapp: '+584121234567',
    modalidad: Modalidad.REMOTO,
    estadoActivacion: EstadoAlumno.ACTIVO,
    tasaFijadaOverride: null,
    fichaSaludPrivada: null,
    deletedAtUtc: null,
    createdAtUtc: '2026-01-01T00:00:00.000Z',
    updatedAtUtc: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

describe('LOTE API-N2 · zona horaria del alumno (contrato compartido)', () => {
  it('acepta zonas IANA reales y rechaza las inventadas o vacías', () => {
    expect(esZonaHorariaIanaValida('America/Caracas')).toBe(true);
    expect(esZonaHorariaIanaValida('Europe/Madrid')).toBe(true);
    expect(esZonaHorariaIanaValida('Asia/Tokyo')).toBe(true);
    expect(esZonaHorariaIanaValida('No/Existe')).toBe(false);
    expect(esZonaHorariaIanaValida('')).toBe(false);
    expect(esZonaHorariaIanaValida('   ')).toBe(false);
  });

  it('la zona por defecto es America/Caracas', () => {
    expect(ZONA_HORARIA_ALUMNO_POR_DEFECTO).toBe('America/Caracas');
  });

  it('el cambio propio exige una zona válida con mensaje claro', () => {
    expect(ActualizarZonaHorariaAlumnoSchema.parse({ zonaHoraria: 'Europe/Madrid' })).toEqual({
      zonaHoraria: 'Europe/Madrid',
    });
    expect(() => parsearContrato(ActualizarZonaHorariaAlumnoSchema, { zonaHoraria: 'Marte/Base' })).toThrow(
      new BadRequestException(MENSAJE_ZONA_HORARIA_INVALIDA)
    );
    expect(() => parsearContrato(ActualizarZonaHorariaAlumnoSchema, {})).toThrow(BadRequestException);
  });

  it('la ficha del coach admite la zona (opcional) y la valida igual', () => {
    expect(ActualizarPerfilAlumnoSchema.parse({ zonaHoraria: 'Asia/Tokyo' }).zonaHoraria).toBe('Asia/Tokyo');
    expect(ActualizarPerfilAlumnoSchema.parse({ nombres: 'Carlos' }).zonaHoraria).toBeUndefined();
    expect(() => parsearContrato(ActualizarPerfilAlumnoSchema, { zonaHoraria: 'Hora/Local' })).toThrow(
      new BadRequestException(MENSAJE_ZONA_HORARIA_INVALIDA)
    );
  });
});

describe('LOTE API-N2 · zona horaria en el servicio de alumnos', () => {
  /**
   * Mock mínimo: el perfil se lee con `innerJoin(usuarios)`; cualquier otra lectura (planes del
   * coach para hidratar el plan activo) responde vacía. Las escrituras se registran.
   */
  function dbParaPerfil(registro: any) {
    const actualizaciones: any[] = [];
    const db: any = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({ where: async () => (registro ? [{ ...registro }] : []) }),
          where: async () => [],
        }),
      }),
      update: () => ({
        set: (valores: any) => {
          actualizaciones.push(valores);
          return {
            where: () => ({
              returning: () => Promise.resolve(registro ? [{ ...registro, ...valores }] : []),
            }),
          };
        },
      }),
      transaction: async (cb: any) => cb(db),
      execute: async () => undefined,
    };
    return { db, actualizaciones };
  }

  it('la ficha expone la zona guardada y, si falta, la zona por defecto', () => {
    const servicio = new AlumnosService({} as any, mockCrypto);
    expect(
      servicio.sanitizarPerfilParaRol(perfilBase({ zonaHoraria: 'Europe/Madrid' }), Rol.ENTRENADOR)
        .zonaHoraria
    ).toBe('Europe/Madrid');
    expect(servicio.sanitizarPerfilParaRol(perfilBase(), Rol.ALUMNO).zonaHoraria).toBe('America/Caracas');
  });

  it('GET /alumnos/:id (coach dueño) devuelve la zona horaria del alumno', async () => {
    const { db } = dbParaPerfil(perfilBase({ zonaHoraria: 'Asia/Tokyo' }));
    const servicio = new AlumnosService(db, mockCrypto);
    const perfil = await servicio.obtenerPorId(ALUMNO_PERFIL_ID, COACH_ID, Rol.ENTRENADOR, COACH_ID);
    expect(perfil.zonaHoraria).toBe('Asia/Tokyo');
  });

  it('el coach dueño cambia la zona desde la ficha y la respuesta la refleja', async () => {
    const { db, actualizaciones } = dbParaPerfil(perfilBase());
    const servicio = new AlumnosService(db, mockCrypto);
    const perfil = await servicio.actualizarAlumno(COACH_ID, ALUMNO_PERFIL_ID, {
      zonaHoraria: 'Europe/Madrid',
    });
    expect(actualizaciones[0]).toMatchObject({ zonaHoraria: 'Europe/Madrid' });
    expect(perfil.zonaHoraria).toBe('Europe/Madrid');
  });

  it('otro entrenador no puede cambiar la zona: 403 y no se escribe nada', async () => {
    const { db, actualizaciones } = dbParaPerfil(perfilBase());
    const servicio = new AlumnosService(db, mockCrypto);
    await expect(
      servicio.actualizarAlumno(COACH_AJENO_ID, ALUMNO_PERFIL_ID, { zonaHoraria: 'Europe/Madrid' })
    ).rejects.toMatchObject({ status: 403 });
    expect(actualizaciones).toHaveLength(0);
  });

  it('el alumno cambia SU zona con el contexto propio (RLS self) y recibe la zona guardada', async () => {
    const { db, actualizaciones } = dbParaPerfil(perfilBase());
    const contextos: any[] = [];
    const withTenant = vi.fn(async (contexto: any, fn: any) => {
      contextos.push(contexto);
      return fn(db);
    });
    const servicio = new AlumnosService(db, mockCrypto, undefined, withTenant as any);

    const resultado = await servicio.actualizarZonaHorariaPropia(ALUMNO_USUARIO_ID, {
      zonaHoraria: 'America/Bogota',
    });

    expect(resultado).toEqual({ zonaHoraria: 'America/Bogota' });
    expect(contextos).toEqual([{ usuarioId: ALUMNO_USUARIO_ID }]);
    expect(actualizaciones[0]).toMatchObject({ zonaHoraria: 'America/Bogota' });
    expect(actualizaciones[0]).not.toHaveProperty('nombres');
  });

  it('el alumno sin perfil recibe 404 claro', async () => {
    const { db } = dbParaPerfil(null);
    const servicio = new AlumnosService(db, mockCrypto);
    await expect(
      servicio.actualizarZonaHorariaPropia(ALUMNO_USUARIO_ID, { zonaHoraria: 'America/Bogota' })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('LOTE API-N2 · /auth/me expone la zona horaria del alumno', () => {
  function dbSesion(respuestas: any[][]) {
    let indice = 0;
    const db: any = {
      select: vi.fn(() => {
        const resultado = respuestas[indice++] ?? [];
        const consulta: any = {
          from: vi.fn(() => consulta),
          innerJoin: vi.fn(() => consulta),
          where: vi.fn(() => ({
            limit: vi.fn(() => ({ then: (resolve: any) => resolve(resultado) })),
            then: (resolve: any) => resolve(resultado),
          })),
        };
        return consulta;
      }),
      execute: vi.fn(async () => undefined),
    };
    db.transaction = vi.fn(async (cb: any) => cb(db));
    return db;
  }

  const usuarioAlumno = {
    id: ALUMNO_USUARIO_ID,
    email: 'alumno@guachafit.com',
    rol: Rol.ALUMNO,
    estado: EstadoUsuario.ACTIVO,
    activo: true,
  };
  const coachOperable = [{ activo: true, estadoLicencia: EstadoLicencia.ACTIVA }];

  it('la sesión del alumno trae la zona de su perfil', async () => {
    const auth = new AuthService(
      dbSesion([
        [usuarioAlumno],
        [{ entrenadorId: COACH_ID, modalidad: Modalidad.REMOTO, zonaHoraria: 'Europe/Madrid', deletedAtUtc: null }],
        coachOperable,
      ]),
      mockCrypto
    );
    const sesion = await auth.obtenerSesion(ALUMNO_USUARIO_ID);
    expect(sesion.zonaHoraria).toBe('Europe/Madrid');
  });

  it('la sesión del entrenador no tiene zona de alumno (null)', async () => {
    const auth = new AuthService(
      dbSesion([
        [{ ...usuarioAlumno, id: COACH_ID, rol: Rol.ENTRENADOR }],
        [{ estadoLicencia: EstadoLicencia.ACTIVA, nombres: 'Marcos' }],
      ]),
      mockCrypto
    );
    const sesion = await auth.obtenerSesion(COACH_ID);
    expect(sesion.rol).toBe(Rol.ENTRENADOR);
    expect(sesion.zonaHoraria).toBeNull();
  });
});

describe('LOTE API-N2 · RBAC HTTP real de la zona horaria (Nest + supertest)', () => {
  const JWT_SECRET = process.env.JWT_SECRET || JWT_SECRET_DESARROLLO;

  function token(rol: Rol, sub: string): string {
    return jwt.sign({ sub, email: `${rol}@guachafit.com`, rol }, JWT_SECRET, { expiresIn: '15m' });
  }

  async function crearApp(servicio: Record<string, unknown>): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [AlumnosController],
      providers: [{ provide: AlumnosService, useValue: servicio }],
    })
      .overrideGuard(RolesGuard)
      .useValue(new RolesGuard(new Reflector()))
      .compile();
    const app = moduleRef.createNestApplication();
    configurarErroresGlobales(app);
    await app.init();
    return app;
  }

  function servicioFalso() {
    return {
      actualizarZonaHorariaPropia: vi.fn(async (_id: string, dto: any) => ({ zonaHoraria: dto.zonaHoraria })),
      actualizarAlumno: vi.fn(async (_coach: string, _id: string, dto: any) => ({ id: ALUMNO_PERFIL_ID, ...dto })),
    };
  }

  describe('PATCH /alumnos/me/zona-horaria (el alumno, para sí mismo)', () => {
    it('Alumno → 200 y se actualiza SU perfil (el id sale del token, nunca del cuerpo)', async () => {
      const servicio = servicioFalso();
      const app = await crearApp(servicio);
      const res = await request(app.getHttpServer())
        .patch('/alumnos/me/zona-horaria')
        .set('Authorization', `Bearer ${token(Rol.ALUMNO, ALUMNO_USUARIO_ID)}`)
        .send({ zonaHoraria: 'Europe/Madrid', usuarioId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ zonaHoraria: 'Europe/Madrid' });
      expect(servicio.actualizarZonaHorariaPropia).toHaveBeenCalledWith(ALUMNO_USUARIO_ID, {
        zonaHoraria: 'Europe/Madrid',
      });
      await app.close();
    });

    it('zona inválida → 400 con mensaje claro y sin escribir', async () => {
      const servicio = servicioFalso();
      const app = await crearApp(servicio);
      const res = await request(app.getHttpServer())
        .patch('/alumnos/me/zona-horaria')
        .set('Authorization', `Bearer ${token(Rol.ALUMNO, ALUMNO_USUARIO_ID)}`)
        .send({ zonaHoraria: 'Marte/Base' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(MENSAJE_ZONA_HORARIA_INVALIDA);
      expect(servicio.actualizarZonaHorariaPropia).not.toHaveBeenCalled();
      await app.close();
    });

    it.each([
      ['Entrenador', Rol.ENTRENADOR, COACH_ID],
      ['Superadmin', Rol.SUPERADMIN, SUPERADMIN_ID],
    ])('%s → 403 y el servicio nunca se invoca', async (_nombre, rol, sub) => {
      const servicio = servicioFalso();
      const app = await crearApp(servicio);
      const res = await request(app.getHttpServer())
        .patch('/alumnos/me/zona-horaria')
        .set('Authorization', `Bearer ${token(rol, sub)}`)
        .send({ zonaHoraria: 'Europe/Madrid' });
      expect(res.status).toBe(403);
      expect(servicio.actualizarZonaHorariaPropia).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe('PATCH /alumnos/:id con zonaHoraria (el entrenador, en la ficha)', () => {
    it('Entrenador → 200 con la zona validada', async () => {
      const servicio = servicioFalso();
      const app = await crearApp(servicio);
      const res = await request(app.getHttpServer())
        .patch(`/alumnos/${ALUMNO_PERFIL_ID}`)
        .set('Authorization', `Bearer ${token(Rol.ENTRENADOR, COACH_ID)}`)
        .send({ zonaHoraria: 'Asia/Tokyo' });
      expect(res.status).toBe(200);
      expect(servicio.actualizarAlumno).toHaveBeenCalledWith(COACH_ID, ALUMNO_PERFIL_ID, {
        zonaHoraria: 'Asia/Tokyo',
      });
      await app.close();
    });

    it.each([
      ['Alumno (incluido otro alumno)', Rol.ALUMNO, ALUMNO_USUARIO_ID],
      ['Superadmin', Rol.SUPERADMIN, SUPERADMIN_ID],
    ])('%s → 403 y el servicio nunca se invoca', async (_nombre, rol, sub) => {
      const servicio = servicioFalso();
      const app = await crearApp(servicio);
      const res = await request(app.getHttpServer())
        .patch(`/alumnos/${ALUMNO_PERFIL_ID}`)
        .set('Authorization', `Bearer ${token(rol, sub)}`)
        .send({ zonaHoraria: 'Asia/Tokyo' });
      expect(res.status).toBe(403);
      expect(servicio.actualizarAlumno).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
