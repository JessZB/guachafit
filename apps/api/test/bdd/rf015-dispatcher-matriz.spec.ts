import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationDispatcherService } from '../../src/modules/notificaciones/notification-dispatcher.service';
import {
  CANALES_OBLIGATORIOS_NOTIFICACION,
  EventoNotificacionPayload,
  matrizPreferenciasPorRol,
  PlataformaDispositivo,
  PREFERENCIAS_NOTIFICACION_POR_DEFECTO,
  PreferenciasNotificacionDTO,
  Rol,
} from '@guachafit/shared';

/**
 * RF-015 (Ola 3 / N2a): la matriz COMPLETA gobierna el despachador.
 *
 * Cubre la precedencia del doc: canal obligatorio (RN-01) → preferencia del usuario → default del
 * doc cuando la preferencia no existe → In-App universal (RF-014 RN-04) siempre.
 */
describe('RF-015 N2a: matriz de preferencias por rol y categoría en el despachador', () => {
  let dispatcher: NotificationDispatcherService;
  let mockDb: any;
  let mockPreferenciasService: any;
  let mockDispositivosService: any;
  let mockPushQueue: any;
  let mockEmailQueue: any;
  let inAppStorage: any[];
  let rolDestinatario: Rol;
  let preferenciasActuales: PreferenciasNotificacionDTO | null;

  const usuarioId = '44444444-4444-4444-8444-444444444444';

  /** DTO completo (16 campos) con los defaults del doc y overrides puntuales. */
  const prefsDePrueba = (
    rol: Rol,
    overrides: Partial<PreferenciasNotificacionDTO> = {}
  ): PreferenciasNotificacionDTO => ({
    id: 'pref-1',
    usuarioId,
    rol,
    ...(PREFERENCIAS_NOTIFICACION_POR_DEFECTO as unknown as Record<string, boolean>),
    updatedAtUtc: new Date().toISOString(),
    matriz: [],
    canalesObligatorios: [...CANALES_OBLIGATORIOS_NOTIFICACION],
    ...overrides,
  } as PreferenciasNotificacionDTO);

  beforeEach(() => {
    inAppStorage = [];
    rolDestinatario = Rol.ALUMNO;
    preferenciasActuales = prefsDePrueba(Rol.ALUMNO);

    mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => ({
          returning: vi.fn().mockImplementation(() => {
            const row = { id: `inapp-${inAppStorage.length + 1}`, ...val };
            inAppStorage.push(row);
            return [row];
          }),
        })),
      }),
      // Un solo mock para las dos consultas del despachador: rol del destinatario (`{ rol }`) y
      // correo del destinatario (`{ email }`).
      select: vi.fn().mockImplementation((fields?: Record<string, unknown>) => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              if (fields && 'rol' in fields) return [{ rol: rolDestinatario }];
              if (fields && 'email' in fields) return [{ email: 'destinatario@guachafit.com' }];
              return [];
            }),
          }),
        }),
      })),
      update: vi.fn(),
    };

    mockPreferenciasService = {
      obtenerPreferencias: vi.fn().mockImplementation(async () => preferenciasActuales),
    };

    mockDispositivosService = {
      listarDispositivosActivos: vi.fn().mockResolvedValue([
        {
          id: 'dev-1',
          usuarioId,
          deviceToken: 'token_fcm_android_123',
          platform: PlataformaDispositivo.ANDROID,
          isActive: true,
          updatedAtUtc: new Date().toISOString(),
        },
      ]),
    };

    mockPushQueue = { add: vi.fn().mockResolvedValue({ id: 'job-push-1' }) };
    mockEmailQueue = { add: vi.fn().mockResolvedValue({ id: 'job-email-1' }) };

    dispatcher = new NotificationDispatcherService(
      mockDb,
      mockPreferenciasService,
      mockDispositivosService,
      mockPushQueue,
      mockEmailQueue
    );
  });

  const evento = (overrides: Partial<EventoNotificacionPayload> = {}): EventoNotificacionPayload => ({
    tipoEvento: 'EVENTO_PRUEBA',
    destinatarioUserId: usuarioId,
    titulo: 'Título',
    cuerpo: 'Cuerpo',
    categoria: 'FINANZAS',
    ...overrides,
  });

  // ===========================================================================
  // §B Entrenador — Cobranzas Entrantes (misma categoría FINANZAS que el alumno)
  // ===========================================================================
  describe('Entrenador · Cobranzas Entrantes (Pago reportado por el alumno)', () => {
    it('preferencia apagada: no encola Push ni Email, pero SÍ registra In-App (RN-04)', async () => {
      rolDestinatario = Rol.ENTRENADOR;
      preferenciasActuales = prefsDePrueba(Rol.ENTRENADOR, {
        notifyCobranzasPush: false,
        notifyCobranzasEmail: false,
      });

      const resultado = await dispatcher.despacharEvento(
        evento({ categoria: 'FINANZAS', tipoEvento: 'PAGO_REPORTADO' })
      );

      expect(resultado.pushEnqueued).toBe(false);
      expect(resultado.emailEnqueued).toBe(false);
      expect(mockPushQueue.add).not.toHaveBeenCalled();
      expect(mockEmailQueue.add).not.toHaveBeenCalled();
      expect(inAppStorage).toHaveLength(1);
      expect(inAppStorage[0].titulo).toBe('Título');
    });

    it('respeta el canal Email apagado pero mantiene Push encendido (canales independientes)', async () => {
      rolDestinatario = Rol.ENTRENADOR;
      preferenciasActuales = prefsDePrueba(Rol.ENTRENADOR, {
        notifyCobranzasPush: true,
        notifyCobranzasEmail: false,
      });

      const resultado = await dispatcher.despacharEvento(evento({ categoria: 'FINANZAS' }));

      expect(resultado.pushEnqueued).toBe(true);
      expect(resultado.emailEnqueued).toBe(false);
      expect(mockEmailQueue.add).not.toHaveBeenCalled();
    });

    it('NO usa la preferencia de Finanzas del alumno para un coach (discriminación por rol)', async () => {
      rolDestinatario = Rol.ENTRENADOR;
      preferenciasActuales = prefsDePrueba(Rol.ENTRENADOR, {
        // El alumno las tiene encendidas; el coach las tiene apagadas.
        notifyPaymentsPush: true,
        notifyPaymentsEmail: true,
        notifyCobranzasPush: false,
        notifyCobranzasEmail: false,
      });

      const resultado = await dispatcher.despacharEvento(evento({ categoria: 'FINANZAS' }));

      expect(resultado.pushEnqueued).toBe(false);
      expect(resultado.emailEnqueued).toBe(false);
      expect(inAppStorage).toHaveLength(1);
    });

    it('el MISMO evento FINANZAS hacia un alumno usa Finanzas y Pagos (§A)', async () => {
      rolDestinatario = Rol.ALUMNO;
      preferenciasActuales = prefsDePrueba(Rol.ALUMNO, {
        notifyPaymentsPush: true,
        notifyPaymentsEmail: true,
        notifyCobranzasPush: false,
        notifyCobranzasEmail: false,
      });

      const resultado = await dispatcher.despacharEvento(
        evento({ categoria: 'FINANZAS', tipoEvento: 'CUOTA_POR_VENCER' })
      );

      expect(resultado.pushEnqueued).toBe(true);
      expect(resultado.emailEnqueued).toBe(true);
    });
  });

  // ===========================================================================
  // §B Entrenador — Nuevos Registros (categoría ALUMNOS) y Reportes de Progreso
  // ===========================================================================
  describe('Entrenador · Nuevos Registros y Reportes de Progreso', () => {
    it('Nuevos Registros por defecto (true/true): encola Push y Email', async () => {
      rolDestinatario = Rol.ENTRENADOR;
      preferenciasActuales = prefsDePrueba(Rol.ENTRENADOR);

      const resultado = await dispatcher.despacharEvento(
        evento({ categoria: 'ALUMNOS', tipoEvento: 'ALUMNO_REGISTRADO' })
      );

      expect(resultado.pushEnqueued).toBe(true);
      expect(resultado.emailEnqueued).toBe(true);
    });

    it('Reportes de Progreso: la sesión finalizada de un alumno NO roba la preferencia de entrenamiento del alumno', async () => {
      rolDestinatario = Rol.ENTRENADOR;
      preferenciasActuales = prefsDePrueba(Rol.ENTRENADOR, {
        // Dimensiones del alumno apagadas: no deben gobernar al coach.
        notifyWorkoutsPush: false,
        notifyWorkoutsEmail: false,
        notifyCheckinsPush: false,
        notifyCheckinsEmail: false,
        // Reportes de Progreso (coach): push sí, email no (defaults del doc §B).
        notifyReportesProgresoPush: true,
        notifyReportesProgresoEmail: false,
      });

      const resultado = await dispatcher.despacharEvento(
        evento({ categoria: 'ENTRENAMIENTO', tipoEvento: 'SESION_ALUMNO_FINALIZADA' })
      );

      expect(resultado.pushEnqueued).toBe(true);
      expect(resultado.emailEnqueued).toBe(false);
    });

    it('un check-in antropométrico del alumno enruta a Reportes de Progreso del coach', async () => {
      rolDestinatario = Rol.ENTRENADOR;
      preferenciasActuales = prefsDePrueba(Rol.ENTRENADOR, {
        notifyReportesProgresoPush: false,
        notifyReportesProgresoEmail: true,
        notifyCheckinsEmail: false,
      });

      const resultado = await dispatcher.despacharEvento(evento({ categoria: 'ANTROPOMETRIA' }));

      expect(resultado.pushEnqueued).toBe(false);
      expect(resultado.emailEnqueued).toBe(true);
    });

    it('Resumen Semanal: solo Email por defecto (§B: Push false, Email true)', async () => {
      rolDestinatario = Rol.ENTRENADOR;
      preferenciasActuales = prefsDePrueba(Rol.ENTRENADOR);

      const resultado = await dispatcher.despacharEvento(
        evento({ categoria: 'RESUMEN_SEMANAL', tipoEvento: 'RESUMEN_SEMANAL_COACH' })
      );

      expect(resultado.pushEnqueued).toBe(false);
      expect(resultado.emailEnqueued).toBe(true);
    });

    it('Resumen Semanal con el Email apagado por el coach: ni Email ni Push, sí In-App', async () => {
      rolDestinatario = Rol.ENTRENADOR;
      preferenciasActuales = prefsDePrueba(Rol.ENTRENADOR, { digestWeeklyEmail: false });

      const resultado = await dispatcher.despacharEvento(
        evento({ categoria: 'RESUMEN_SEMANAL', tipoEvento: 'RESUMEN_SEMANAL_COACH' })
      );

      expect(resultado.emailEnqueued).toBe(false);
      expect(resultado.pushEnqueued).toBe(false);
      expect(inAppStorage).toHaveLength(1);
    });
  });

  // ===========================================================================
  // §A Alumno — Planificación Deportiva (ENTRENAMIENTO) y Check-in
  // ===========================================================================
  describe('Alumno · Planificación Deportiva y Check-in Antropométrico', () => {
    it('push apagado + email encendido: encola solo Email', async () => {
      preferenciasActuales = prefsDePrueba(Rol.ALUMNO, {
        notifyWorkoutsPush: false,
        notifyWorkoutsEmail: true,
      });

      const resultado = await dispatcher.despacharEvento(
        evento({ categoria: 'ENTRENAMIENTO', tipoEvento: 'RUTINA_ASIGNADA' })
      );

      expect(resultado.pushEnqueued).toBe(false);
      expect(resultado.emailEnqueued).toBe(true);
    });

    it('ambos apagados: In-App universal, sin canales externos', async () => {
      preferenciasActuales = prefsDePrueba(Rol.ALUMNO, {
        notifyWorkoutsPush: false,
        notifyWorkoutsEmail: false,
      });

      const resultado = await dispatcher.despacharEvento(
        evento({ categoria: 'ENTRENAMIENTO', tipoEvento: 'RUTINA_ASIGNADA' })
      );

      expect(resultado.pushEnqueued).toBe(false);
      expect(resultado.emailEnqueued).toBe(false);
      expect(inAppStorage).toHaveLength(1);
    });

    it('el recordatorio antropométrico usa Check-in (push sí, email no por defecto)', async () => {
      preferenciasActuales = prefsDePrueba(Rol.ALUMNO);

      const resultado = await dispatcher.despacharEvento(evento({ categoria: 'ANTROPOMETRIA' }));

      expect(resultado.pushEnqueued).toBe(true);
      expect(resultado.emailEnqueued).toBe(false);
    });
  });

  // ===========================================================================
  // RN-01 — Canal obligatorio de seguridad
  // ===========================================================================
  describe('RN-01 · Seguridad inviolable', () => {
    it('Email de seguridad SIEMPRE se envía, aunque la fila lo tenga apagado', async () => {
      preferenciasActuales = prefsDePrueba(Rol.ALUMNO, {
        notifySeguridadEmail: false,
        notifySeguridadPush: false,
      });

      const resultado = await dispatcher.despacharEvento(
        evento({
          categoria: 'SEGURIDAD',
          tipoEvento: 'SEGURIDAD_PASSWORD_RESET',
          esCriticoSeguridad: true,
        })
      );

      expect(resultado.emailEnqueued).toBe(true);
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'enviar-email',
        expect.objectContaining({ esCriticoSeguridad: true }),
        expect.any(Object)
      );
    });

    it('la categoría SEGURIDAD fuerza Email incluso sin la marca esCriticoSeguridad', async () => {
      preferenciasActuales = prefsDePrueba(Rol.ENTRENADOR, { notifySeguridadEmail: false });

      const resultado = await dispatcher.despacharEvento(
        evento({ categoria: 'SEGURIDAD', tipoEvento: 'SEGURIDAD_LOGIN_NUEVA_IP' })
      );

      expect(resultado.emailEnqueued).toBe(true);
    });

    it('un comprobante de pago APROBADO (esCriticoSeguridad) garantiza Email aunque Finanzas esté apagada', async () => {
      preferenciasActuales = prefsDePrueba(Rol.ALUMNO, {
        notifyPaymentsPush: false,
        notifyPaymentsEmail: false,
      });

      const resultado = await dispatcher.despacharEvento(
        evento({ categoria: 'FINANZAS', tipoEvento: 'PAGO_APROBADO', esCriticoSeguridad: true })
      );

      expect(resultado.emailEnqueued).toBe(true);
      expect(resultado.pushEnqueued).toBe(false);
    });

    it('el canal obligatorio declarado en el contrato es el correo de seguridad', () => {
      expect([...CANALES_OBLIGATORIOS_NOTIFICACION]).toEqual(['notifySeguridadEmail']);
      const filaSeguridad = matrizPreferenciasPorRol(Rol.ALUMNO).find(
        (fila) => fila.id === 'SEGURIDAD'
      );
      expect(filaSeguridad?.email).toBe('notifySeguridadEmail');
      expect(filaSeguridad?.canalesObligatorios).toContain('email');
    });
  });

  // ===========================================================================
  // Preferencia inexistente → defaults del doc (RF-015 §A/§B)
  // ===========================================================================
  describe('Preferencia inexistente (usuario sin fila persistida)', () => {
    it('coach sin preferencias: aplica los defaults del §B (Cobranzas Push+Email)', async () => {
      rolDestinatario = Rol.ENTRENADOR;
      preferenciasActuales = null;
      mockPreferenciasService.obtenerPreferencias.mockRejectedValueOnce(
        new Error('sin fila de preferencias')
      );

      const resultado = await dispatcher.despacharEvento(
        evento({ categoria: 'FINANZAS', tipoEvento: 'PAGO_REPORTADO' })
      );

      expect(resultado.pushEnqueued).toBe(true);
      expect(resultado.emailEnqueued).toBe(true);
    });

    it('alumno sin preferencias: aplica los defaults del §A (Planificación Deportiva push sí, email no)', async () => {
      rolDestinatario = Rol.ALUMNO;
      preferenciasActuales = null;
      mockPreferenciasService.obtenerPreferencias.mockRejectedValueOnce(
        new Error('sin fila de preferencias')
      );

      const resultado = await dispatcher.despacharEvento(
        evento({ categoria: 'ENTRENAMIENTO', tipoEvento: 'RUTINA_ASIGNADA' })
      );

      expect(resultado.pushEnqueued).toBe(true);
      expect(resultado.emailEnqueued).toBe(false);
    });

    it('alumno sin preferencias: Finanzas por defecto usa Push y Email (§A true/true)', async () => {
      rolDestinatario = Rol.ALUMNO;
      preferenciasActuales = null;
      mockPreferenciasService.obtenerPreferencias.mockRejectedValueOnce(
        new Error('sin fila de preferencias')
      );

      const resultado = await dispatcher.despacharEvento(evento({ categoria: 'FINANZAS' }));

      expect(resultado.pushEnqueued).toBe(true);
      expect(resultado.emailEnqueued).toBe(true);
    });

    it('categoría exclusiva del coach (RESUMEN_SEMANAL) se resuelve aunque el rol del destinatario no la tenga', async () => {
      rolDestinatario = Rol.ALUMNO;
      preferenciasActuales = null;
      mockPreferenciasService.obtenerPreferencias.mockRejectedValueOnce(
        new Error('sin fila de preferencias')
      );

      const resultado = await dispatcher.despacharEvento(
        evento({ categoria: 'RESUMEN_SEMANAL', tipoEvento: 'RESUMEN_SEMANAL_COACH' })
      );

      // §B: digest Email por defecto activo, Push apagado.
      expect(resultado.emailEnqueued).toBe(true);
      expect(resultado.pushEnqueued).toBe(false);
    });
  });

  // ===========================================================================
  // In-App universal (RF-014 RN-04)
  // ===========================================================================
  describe('In-App universal', () => {
    it('todo evento, en cualquier categoría y con cualquier preferencia, queda en la bandeja', async () => {
      preferenciasActuales = prefsDePrueba(Rol.ALUMNO, {
        notifyWorkoutsPush: false,
        notifyWorkoutsEmail: false,
      });

      const resultado = await dispatcher.despacharEvento(
        evento({ categoria: 'ENTRENAMIENTO', tipoEvento: 'RUTINA_ASIGNADA' })
      );

      expect(resultado.inAppId).toBeDefined();
      expect(inAppStorage).toHaveLength(1);
      expect(inAppStorage[0].leida).toBe(false);
    });
  });
});
