import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { Rol } from '@guachafit/shared';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { EntrenadorController } from '../../src/modules/entrenador/entrenador.controller';
import { EntrenadorService } from '../../src/modules/entrenador/entrenador.service';
import { JWT_SECRET_DESARROLLO } from '../../src/common/config/secretos-jwt';
import { configurarErroresGlobales } from '../../src/common/errores/filtro-errores-global';

describe('D17 · Tarea 4: Controlador EntrenadorController HTTP (POST /captacion/rotar, PATCH /captacion, GET /perfil)', () => {
  const JWT_SECRET = process.env.JWT_SECRET || JWT_SECRET_DESARROLLO;
  const COACH_ID = '11111111-1111-4111-8111-111111111111';
  const ALUMNO_ID = '22222222-2222-4222-8222-222222222222';
  const SUPERADMIN_ID = '33333333-3333-4333-8333-333333333333';

  let app: INestApplication;
  let mockEntrenadorService: any;

  function crearToken(sub: string, rol: Rol, entrenadorId?: string) {
    return jwt.sign(
      {
        sub,
        email: `${rol.toLowerCase()}@guachafit.com`,
        rol,
        entrenadorId: entrenadorId || (rol === Rol.ENTRENADOR ? sub : undefined),
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
  }

  beforeEach(async () => {
    mockEntrenadorService = {
      obtenerPerfil: vi.fn().mockResolvedValue({
        id: 'perfil-coach-1',
        usuarioId: COACH_ID,
        nombres: 'Carlos',
        apellidos: 'Entrenador',
        nombreComercial: 'Carlos Gym',
        coachCode: 'CARLOS01',
        estadoLicencia: 'ACTIVA',
        capacidadMaxima: 50,
        telefonoContacto: '+584121234567',
        // D17 campos nuevos:
        captacionActiva: true,
        enlaceRotadoEnUtc: '2026-11-04T10:00:00.000Z',
        registrosPorEnlace: 5,
      }),
      obtenerDashboardComando: vi.fn().mockResolvedValue({}),
      rotarEnlaceCaptacion: vi.fn().mockResolvedValue({
        coachCode: 'NUEVO001',
        captacionActiva: true,
        enlaceRotadoEnUtc: new Date().toISOString(),
        registrosPorEnlace: 0,
        cambioAplicado: true,
        mensaje: 'Tu enlace anterior dejó de funcionar. Comparte el nuevo.',
      }),
      actualizarCaptacion: vi.fn().mockImplementation((_coachId: string, dto: any) =>
        Promise.resolve({
          coachCode: 'CARLOS01',
          captacionActiva: dto.activa,
          enlaceRotadoEnUtc: null,
          registrosPorEnlace: 2,
          cambioAplicado: true,
          mensaje: dto.activa ? 'Captación reanudada.' : 'Captación pausada. Tu enlace no admite nuevos registros.',
        })
      ),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [EntrenadorController],
      providers: [
        {
          provide: EntrenadorService,
          useValue: mockEntrenadorService,
        },
        Reflector,
        RolesGuard,
        JwtAuthGuard,
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue(new RolesGuard(new Reflector()))
      .compile();

    app = moduleRef.createNestApplication();
    configurarErroresGlobales(app);
    const controller = app.get(EntrenadorController);
    (controller as any).entrenadorService = mockEntrenadorService;
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('4.1 POST /entrenador/captacion/rotar', () => {
    it('sin token de autenticación responde 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer()).post('/entrenador/captacion/rotar');
      expect(res.status).toBe(401);
    });

    it('con rol ALUMNO responde 403 Forbidden', async () => {
      const token = crearToken(ALUMNO_ID, Rol.ALUMNO);
      const res = await request(app.getHttpServer())
        .post('/entrenador/captacion/rotar')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('con rol SUPERADMIN responde 403 Forbidden', async () => {
      const token = crearToken(SUPERADMIN_ID, Rol.SUPERADMIN);
      const res = await request(app.getHttpServer())
        .post('/entrenador/captacion/rotar')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('con rol ENTRENADOR responde 200 OK y ejecuta la rotación', async () => {
      const token = crearToken(COACH_ID, Rol.ENTRENADOR);
      const res = await request(app.getHttpServer())
        .post('/entrenador/captacion/rotar')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(mockEntrenadorService.rotarEnlaceCaptacion).toHaveBeenCalledWith(COACH_ID);
      expect(res.body).toMatchObject({
        coachCode: 'NUEVO001',
        cambioAplicado: true,
        mensaje: 'Tu enlace anterior dejó de funcionar. Comparte el nuevo.',
      });
    });
  });

  describe('4.2 PATCH /entrenador/captacion', () => {
    it('sin token de autenticación responde 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .patch('/entrenador/captacion')
        .send({ activa: false });
      expect(res.status).toBe(401);
    });

    it('con rol ALUMNO responde 403 Forbidden', async () => {
      const token = crearToken(ALUMNO_ID, Rol.ALUMNO);
      const res = await request(app.getHttpServer())
        .patch('/entrenador/captacion')
        .set('Authorization', `Bearer ${token}`)
        .send({ activa: false });
      expect(res.status).toBe(403);
    });

    it('con rol SUPERADMIN responde 403 Forbidden', async () => {
      const token = crearToken(SUPERADMIN_ID, Rol.SUPERADMIN);
      const res = await request(app.getHttpServer())
        .patch('/entrenador/captacion')
        .set('Authorization', `Bearer ${token}`)
        .send({ activa: false });
      expect(res.status).toBe(403);
    });

    it('con cuerpo sin "activa" responde 400 Bad Request', async () => {
      const token = crearToken(COACH_ID, Rol.ENTRENADOR);
      const res = await request(app.getHttpServer())
        .patch('/entrenador/captacion')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
      expect(mockEntrenadorService.actualizarCaptacion).not.toHaveBeenCalled();
    });

    it('con cuerpo con "activa" no booleano (string) responde 400 Bad Request', async () => {
      const token = crearToken(COACH_ID, Rol.ENTRENADOR);
      const res = await request(app.getHttpServer())
        .patch('/entrenador/captacion')
        .set('Authorization', `Bearer ${token}`)
        .send({ activa: 'false' });
      expect(res.status).toBe(400);
      expect(mockEntrenadorService.actualizarCaptacion).not.toHaveBeenCalled();
    });

    it('con cuerpo con "activa" no booleano (número) responde 400 Bad Request', async () => {
      const token = crearToken(COACH_ID, Rol.ENTRENADOR);
      const res = await request(app.getHttpServer())
        .patch('/entrenador/captacion')
        .set('Authorization', `Bearer ${token}`)
        .send({ activa: 1 });
      expect(res.status).toBe(400);
      expect(mockEntrenadorService.actualizarCaptacion).not.toHaveBeenCalled();
    });

    it('con cuerpo válido { activa: false } responde 200 OK y ejecuta la actualización', async () => {
      const token = crearToken(COACH_ID, Rol.ENTRENADOR);
      const res = await request(app.getHttpServer())
        .patch('/entrenador/captacion')
        .set('Authorization', `Bearer ${token}`)
        .send({ activa: false });

      expect(res.status).toBe(200);
      expect(mockEntrenadorService.actualizarCaptacion).toHaveBeenCalledWith(COACH_ID, {
        activa: false,
      });
      expect(res.body).toMatchObject({
        captacionActiva: false,
        cambioAplicado: true,
      });
    });

    it('con cuerpo válido { activa: true } responde 200 OK y ejecuta la actualización', async () => {
      const token = crearToken(COACH_ID, Rol.ENTRENADOR);
      const res = await request(app.getHttpServer())
        .patch('/entrenador/captacion')
        .set('Authorization', `Bearer ${token}`)
        .send({ activa: true });

      expect(res.status).toBe(200);
      expect(mockEntrenadorService.actualizarCaptacion).toHaveBeenCalledWith(COACH_ID, {
        activa: true,
      });
      expect(res.body).toMatchObject({
        captacionActiva: true,
        cambioAplicado: true,
      });
    });
  });

  describe('4.3 GET /entrenador/perfil incluye campos de captación', () => {
    it('responde 200 OK e incluye captacionActiva, enlaceRotadoEnUtc y registrosPorEnlace', async () => {
      const token = crearToken(COACH_ID, Rol.ENTRENADOR);
      const res = await request(app.getHttpServer())
        .get('/entrenador/perfil')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(mockEntrenadorService.obtenerPerfil).toHaveBeenCalledWith(COACH_ID);

      // Verificamos los campos nuevos del contrato D17
      expect(res.body).toHaveProperty('captacionActiva');
      expect(typeof res.body.captacionActiva).toBe('boolean');

      expect(res.body).toHaveProperty('enlaceRotadoEnUtc');
      expect(typeof res.body.enlaceRotadoEnUtc === 'string' || res.body.enlaceRotadoEnUtc === null).toBe(true);

      expect(res.body).toHaveProperty('registrosPorEnlace');
      expect(typeof res.body.registrosPorEnlace).toBe('number');
    });
  });
});
