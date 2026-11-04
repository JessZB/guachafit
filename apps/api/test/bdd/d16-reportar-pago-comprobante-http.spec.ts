import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { getTableName } from '@guachafit/database';
import {
  EstadoCuota,
  MetodoPago,
  Moneda,
  Rol,
} from '@guachafit/shared';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { DRIZZLE_DB } from '../../src/database/database.module';
import { FinanzasController } from '../../src/modules/finanzas/finanzas.controller';
import { FinanzasService } from '../../src/modules/finanzas/finanzas.service';
import { JWT_SECRET_DESARROLLO } from '../../src/common/config/secretos-jwt';
import { configurarErroresGlobales } from '../../src/common/errores/filtro-errores-global';

describe('D16 / Ítem 23: Validación de comprobanteStorageKey en POST /finanzas/cuotas/:id/reportar-pago (Nivel HTTP)', () => {
  const JWT_SECRET = process.env.JWT_SECRET || JWT_SECRET_DESARROLLO;
  const ALUMNO_ID = '11111111-1111-4111-8111-111111111111';
  const OTRO_ALUMNO_ID = '22222222-2222-4222-8222-222222222222';
  const COACH_ID = '99999999-9999-4999-8999-999999999999';
  const CUOTA_ID = 'cuota-d16-http-1';
  const UUID_COMPROBANTE = '44444444-4444-4444-8444-444444444444';

  let app: INestApplication;
  let mockDb: any;

  function tokenParaUsuario(sub: string, rol: Rol) {
    return jwt.sign(
      { sub, email: `${rol.toLowerCase()}@guachafit.com`, rol, entrenadorId: COACH_ID },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
  }

  beforeEach(async () => {
    const cuotaMock = {
      id: CUOTA_ID,
      clienteId: ALUMNO_ID,
      entrenadorId: COACH_ID,
      planId: 'plan-uuid-1',
      periodo: '2026-11',
      montoTotalUsd: '50.00',
      montoAbonadoUsd: '0.00',
      saldoPendienteUsd: '50.00',
      fechaEmisionUtc: new Date(),
      fechaCorteUtc: new Date(Date.now() + 15 * 86400000),
      estado: EstadoCuota.EMITIDA,
    };

    const tasaMock = {
      id: 'tasa-uuid-1',
      entrenadorId: COACH_ID,
      tasaOficialBcv: '60.0000',
      tasaParalelo: '65.0000',
      tasaActivaEntrenador: '60.0000',
      fuente: 'entrenador_activa',
      fechaActualizacionUtc: new Date(),
    };

    mockDb = {
      select: vi.fn(() => ({
        from: vi.fn((table: any) => {
          const tableName = table ? getTableName(table) : '';
          const queryObj: any = {
            where: vi.fn(() => queryObj),
            orderBy: vi.fn(() => queryObj),
            limit: vi.fn(() => queryObj),
            offset: vi.fn(() => queryObj),
            for: vi.fn(() => queryObj),
            then: (resolve: any) => {
              if (tableName === 'cuotas_membresia') {
                return resolve([{ ...cuotaMock }]);
              }
              if (tableName === 'tasas_cambio_referencia') {
                return resolve([{ ...tasaMock }]);
              }
              if (tableName === 'transacciones_pago') {
                return resolve([]);
              }
              return resolve([]);
            },
          };
          return queryObj;
        }),
      })),
      insert: vi.fn((table: any) => ({
        values: vi.fn((vals: any) => {
          const record = {
            id: vals.id || `tx-uuid-${Date.now()}`,
            ...vals,
            createdAtUtc: vals.createdAtUtc || new Date(),
            updatedAtUtc: vals.updatedAtUtc || new Date(),
          };
          return {
            returning: vi.fn().mockResolvedValue([record]),
            then: (resolve: any) => resolve([record]),
          };
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ ...cuotaMock, estado: EstadoCuota.PENDIENTE_REVISION }]),
            then: (resolve: any) => resolve([{ ...cuotaMock, estado: EstadoCuota.PENDIENTE_REVISION }]),
          })),
        })),
      })),
      execute: vi.fn().mockResolvedValue(undefined),
      transaction: vi.fn(async (cb: any) => cb(mockDb)),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [FinanzasController],
      providers: [
        FinanzasService,
        { provide: DRIZZLE_DB, useValue: mockDb },
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
    const controller = app.get(FinanzasController);
    (controller as any).finanzasService = app.get(FinanzasService);
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  const bodyValido = {
    montoOriginal: '1200.00',
    monedaOriginal: Moneda.VES,
    metodoPago: MetodoPago.PAGO_MOVIL,
    referenciaBancaria: '984521',
    fechaOperacion: '2026-11-03',
  };

  it('rol entrenador → 403 Forbidden (el endpoint solo autoriza a alumnos)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/finanzas/cuotas/${CUOTA_ID}/reportar-pago`)
      .set('Authorization', `Bearer ${tokenParaUsuario(COACH_ID, Rol.ENTRENADOR)}`)
      .send({
        ...bodyValido,
        comprobanteStorageKey: `comprobantes/${ALUMNO_ID}/2026/${UUID_COMPROBANTE}.webp`,
      });

    expect(res.status).toBe(403);
  });

  it('rol alumno con clave propia válida → 201 Created', async () => {
    const res = await request(app.getHttpServer())
      .post(`/finanzas/cuotas/${CUOTA_ID}/reportar-pago`)
      .set('Authorization', `Bearer ${tokenParaUsuario(ALUMNO_ID, Rol.ALUMNO)}`)
      .send({
        ...bodyValido,
        comprobanteStorageKey: `comprobantes/${ALUMNO_ID}/2026/${UUID_COMPROBANTE}.webp`,
      });

    expect(res.status).toBe(201);
  });

  it('rol alumno con clave de otro alumno → 400 BadRequestException con el mensaje exacto', async () => {
    const res = await request(app.getHttpServer())
      .post(`/finanzas/cuotas/${CUOTA_ID}/reportar-pago`)
      .set('Authorization', `Bearer ${tokenParaUsuario(ALUMNO_ID, Rol.ALUMNO)}`)
      .send({
        ...bodyValido,
        comprobanteStorageKey: `comprobantes/${OTRO_ALUMNO_ID}/2026/${UUID_COMPROBANTE}.webp`,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('El comprobante adjunto no es válido.');
  });
});
