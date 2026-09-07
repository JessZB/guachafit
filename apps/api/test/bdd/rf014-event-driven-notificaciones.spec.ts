import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationDispatcherService } from '../../src/modules/notificaciones/notification-dispatcher.service';
import { PreferenciasNotificacionService } from '../../src/modules/notificaciones/preferencias-notificacion.service';
import { DispositivosService } from '../../src/modules/notificaciones/dispositivos.service';
import { PushNotificationProcessor } from '../../src/modules/notificaciones/processors/push-notification.processor';
import { EmailNotificationProcessor } from '../../src/modules/notificaciones/processors/email-notification.processor';
import {
  EventoNotificacionPayload,
  PlataformaDispositivo,
} from '@guachafit/shared';

describe('RF-014: Arquitectura Event-Driven y Despachador de Notificaciones Multicanal', () => {
  let dispatcherService: NotificationDispatcherService;
  let mockDb: any;
  let mockPreferenciasService: any;
  let mockDispositivosService: any;
  let mockPushQueue: any;
  let mockEmailQueue: any;

  let inAppStorage: any[];
  const alumnoId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    inAppStorage = [];

    mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => ({
          returning: vi.fn().mockImplementation(() => {
            const row = { id: `inapp-${Date.now()}`, ...val };
            inAppStorage.push(row);
            return [row];
          }),
        })),
      }),
      select: vi.fn().mockImplementation((fields) => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockReturnValue([{ email: 'alumno@guachafit.com' }]),
            orderBy: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(() => inAppStorage.filter((n) => n.usuarioId === alumnoId)),
            })),
          })),
        }),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((updateVals) => ({
          where: vi.fn().mockImplementation(() => ({
            returning: vi.fn().mockImplementation(() => {
              inAppStorage.forEach((item) => {
                if (item.usuarioId === alumnoId) {
                  Object.assign(item, updateVals);
                }
              });
              return inAppStorage;
            }),
          })),
        })),
      }),
    };

    mockPreferenciasService = {
      obtenerPreferencias: vi.fn().mockResolvedValue({
        id: 'pref-1',
        usuarioId: alumnoId,
        notifyPaymentsPush: true,
        notifyPaymentsEmail: true,
        notifyWorkoutsPush: true,
        notifyWorkoutsEmail: false,
        notifyCheckinsPush: true,
        notifyCheckinsEmail: false,
        digestWeeklyEmail: false,
        updatedAtUtc: new Date().toISOString(),
      }),
    };

    mockDispositivosService = {
      listarDispositivosActivos: vi.fn().mockResolvedValue([
        {
          id: 'dev-1',
          usuarioId: alumnoId,
          deviceToken: 'token_fcm_android_123',
          platform: PlataformaDispositivo.ANDROID,
          isActive: true,
          updatedAtUtc: new Date().toISOString(),
        },
      ]),
      marcarTokenInvalido: vi.fn().mockResolvedValue(undefined),
    };

    mockPushQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-push-1' }),
    };

    mockEmailQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-email-1' }),
    };

    dispatcherService = new NotificationDispatcherService(
      mockDb,
      mockPreferenciasService,
      mockDispositivosService,
      mockPushQueue,
      mockEmailQueue
    );
  });

  describe('Escenario 1: Despacho Asíncrono de Recordatorio de Pago sin Bloquear la API', () => {
    it('debe registrar siempre en la bandeja In-App y encolar en colas de Push y Email según preferencias', async () => {
      const evento: EventoNotificacionPayload = {
        tipoEvento: 'CUOTA_POR_VENCER',
        categoria: 'FINANZAS',
        destinatarioUserId: alumnoId,
        titulo: 'Tu cuota vence mañana',
        cuerpo: 'Recuerda reportar tu pago de $35 USD para mantener activo tu plan.',
        linkAccion: '/atleta/pagos',
      };

      const resultado = await dispatcherService.despacharEvento(evento);

      // Verificación In-App (RN-02 paso 1)
      expect(resultado.inAppId).toBeDefined();
      expect(mockDb.insert).toHaveBeenCalled();
      expect(inAppStorage.length).toBe(1);
      expect(inAppStorage[0].titulo).toBe('Tu cuota vence mañana');
      expect(inAppStorage[0].leida).toBe(false);

      // Verificación Push
      expect(resultado.pushEnqueued).toBe(true);
      expect(mockPushQueue.add).toHaveBeenCalledWith(
        'enviar-push',
        expect.objectContaining({
          usuarioId: alumnoId,
          tokens: ['token_fcm_android_123'],
          titulo: 'Tu cuota vence mañana',
        }),
        expect.any(Object)
      );

      // Verificación Email
      expect(resultado.emailEnqueued).toBe(true);
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'enviar-email',
        expect.objectContaining({
          usuarioId: alumnoId,
          email: 'alumno@guachafit.com',
          asunto: 'Tu cuota vence mañana',
        }),
        expect.any(Object)
      );
    });
  });

  describe('Escenario 2: Usuario con Canales Externos Apagados (RN-04 Universal In-App Fallback)', () => {
    it('no debe encolar Push ni Email cuando las preferencias están en false, pero SÍ persistir In-App', async () => {
      mockPreferenciasService.obtenerPreferencias.mockResolvedValueOnce({
        id: 'pref-1',
        usuarioId: alumnoId,
        notifyPaymentsPush: false,
        notifyPaymentsEmail: false,
        notifyWorkoutsPush: false,
        notifyWorkoutsEmail: false,
        notifyCheckinsPush: false,
        notifyCheckinsEmail: false,
        digestWeeklyEmail: false,
        updatedAtUtc: new Date().toISOString(),
      });

      const evento: EventoNotificacionPayload = {
        tipoEvento: 'RUTINA_ASIGNADA',
        categoria: 'ENTRENAMIENTO',
        destinatarioUserId: alumnoId,
        titulo: 'Nueva rutina asignada',
        cuerpo: 'Tu entrenador ha programado una nueva sesión Push.',
      };

      const resultado = await dispatcherService.despacharEvento(evento);

      expect(resultado.inAppId).toBeDefined();
      expect(resultado.pushEnqueued).toBe(false);
      expect(resultado.emailEnqueued).toBe(false);
      expect(mockPushQueue.add).not.toHaveBeenCalled();
      expect(mockEmailQueue.add).not.toHaveBeenCalled();
      expect(inAppStorage.length).toBe(1);
    });
  });

  describe('Escenario 3: Inviolabilidad de Alertas de Seguridad (RF-015 RN-01)', () => {
    it('debe encolar obligatoriamente Email para alertas de seguridad aun con Email desactivado en preferencias', async () => {
      mockPreferenciasService.obtenerPreferencias.mockResolvedValueOnce({
        id: 'pref-1',
        usuarioId: alumnoId,
        notifyPaymentsPush: false,
        notifyPaymentsEmail: false,
        notifyWorkoutsPush: false,
        notifyWorkoutsEmail: false,
        notifyCheckinsPush: false,
        notifyCheckinsEmail: false,
        digestWeeklyEmail: false,
        updatedAtUtc: new Date().toISOString(),
      });

      const eventoSeguridad: EventoNotificacionPayload = {
        tipoEvento: 'SEGURIDAD_PASSWORD_RESET',
        categoria: 'SEGURIDAD',
        esCriticoSeguridad: true,
        destinatarioUserId: alumnoId,
        titulo: 'Alerta de Seguridad: Restablecimiento de Contraseña',
        cuerpo: 'Se ha solicitado un cambio de contraseña en tu cuenta.',
      };

      const resultado = await dispatcherService.despacharEvento(eventoSeguridad);

      expect(resultado.emailEnqueued).toBe(true);
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'enviar-email',
        expect.objectContaining({
          email: 'alumno@guachafit.com',
          esCriticoSeguridad: true,
        }),
        expect.any(Object)
      );
    });
  });

  describe('Escenario 4: Worker Push y Detección de Tokens Obsoletos (RF-016 RN-04)', () => {
    it('debe detectar token no registrado o app desinstalada y marcar el token inactivo', async () => {
      const pushProcessor = new PushNotificationProcessor(mockDispositivosService);

      const mockJob: any = {
        id: 'job-1',
        data: {
          usuarioId: alumnoId,
          tokens: ['valid_token_abc', 'token_invalid_unregistered_dead'],
          titulo: 'Alerta de prueba',
          cuerpo: 'Cuerpo de prueba',
          tipoEvento: 'TEST',
        },
      };

      const res = await pushProcessor.process(mockJob);

      expect(res.delivered).toBe(1);
      expect(res.failed).toBe(1);
      expect(mockDispositivosService.marcarTokenInvalido).toHaveBeenCalledWith(
        'token_invalid_unregistered_dead'
      );
    });
  });

  describe('Escenario 5: Worker Email y Manejo de Errores con Reintentos (RF-014 RN-03)', () => {
    it('debe permitir reintento en BullMQ arrojando el error ante fallas 503 del proveedor sin colapsar', async () => {
      const emailProcessor = new EmailNotificationProcessor();

      const mockJobFail: any = {
        id: 'job-fail',
        attemptsMade: 1,
        data: {
          usuarioId: alumnoId,
          email: 'error-500-simulado@guachafit.com',
          asunto: 'Factura',
          cuerpo: 'Detalle',
          tipoEvento: 'PAGO_APROBADO',
        },
      };

      await expect(emailProcessor.process(mockJobFail)).rejects.toThrow(
        '503 Service Unavailable'
      );

      const mockJobSuccess: any = {
        id: 'job-ok',
        attemptsMade: 0,
        data: {
          usuarioId: alumnoId,
          email: 'ok@guachafit.com',
          asunto: 'Factura',
          cuerpo: 'Detalle',
          tipoEvento: 'PAGO_APROBADO',
        },
      };

      const res = await emailProcessor.process(mockJobSuccess);
      expect(res.status).toBe('sent');
    });
  });
});
