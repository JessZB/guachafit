import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import { getTableName } from '@guachafit/database';
import {
  EstadoCuota,
  Rol,
} from '@guachafit/shared';
import { CarteraController } from '../../src/modules/finanzas/cartera.controller';
import {
  CarteraService,
  construirMensajeRecordatorioManual,
  HORAS_COOLDOWN_RECORDATORIO_MANUAL,
} from '../../src/modules/finanzas/cartera.service';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { JWT_SECRET_DESARROLLO } from '../../src/common/config/secretos-jwt';
import { configurarErroresGlobales } from '../../src/common/errores/filtro-errores-global';

const COACH_ID = '11111111-1111-4111-8111-111111111111';
const OTRO_COACH_ID = '33333333-3333-4333-8333-333333333333';
const CLIENTE_ID = '22222222-2222-4222-8222-222222222222';
const JWT_SECRET = process.env.JWT_SECRET || JWT_SECRET_DESARROLLO;

function token(rol: Rol, sub: string, entrenadorId?: string): string {
  return jwt.sign(
    {
      sub,
      email: `${rol.toLowerCase()}@guachafit.com`,
      rol,
      entrenadorId: entrenadorId ?? (rol === Rol.ENTRENADOR ? sub : undefined),
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

type RespuestaTabla = any[] | ((n: number) => any[]);

function crearMockDb(respuestas: Record<string, RespuestaTabla>) {
  const contadores: Record<string, number> = {};
  const predicados: any[] = [];

  const db: any = {
    select: vi.fn(() => ({
      from: vi.fn((table: any) => {
        const nombre = table ? getTableName(table) : '';
        contadores[nombre] = (contadores[nombre] ?? 0) + 1;
        const definicion = respuestas[nombre];
        const data =
          typeof definicion === 'function' ? definicion(contadores[nombre]) : definicion ?? [];

        const queryObj: any = {
          innerJoin: vi.fn(() => queryObj),
          leftJoin: vi.fn(() => queryObj),
          where: vi.fn((predicate: any) => {
            predicados.push(predicate);
            return queryObj;
          }),
          orderBy: vi.fn(() => queryObj),
          limit: vi.fn(() => queryObj),
          offset: vi.fn(() => queryObj),
          then: (resolve: any) => resolve(data),
        };
        return queryObj;
      }),
    })),
    transaction: vi.fn(async (fn: any) => fn(db)),
    execute: vi.fn(async () => undefined),
  };

  return { db, contadores, predicados };
}

function crearFinanzasFake(opciones: { tasaEfectiva?: string | null } = {}) {
  const tasaEfectiva = opciones.tasaEfectiva ?? '65.0000';
  const obtenerTasaVigente = vi.fn(async () => ({
    entrenadorId: COACH_ID,
    tasaOficialBcv: tasaEfectiva,
    tasaActivaEntrenador: tasaEfectiva,
    tasaAcordadaCliente: null,
    tasaEfectiva,
    esTasaOverride: false,
    fuente: tasaEfectiva ? 'entrenador_activa' : 'sin_configurar',
    fechaActualizacionUtc: null,
  }));
  const resolverComprobanteUrl = vi.fn(async () => 'https://r2.example/comprobante.webp');
  const proyectarVES = vi.fn((saldo: string, tasa: string) =>
    (Number(saldo) * Number(tasa)).toFixed(2)
  );

  return {
    finanzas: { obtenerTasaVigente, resolverComprobanteUrl, proyectarVES } as any,
    obtenerTasaVigente,
    resolverComprobanteUrl,
    proyectarVES,
  };
}

function crearEmisorFake(pushEnqueued = false) {
  const emitAsync = vi.fn(async () => [
    {
      inAppId: 'notif-1',
      pushEnqueued,
      emailEnqueued: false,
      activeDeviceTokensCount: pushEnqueued ? 1 : 0,
    },
  ]);
  return { emisor: { emitAsync } as any, emitAsync };
}

function dbRecordatorio(opciones: {
  perfil?: any[];
  cuota?: any[];
  ultimaGestion?: any[];
}) {
  return crearMockDb({
    perfiles_alumno: opciones.perfil ?? [
      { id: 'perfil-a', nombres: 'Juan', apellidos: 'Pérez' },
    ],
    cuotas_membresia:
      opciones.cuota ?? [
        {
          id: 'cuota-a',
          periodo: '2026-09',
          estado: EstadoCuota.VENCIDA,
          saldoPendienteUsd: '30.00',
        },
      ],
    notificaciones_in_app: opciones.ultimaGestion ?? [],
  });
}

async function crearApp(servicio: CarteraService): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [CarteraController],
    providers: [
      {
        provide: CarteraService,
        useValue: servicio,
      },
    ],
  })
    .overrideGuard(RolesGuard)
    .useValue(new RolesGuard(new Reflector()))
    .compile();

  const app = moduleRef.createNestApplication();
  configurarErroresGlobales(app);

  // Debido a que Vitest/esbuild no emite metadata de tipos para CarteraController,
  // aseguramos que la instancia del controlador tenga su dependencia asignada.
  const controller = app.get(CarteraController);
  (controller as any).carteraService = servicio;

  await app.init();
  return app;
}

