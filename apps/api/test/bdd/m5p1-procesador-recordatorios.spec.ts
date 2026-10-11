import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EstadoAlumno, EstadoCuota } from '@guachafit/shared';
import { getTableName } from '@guachafit/database';
import {
  BillingReminderProcessor,
  TOLERANCIA_RETRASO_HITO_MS,
} from '../../src/modules/finanzas/billing-reminder.processor';
import { RecordatorioCuotaEvent } from '../../src/modules/notificaciones/events/eventos-notificacion';

/**
 * M5 · lote P1 (correcciones de la validación 08): revalidación del ALUMNO y obsolescencia
 * del HITO en el despacho de un recordatorio (`procesarRecordatorio(job, ahora?)`).
 *
 * V3: con una cuota abierta, si el alumno está archivado (`deletedAtUtc`), pausado
 * (`inactivo_pausado`), suspendido (`suspendido_pago`) o NO tiene perfil, el recordatorio no
 * se envía (`{ enviado: false, motivo: 'alumno_inactivo' }`) y no se emite evento; con el
 * alumno activo se despacha (`'despachado'`).
 * V4: un hito cuyo `timestampHitoUtc` quedó a más de `TOLERANCIA_RETRASO_HITO_MS` (24 h) de
 * `ahora` se descarta como `'hito_obsoleto'` SIN leer la cuota ni emitir evento; a 6 h o sin
 * `timestampHitoUtc` se procesa normal (el borde exacto de 24 h tampoco se descarta).
 */
