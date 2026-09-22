import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationDispatcherService } from '../../src/modules/notificaciones/notification-dispatcher.service';
import {
  AlumnoRegistradoEvent,
  EventoNotificacionDominio,
  PATRON_EVENTOS_NOTIFICACION,
  PagoAprobadoEvent,
  PagoRechazadoEvent,
  PagoReportadoEvent,
  RecordatorioCuotaEvent,
  RecordatorioManualCobroEvent,
  ResumenSemanalCoachEvent,
  SesionAlumnoFinalizadaEvent,
} from '../../src/modules/notificaciones/events/eventos-notificacion';
import type { EventoNotificacionPayload } from '@guachafit/shared';

/**
 * RF-014 RN-01 (ADR-010): bus de eventos de dominio.
 *
 * Verifica el cableado REAL de `@OnEvent` (EventSubscribersLoader sobre EventEmitter2 con
 * wildcard) y el contrato de las clases de evento: el despachador recibe el payload intacto,
 * los fallos se propagan a quien espera (`suppressErrors: false`) y `emitAsync` devuelve el
 * resultado del despacho.
 *
 * Nota de test: vitest/esbuild NO emite `design:paramtypes`, así que el despachador se instancia
 * a mano (mismo patrón que el resto de specs) y se registra con `useValue`; el loader de
 * `@nestjs/event-emitter` igualmente descubre el `@OnEvent` en el prototipo de la instancia.
 */