describe('RF-009 / UX-09a · Vista previa del recordatorio manual de cobro', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  // ===========================================================================
  // B · GET /finanzas/cartera/clientes/:clienteId/recordatorio/vista-previa
  // ===========================================================================
  describe('B · HTTP GET /finanzas/cartera/clientes/:clienteId/recordatorio/vista-previa', () => {
    it('B1 · listo: alumno con cuota abierta con saldo responde 200 con puedeEnviar true y texto exacto', async () => {
      const { db } = dbRecordatorio({});
      const { finanzas } = crearFinanzasFake({ tasaEfectiva: '65.0000' });
      const { emisor } = crearEmisorFake();
      const servicio = new CarteraService(db, finanzas, emisor);
      app = await crearApp(servicio);

      const res = await request(app.getHttpServer())
        .get(`/finanzas/cartera/clientes/${CLIENTE_ID}/recordatorio/vista-previa`)
        .set('Authorization', `Bearer ${token(Rol.ENTRENADOR, COACH_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.puedeEnviar).toBe(true);
      expect(res.body.motivo).toBe('listo');
      expect(res.body.titulo).toBe('Recordatorio de pago');

      const mensajeEsperado = construirMensajeRecordatorioManual({
        nombre: 'Juan',
        saldoPendienteUsd: '30.00',
        saldoPendienteBs: '1950.00',
        periodo: '2026-09',
      });
      expect(res.body.cuerpo).toBe(mensajeEsperado.cuerpo);
      expect(res.body.saldoPendienteUsd).toBe('30.00');
      expect(res.body.saldoPendienteBs).toBe('1950.00');
    });

    it('B2 · no envía nada: no despacha notificaciones ni emite eventos', async () => {
      const { db } = dbRecordatorio({});
      const { finanzas } = crearFinanzasFake({ tasaEfectiva: '65.0000' });
      const { emisor, emitAsync } = crearEmisorFake();
      const servicio = new CarteraService(db, finanzas, emisor);
      app = await crearApp(servicio);

      const res = await request(app.getHttpServer())
        .get(`/finanzas/cartera/clientes/${CLIENTE_ID}/recordatorio/vista-previa`)
        .set('Authorization', `Bearer ${token(Rol.ENTRENADOR, COACH_ID)}`);

      expect(res.status).toBe(200);
      expect(emitAsync).not.toHaveBeenCalled();
    });

    it('B3 · mismo texto que el envío: el cuerpo coincide con mensajeSugerido del POST posterior', async () => {
      const { db } = dbRecordatorio({});
      const { finanzas } = crearFinanzasFake({ tasaEfectiva: '65.0000' });
      const { emisor } = crearEmisorFake();
      const servicio = new CarteraService(db, finanzas, emisor);
      app = await crearApp(servicio);

      const resVistaPrevia = await request(app.getHttpServer())
        .get(`/finanzas/cartera/clientes/${CLIENTE_ID}/recordatorio/vista-previa`)
        .set('Authorization', `Bearer ${token(Rol.ENTRENADOR, COACH_ID)}`);

      const resEnvio = await request(app.getHttpServer())
        .post(`/finanzas/cartera/clientes/${CLIENTE_ID}/recordatorio`)
        .set('Authorization', `Bearer ${token(Rol.ENTRENADOR, COACH_ID)}`);

      expect(resVistaPrevia.status).toBe(200);
      expect(resEnvio.status).toBe(200);
      expect(resVistaPrevia.body.cuerpo).toBe(resEnvio.body.mensajeSugerido);
    });

    it('B4 · sin saldo: puedeEnviar false, motivo sin_saldo_pendiente, titulo y cuerpo null', async () => {
      const { db } = dbRecordatorio({ cuota: [] });
      const { finanzas } = crearFinanzasFake();
      const { emisor } = crearEmisorFake();
      const servicio = new CarteraService(db, finanzas, emisor);
      app = await crearApp(servicio);

      const res = await request(app.getHttpServer())
        .get(`/finanzas/cartera/clientes/${CLIENTE_ID}/recordatorio/vista-previa`)
        .set('Authorization', `Bearer ${token(Rol.ENTRENADOR, COACH_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.puedeEnviar).toBe(false);
      expect(res.body.motivo).toBe('sin_saldo_pendiente');
      expect(res.body.titulo).toBeNull();
      expect(res.body.cuerpo).toBeNull();
      expect(res.body.mensaje).toContain('no tiene saldo pendiente: no hay nada que recordar');
    });

    it('B5 · pago en revisión: puedeEnviar false, motivo pausa_revision y cuerpo null', async () => {
      const { db } = dbRecordatorio({
        cuota: [
          {
            id: 'cuota-a',
            periodo: '2026-09',
            estado: EstadoCuota.PENDIENTE_REVISION,
            saldoPendienteUsd: '30.00',
          },
        ],
      });
      const { finanzas } = crearFinanzasFake();
      const { emisor } = crearEmisorFake();
      const servicio = new CarteraService(db, finanzas, emisor);
      app = await crearApp(servicio);

      const res = await request(app.getHttpServer())
        .get(`/finanzas/cartera/clientes/${CLIENTE_ID}/recordatorio/vista-previa`)
        .set('Authorization', `Bearer ${token(Rol.ENTRENADOR, COACH_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.puedeEnviar).toBe(false);
      expect(res.body.motivo).toBe('pausa_revision');
      expect(res.body.cuerpo).toBeNull();
      expect(res.body.mensaje).toContain('tiene un pago en verificación: los recordatorios se pausan');
    });

    it('B6 · cooldown: tras un envío reciente puedeEnviar false, motivo cooldown_activo y proximoPermitidoUtc', async () => {
      const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
      const { db } = dbRecordatorio({ ultimaGestion: [{ createdAtUtc: haceUnaHora }] });
      const { finanzas } = crearFinanzasFake({ tasaEfectiva: '65.0000' });
      const { emisor } = crearEmisorFake();
      const servicio = new CarteraService(db, finanzas, emisor);
      app = await crearApp(servicio);

      const res = await request(app.getHttpServer())
        .get(`/finanzas/cartera/clientes/${CLIENTE_ID}/recordatorio/vista-previa`)
        .set('Authorization', `Bearer ${token(Rol.ENTRENADOR, COACH_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.puedeEnviar).toBe(false);
      expect(res.body.motivo).toBe('cooldown_activo');
      expect(res.body.cuerpo).toBeNull();
      expect(res.body.mensaje).toContain(`hace menos de ${HORAS_COOLDOWN_RECORDATORIO_MANUAL} horas`);
      expect(res.body.proximoPermitidoUtc).toBe(
        new Date(haceUnaHora.getTime() + HORAS_COOLDOWN_RECORDATORIO_MANUAL * 3600 * 1000).toISOString()
      );
    });

    describe('B7 · Seguridad y validación de transporte', () => {
      it('B7a: con otro entrenador (alumno no en su cartera) responde 404 con mensaje claro', async () => {
        const { db } = dbRecordatorio({ perfil: [] });
        const { finanzas } = crearFinanzasFake();
        const { emisor } = crearEmisorFake();
        const servicio = new CarteraService(db, finanzas, emisor);
        app = await crearApp(servicio);

        const res = await request(app.getHttpServer())
          .get(`/finanzas/cartera/clientes/${CLIENTE_ID}/recordatorio/vista-previa`)
          .set('Authorization', `Bearer ${token(Rol.ENTRENADOR, OTRO_COACH_ID)}`);

        expect(res.status).toBe(404);
        expect(res.body.message).toContain('no existe o no pertenece a tu cartera');
      });

      it('B7b: clienteId que no es UUID responde 400', async () => {
        const { db } = dbRecordatorio({});
        const { finanzas } = crearFinanzasFake();
        const { emisor } = crearEmisorFake();
        const servicio = new CarteraService(db, finanzas, emisor);
        app = await crearApp(servicio);

        const res = await request(app.getHttpServer())
          .get('/finanzas/cartera/clientes/no-es-un-uuid/recordatorio/vista-previa')
          .set('Authorization', `Bearer ${token(Rol.ENTRENADOR, COACH_ID)}`);

        expect(res.status).toBe(400);
      });

      it('B7c: sin token responde 401', async () => {
        const { db } = dbRecordatorio({});
        const { finanzas } = crearFinanzasFake();
        const { emisor } = crearEmisorFake();
        const servicio = new CarteraService(db, finanzas, emisor);
        app = await crearApp(servicio);

        const res = await request(app.getHttpServer()).get(
          `/finanzas/cartera/clientes/${CLIENTE_ID}/recordatorio/vista-previa`
        );

        expect(res.status).toBe(401);
      });

      it('B7d: con rol ALUMNO responde 403', async () => {
        const { db } = dbRecordatorio({});
        const { finanzas } = crearFinanzasFake();
        const { emisor } = crearEmisorFake();
        const servicio = new CarteraService(db, finanzas, emisor);
        app = await crearApp(servicio);

        const res = await request(app.getHttpServer())
          .get(`/finanzas/cartera/clientes/${CLIENTE_ID}/recordatorio/vista-previa`)
          .set('Authorization', `Bearer ${token(Rol.ALUMNO, CLIENTE_ID)}`);

        expect(res.status).toBe(403);
      });
    });

    it('B8 · el envío existente no cambia: POST clientes/:clienteId/recordatorio sigue funcionando', async () => {
      const { db } = dbRecordatorio({});
      const { finanzas } = crearFinanzasFake({ tasaEfectiva: '65.0000' });
      const { emisor } = crearEmisorFake();
      const servicio = new CarteraService(db, finanzas, emisor);
      app = await crearApp(servicio);

      const res = await request(app.getHttpServer())
        .post(`/finanzas/cartera/clientes/${CLIENTE_ID}/recordatorio`)
        .set('Authorization', `Bearer ${token(Rol.ENTRENADOR, COACH_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.enviado).toBe(true);
      expect(res.body.motivo).toBe('despachado');
      expect(res.body.saldoPendienteUsd).toBe('30.00');
      expect(res.body.saldoPendienteBs).toBe('1950.00');
    });
  });

  // ===========================================================================
  // C · Fachada CarteraService (evaluación y tenancy)
  // ===========================================================================
  describe('C · Fachada CarteraService.obtenerVistaPreviaRecordatorio', () => {
    it('C1 · caso listo: devuelve evaluación completa sin emitir eventos al bus', async () => {
      const { db } = dbRecordatorio({});
      const { finanzas } = crearFinanzasFake({ tasaEfectiva: '65.0000' });
      const { emisor, emitAsync } = crearEmisorFake();
      const servicio = new CarteraService(db, finanzas, emisor);

      const resultado = await servicio.obtenerVistaPreviaRecordatorio(
        COACH_ID,
        CLIENTE_ID
      );

      expect(resultado.puedeEnviar).toBe(true);
      expect(resultado.motivo).toBe('listo');
      expect(resultado.saldoPendienteUsd).toBe('30.00');
      expect(resultado.saldoPendienteBs).toBe('1950.00');
      expect(resultado.titulo).toBe('Recordatorio de pago');
      expect(resultado.cuerpo).toContain('$30.00 USD');
      expect(resultado.cuerpo).toContain('Bs. 1950.00');
      expect(emitAsync).not.toHaveBeenCalled();
    });

    it('C2 · casos bloqueados: sin saldo, pago en revisión, cooldown y 404 fuera de cartera', async () => {
      // 1. Sin saldo
      const { db: dbSinSaldo } = dbRecordatorio({ cuota: [] });
      const { finanzas } = crearFinanzasFake();
      const servicioSinSaldo = new CarteraService(dbSinSaldo, finanzas);
      const resSinSaldo = await servicioSinSaldo.obtenerVistaPreviaRecordatorio(
        COACH_ID,
        CLIENTE_ID
      );
      expect(resSinSaldo.puedeEnviar).toBe(false);
      expect(resSinSaldo.motivo).toBe('sin_saldo_pendiente');
      expect(resSinSaldo.cuerpo).toBeNull();

      // 2. Pago en revisión
      const { db: dbRevision } = dbRecordatorio({
        cuota: [
          {
            id: 'cuota-a',
            periodo: '2026-09',
            estado: EstadoCuota.PENDIENTE_REVISION,
            saldoPendienteUsd: '30.00',
          },
        ],
      });
      const servicioRevision = new CarteraService(dbRevision, finanzas);
      const resRevision = await servicioRevision.obtenerVistaPreviaRecordatorio(
        COACH_ID,
        CLIENTE_ID
      );
      expect(resRevision.puedeEnviar).toBe(false);
      expect(resRevision.motivo).toBe('pausa_revision');
      expect(resRevision.cuerpo).toBeNull();

      // 3. Cooldown
      const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
      const { db: dbCooldown } = dbRecordatorio({ ultimaGestion: [{ createdAtUtc: haceUnaHora }] });
      const servicioCooldown = new CarteraService(dbCooldown, finanzas);
      const resCooldown = await servicioCooldown.obtenerVistaPreviaRecordatorio(
        COACH_ID,
        CLIENTE_ID
      );
      expect(resCooldown.puedeEnviar).toBe(false);
      expect(resCooldown.motivo).toBe('cooldown_activo');
      expect(resCooldown.cuerpo).toBeNull();
      expect(resCooldown.proximoPermitidoUtc).not.toBeNull();

      // 4. Fuera de cartera
      const { db: dbAjeno } = dbRecordatorio({ perfil: [] });
      const servicioAjeno = new CarteraService(dbAjeno, finanzas);
      await expect(
        servicioAjeno.obtenerVistaPreviaRecordatorio(COACH_ID, 'user-ajeno')
      ).rejects.toThrow(/no existe o no pertenece a tu cartera/);
    });

    it('C3 · tenancy de la vista previa: withTenant recibe entrenadorId y encapsula la lectura de perfiles_alumno', async () => {
      const { db: dbExterior, contadores: contadoresExterior } = dbRecordatorio({});
      const { db: dbTx, contadores: contadoresTx } = dbRecordatorio({});
      const withTenant = vi.fn(async (_context: { entrenadorId: string }, fn: (tx: any) => Promise<any>) => {
        return fn(dbTx);
      });
      const { finanzas } = crearFinanzasFake({ tasaEfectiva: '65.0000' });
      const { emisor } = crearEmisorFake();

      const servicio = new CarteraService(dbExterior, finanzas, emisor, withTenant);

      const resultado = await servicio.obtenerVistaPreviaRecordatorio(
        COACH_ID,
        CLIENTE_ID
      );

      expect(resultado.puedeEnviar).toBe(true);

      // 1. withTenant se llamó al menos una vez
      expect(withTenant).toHaveBeenCalled();

      // 2. TODAS sus llamadas recibieron { entrenadorId: COACH_ID }
      for (const llamada of withTenant.mock.calls) {
        expect(llamada[0]).toEqual({ entrenadorId: COACH_ID });
      }

      // 3. La lectura de perfiles_alumno ocurrió DENTRO de withTenant (en dbTx) y NO en ctx.db exterior
      expect(contadoresTx['perfiles_alumno']).toBeGreaterThanOrEqual(1);
      expect(contadoresExterior['perfiles_alumno'] ?? 0).toBe(0);
    });

    it('C4 · tenancy del envío: withTenant recibe entrenadorId y encapsula la lectura de perfiles_alumno', async () => {
      const { db: dbExterior, contadores: contadoresExterior } = dbRecordatorio({});
      const { db: dbTx, contadores: contadoresTx } = dbRecordatorio({});
      const withTenant = vi.fn(async (_context: { entrenadorId: string }, fn: (tx: any) => Promise<any>) => {
        return fn(dbTx);
      });
      const { finanzas } = crearFinanzasFake({ tasaEfectiva: '65.0000' });
      const { emisor, emitAsync } = crearEmisorFake();

      const servicio = new CarteraService(dbExterior, finanzas, emisor, withTenant);

      const resultado = await servicio.enviarRecordatorioManual(
        COACH_ID,
        CLIENTE_ID
      );

      expect(resultado.enviado).toBe(true);
      expect(emitAsync).toHaveBeenCalledTimes(1);

      // 1. withTenant se llamó al menos una vez
      expect(withTenant).toHaveBeenCalled();

      // 2. TODAS sus llamadas recibieron { entrenadorId: COACH_ID }
      for (const llamada of withTenant.mock.calls) {
        expect(llamada[0]).toEqual({ entrenadorId: COACH_ID });
      }

      // 3. La lectura de perfiles_alumno ocurrió DENTRO de withTenant (en dbTx) y NO en ctx.db exterior
      expect(contadoresTx['perfiles_alumno']).toBeGreaterThanOrEqual(1);
      expect(contadoresExterior['perfiles_alumno'] ?? 0).toBe(0);
    });
  });
});