describe('M5 P1 · procesador: revalidación del alumno y hito obsoleto (contratos V3 y V4)', () => {
  const CUOTA_ID = 'cuota-v3-v4';
  const CLIENTE_ID = 'alumno-v3-v4';
  const COACH_ID = 'coach-v3-v4';
  const AHORA = new Date('2026-10-09T12:00:00.000Z');
  const HORA_MS = 60 * 60 * 1000;

  let mockEventEmitter: any;
  let mockDlq: any;
  let mockFinanzas: any;

  function cuotaAbierta(overrides: Record<string, any> = {}) {
    return {
      id: CUOTA_ID,
      clienteId: CLIENTE_ID,
      entrenadorId: COACH_ID,
      estado: EstadoCuota.EMITIDA,
      montoTotalUsd: '60.00',
      montoAbonadoUsd: '0.00',
      saldoPendienteUsd: '60.00',
      fechaCorteUtc: new Date('2026-10-15T23:59:59Z'),
      ...overrides,
    };
  }

  function perfilAlumno(overrides: Record<string, any> = {}) {
    return {
      usuarioId: CLIENTE_ID,
      deletedAtUtc: null,
      estadoActivacion: EstadoAlumno.ACTIVO,
      ...overrides,
    };
  }

  /** Mock que devuelve la cuota para `cuotas_membresia` y el perfil para `perfiles_alumno`. */
  function crearDbMock(
    opciones: { cuota?: any; perfil?: any; sinPerfil?: boolean } = {}
  ): any {
    const db: any = {
      select: vi.fn(() => ({
        from: vi.fn((tabla: any) => {
          const nombre = tabla ? getTableName(tabla) : '';
          let filas: any[] = [];
          if (nombre === 'cuotas_membresia') {
            filas = opciones.cuota ? [opciones.cuota] : [];
          } else if (nombre === 'perfiles_alumno') {
            filas = opciones.sinPerfil ? [] : [opciones.perfil ?? perfilAlumno()];
          }
          return { where: vi.fn().mockResolvedValue(filas) };
        }),
      })),
      // RNF-003/ADR-011: la ruta de sistema del processor lee dentro de withTenant
      // (bypass is_superadmin); superficie transaccional mínima del mock.
      transaction: vi.fn(async (cb: any) => cb(db)),
      execute: vi.fn(async () => undefined),
    };
    return db;
  }

  function crearProcessor(db: any): BillingReminderProcessor {
    return new BillingReminderProcessor(db, mockEventEmitter, mockFinanzas, mockDlq);
  }

  function jobRecordatorio(overrides: Record<string, any> = {}) {
    return { data: { cuotaId: CUOTA_ID, hito: 'T_MINUS_1', ...overrides } } as any;
  }

  beforeEach(() => {
    mockEventEmitter = { emitAsync: vi.fn().mockResolvedValue([{ inAppId: 'inapp-1' }]) };
    mockDlq = { add: vi.fn().mockResolvedValue({ id: 'dlq-mock' }) };
    mockFinanzas = {
      obtenerTasaVigente: vi.fn().mockResolvedValue({ tasaEfectiva: '60.0000' }),
      proyectarVES: vi.fn((usd: string, tasa: string) =>
        (Number(usd) * Number(tasa)).toFixed(2)
      ),
    };
  });

  it('V3: alumno archivado, pausado o suspendido → alumno_inactivo, sin evento', async () => {
    const casos = [
      perfilAlumno({ deletedAtUtc: new Date('2026-10-01T00:00:00Z') }),
      perfilAlumno({ estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO }),
      perfilAlumno({ estadoActivacion: EstadoAlumno.SUSPENDIDO_PAGO }),
    ];

    for (const perfil of casos) {
      const processor = crearProcessor(crearDbMock({ cuota: cuotaAbierta(), perfil }));
      const resultado = await processor.procesarRecordatorio(jobRecordatorio(), AHORA);
      expect(resultado).toEqual({ enviado: false, motivo: 'alumno_inactivo' });
    }

    expect(mockEventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('V3: cuota sin perfil de alumno → alumno_inactivo, sin evento', async () => {
    const processor = crearProcessor(crearDbMock({ cuota: cuotaAbierta(), sinPerfil: true }));

    const resultado = await processor.procesarRecordatorio(jobRecordatorio(), AHORA);

    expect(resultado).toEqual({ enviado: false, motivo: 'alumno_inactivo' });
    expect(mockEventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('V3: alumno activo → despachado con el evento de recordatorio', async () => {
    const processor = crearProcessor(crearDbMock({ cuota: cuotaAbierta(), perfil: perfilAlumno() }));

    const resultado = await processor.procesarRecordatorio(jobRecordatorio(), AHORA);

    expect(resultado).toEqual({ enviado: true, motivo: 'despachado' });
    expect(mockEventEmitter.emitAsync).toHaveBeenCalledTimes(1);
    expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
      RecordatorioCuotaEvent.NOMBRE,
      expect.objectContaining({
        payload: expect.objectContaining({ destinatarioUserId: CLIENTE_ID }),
      })
    );
  });

  it('V4: hito con 25 h de retraso → hito_obsoleto, sin leer la cuota ni emitir', async () => {
    const db = crearDbMock({ cuota: cuotaAbierta(), perfil: perfilAlumno() });
    const processor = crearProcessor(db);

    const resultado = await processor.procesarRecordatorio(
      jobRecordatorio({
        timestampHitoUtc: new Date(AHORA.getTime() - 25 * HORA_MS).toISOString(),
      }),
      AHORA
    );

    expect(resultado).toEqual({ enviado: false, motivo: 'hito_obsoleto' });
    expect(db.select).not.toHaveBeenCalled();
    expect(mockEventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('V4: hito con 6 h de retraso → se procesa normal', async () => {
    const processor = crearProcessor(crearDbMock({ cuota: cuotaAbierta(), perfil: perfilAlumno() }));

    const resultado = await processor.procesarRecordatorio(
      jobRecordatorio({
        timestampHitoUtc: new Date(AHORA.getTime() - 6 * HORA_MS).toISOString(),
      }),
      AHORA
    );

    expect(resultado).toEqual({ enviado: true, motivo: 'despachado' });
  });

  it('V4: sin timestampHitoUtc → se procesa normal', async () => {
    const processor = crearProcessor(crearDbMock({ cuota: cuotaAbierta(), perfil: perfilAlumno() }));

    const resultado = await processor.procesarRecordatorio(jobRecordatorio(), AHORA);

    expect(resultado).toEqual({ enviado: true, motivo: 'despachado' });
  });

  it('V4: el borde exacto de la tolerancia (24 h) no descarta; 24 h + 1 ms sí', async () => {
    const processorBorde = crearProcessor(
      crearDbMock({ cuota: cuotaAbierta(), perfil: perfilAlumno() })
    );
    const enElBorde = await processorBorde.procesarRecordatorio(
      jobRecordatorio({
        timestampHitoUtc: new Date(AHORA.getTime() - TOLERANCIA_RETRASO_HITO_MS).toISOString(),
      }),
      AHORA
    );
    expect(enElBorde).toEqual({ enviado: true, motivo: 'despachado' });

    const processorPasado = crearProcessor(
      crearDbMock({ cuota: cuotaAbierta(), perfil: perfilAlumno() })
    );
    const pasado = await processorPasado.procesarRecordatorio(
      jobRecordatorio({
        timestampHitoUtc: new Date(
          AHORA.getTime() - TOLERANCIA_RETRASO_HITO_MS - 1
        ).toISOString(),
      }),
      AHORA
    );
    expect(pasado).toEqual({ enviado: false, motivo: 'hito_obsoleto' });
  });
});