describe('RF-014: bus de eventos de dominio de notificaciones', () => {
  let app: INestApplication;
  let dispatcher: NotificationDispatcherService;
  let emitter: EventEmitter2;
  let despacharEventoSpy: ReturnType<typeof vi.spyOn>;

  const usuarioId = '11111111-1111-4111-8111-111111111111';

  const payloadBase: EventoNotificacionPayload = {
    tipoEvento: 'PAGO_REPORTADO',
    destinatarioUserId: usuarioId,
    entrenadorId: 'coach-1',
    categoria: 'FINANZAS',
    titulo: 'Nuevo pago por verificar',
    cuerpo: 'Se reportó un pago.',
    linkAccion: '/finanzas/conciliacion',
    esCriticoSeguridad: false,
  };

  beforeEach(async () => {
    dispatcher = new NotificationDispatcherService(
      {} as any,
      {} as any,
      {} as any,
      { add: vi.fn() } as any,
      { add: vi.fn() } as any
    );

    despacharEventoSpy = vi.spyOn(dispatcher, 'despacharEvento').mockResolvedValue({
      inAppId: 'inapp-bus-1',
      pushEnqueued: true,
      emailEnqueued: false,
      activeDeviceTokensCount: 1,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot({ wildcard: true })],
      providers: [{ provide: NotificationDispatcherService, useValue: dispatcher }],
    }).compile();

    // `app.init()` dispara onApplicationBootstrap: allí el loader de @nestjs/event-emitter
    // registra el listener @OnEvent del despachador.
    app = moduleRef.createNestApplication();
    await app.init();

    emitter = moduleRef.get(EventEmitter2);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('el despachador escucha TODOS los eventos `notificacion.**` y recibe el payload intacto', async () => {
    const eventos: Array<[string, EventoNotificacionDominio, string]> = [
      [PagoReportadoEvent.NOMBRE, new PagoReportadoEvent(payloadBase), 'PAGO_REPORTADO'],
      [
        PagoAprobadoEvent.NOMBRE,
        new PagoAprobadoEvent({ ...payloadBase, tipoEvento: 'PAGO_APROBADO' }),
        'PAGO_APROBADO',
      ],
      [
        PagoRechazadoEvent.NOMBRE,
        new PagoRechazadoEvent({ ...payloadBase, tipoEvento: 'PAGO_RECHAZADO' }),
        'PAGO_RECHAZADO',
      ],
      [
        SesionAlumnoFinalizadaEvent.NOMBRE,
        new SesionAlumnoFinalizadaEvent({
          ...payloadBase,
          tipoEvento: 'SESION_ALUMNO_FINALIZADA',
          categoria: 'ENTRENAMIENTO',
        }),
        'SESION_ALUMNO_FINALIZADA',
      ],
      [
        AlumnoRegistradoEvent.NOMBRE,
        new AlumnoRegistradoEvent({
          ...payloadBase,
          tipoEvento: 'ALUMNO_REGISTRADO',
          categoria: 'ALUMNOS',
        }),
        'ALUMNO_REGISTRADO',
      ],
      [
        RecordatorioCuotaEvent.NOMBRE,
        new RecordatorioCuotaEvent({ ...payloadBase, tipoEvento: 'CUOTA_POR_VENCER' }),
        'CUOTA_POR_VENCER',
      ],
      [
        RecordatorioManualCobroEvent.NOMBRE,
        new RecordatorioManualCobroEvent({
          ...payloadBase,
          tipoEvento: 'RECORDATORIO_MANUAL_COBRO',
        }),
        'RECORDATORIO_MANUAL_COBRO',
      ],
      [
        ResumenSemanalCoachEvent.NOMBRE,
        new ResumenSemanalCoachEvent({
          ...payloadBase,
          tipoEvento: 'RESUMEN_SEMANAL_COACH',
          categoria: 'RESUMEN_SEMANAL',
        }),
        'RESUMEN_SEMANAL_COACH',
      ],
    ];

    for (const [nombre, evento, tipoEvento] of eventos) {
      await emitter.emitAsync(nombre, evento);
      expect(despacharEventoSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ tipoEvento, destinatarioUserId: usuarioId })
      );
    }

    expect(despacharEventoSpy).toHaveBeenCalledTimes(eventos.length);
  });

  it('emitAsync devuelve el DespachoResultado del despachador (contrato que usa cartera)', async () => {
    const resultados = await emitter.emitAsync(
      PagoReportadoEvent.NOMBRE,
      new PagoReportadoEvent(payloadBase)
    );

    expect(resultados).toEqual([
      {
        inAppId: 'inapp-bus-1',
        pushEnqueued: true,
        emailEnqueued: false,
        activeDeviceTokensCount: 1,
      },
    ]);
  });

  it('un fallo del despachador SE PROPAGA al emisor que espera (suppressErrors: false)', async () => {
    despacharEventoSpy.mockRejectedValueOnce(new Error('Redis no disponible'));

    await expect(
      emitter.emitAsync(PagoReportadoEvent.NOMBRE, new PagoReportadoEvent(payloadBase))
    ).rejects.toThrow('Redis no disponible');
  });

  it('cada clase de evento expone un nombre namespaced bajo el patrón que escucha el despachador', () => {
    expect(PATRON_EVENTOS_NOTIFICACION).toBe('notificacion.**');

    const nombres = [
      PagoReportadoEvent.NOMBRE,
      PagoAprobadoEvent.NOMBRE,
      PagoRechazadoEvent.NOMBRE,
      SesionAlumnoFinalizadaEvent.NOMBRE,
      AlumnoRegistradoEvent.NOMBRE,
      RecordatorioCuotaEvent.NOMBRE,
      RecordatorioManualCobroEvent.NOMBRE,
      ResumenSemanalCoachEvent.NOMBRE,
    ];

    for (const nombre of nombres) {
      expect(nombre.startsWith('notificacion.')).toBe(true);
      expect(nombre).not.toContain(':');
    }
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it('`ocurridoEnUtc` respeta el timestamp del payload o lo fija al construir el evento', () => {
    const conTimestamp = new PagoReportadoEvent({
      ...payloadBase,
      timestampUtc: '2026-09-22T10:00:00.000Z',
    });
    expect(conTimestamp.ocurridoEnUtc).toBe('2026-09-22T10:00:00.000Z');

    const sinTimestamp = new PagoReportadoEvent(payloadBase);
    expect(Number.isNaN(Date.parse(sinTimestamp.ocurridoEnUtc))).toBe(false);
  });
});
