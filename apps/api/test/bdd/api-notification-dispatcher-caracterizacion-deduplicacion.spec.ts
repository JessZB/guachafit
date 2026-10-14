import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationDispatcherService } from '../../src/modules/notificaciones/notification-dispatcher.service';
import { PlataformaDispositivo, Rol } from '@guachafit/shared';
import {
  BienvenidaAlumnoEvent,
  RecuperacionPasswordSolicitadaEvent,
} from '../../src/modules/notificaciones/events/eventos-correo-cuenta';

/**
 * Caracterización del despachador (lente Q5): deduplicación y silencios idénticos.
 *
 * Fija el comportamiento actual con base de datos simulada, al estilo de los
 * specs existentes: canales según preferencias, silencios sin encolar pero con
 * In-App universal, e identificadores de trabajo estables dentro del mismo día UTC.
 */
describe('Caracterización del despachador: deduplicación y silencios', () => {
  const usuarioId = '55555555-5555-4555-8555-555555555555';
  const token = 'token-de-prueba-1234567890';
  let inApp: any[];
  let mockDb: any;
  let mockPreferencias: any;
  let mockDispositivos: any;
  let mockPush: any;
  let mockEmail: any;

  function crearServicio(preferencias: any) {
    mockPreferencias = { obtenerPreferencias: vi.fn().mockResolvedValue(preferencias) };
    const servicio = new NotificationDispatcherService(
      mockDb,
      mockPreferencias,
      mockDispositivos,
      mockPush,
      mockEmail,
    );
    return servicio;
  }

  beforeEach(() => {
    inApp = [];
    mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val: any) => ({
          returning: vi.fn(async () => {
            const fila = { id: `inapp-${inApp.length + 1}`, ...val };
            inApp.push(fila);
            return [fila];
          }),
        })),
      }),
      select: vi.fn().mockImplementation((campos: any) => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn(async () => {
              if (campos && 'rol' in campos) return [{ rol: Rol.ALUMNO }];
              if (campos && 'email' in campos) return [{ email: 'alumno@guachafit.com' }];
              return [];
            }),
          }),
        }),
      })),
      update: vi.fn(),
    };
    mockDispositivos = {
      listarDispositivosActivos: vi.fn().mockResolvedValue([
        {
          id: 'dev-1',
          usuarioId,
          deviceToken: 'token-1',
          platform: PlataformaDispositivo.ANDROID,
          isActive: true,
          updatedAtUtc: new Date().toISOString(),
        },
      ]),
    };
    mockPush = { add: vi.fn().mockResolvedValue({ id: 'job-push' }) };
    mockEmail = { add: vi.fn().mockResolvedValue({ id: 'job-email' }) };
  });

  it('el mismo evento del mismo día usa el mismo identificador en push y en correo', async () => {
    const servicio = crearServicio(null);
    mockPreferencias.obtenerPreferencias.mockRejectedValueOnce(new Error('sin fila'));
    const evento: any = {
      tipoEvento: 'CUOTA_POR_VENCER',
      categoria: 'FINANZAS',
      destinatarioUserId: usuarioId,
      titulo: 'Cuota por vencer',
      cuerpo: 'Cuerpo',
    };
    await servicio.despacharEvento(evento);
    const jobPush = mockPush.add.mock.calls[0][2].jobId;
    const jobEmail = mockEmail.add.mock.calls[0][2].jobId;
    expect(jobPush).toBe(jobEmail);
    expect(jobPush).toMatch(/^notif_FINANZAS_CUOTA_POR_VENCER_/);
  });

  it('dos despachos del mismo evento el mismo día repiten el identificador (reintento no duplica)', async () => {
    const servicio = crearServicio(null);
    mockPreferencias.obtenerPreferencias.mockRejectedValue(new Error('sin fila'));
    const evento: any = {
      tipoEvento: 'CUOTA_POR_VENCER',
      categoria: 'FINANZAS',
      destinatarioUserId: usuarioId,
      titulo: 'Cuota por vencer',
      cuerpo: 'Cuerpo',
    };
    await servicio.despacharEvento(evento);
    await servicio.despacharEvento(evento);
    const primero = mockPush.add.mock.calls[0][2].jobId;
    const segundo = mockPush.add.mock.calls[1][2].jobId;
    expect(segundo).toBe(primero);
    expect(inApp).toHaveLength(2);
  });

  it('el mismo código de correo de cuenta no se encola dos veces y nunca viaja en claro', async () => {
    const servicio = new NotificationDispatcherService(
      mockDb,
      {} as any,
      {} as any,
      { add: vi.fn() } as any,
      mockEmail,
      { entregaReal: false, enviar: vi.fn() } as any,
    );
    const carga = {
      tipo: 'RECUPERACION_PASSWORD' as const,
      usuarioId,
      email: 'ana@guachafit.com',
      nombre: 'Ana',
      token,
    };
    await servicio.despacharCorreoCuenta(carga);
    await servicio.despacharCorreoCuenta(carga);
    const primero = mockEmail.add.mock.calls[0][2].jobId;
    const segundo = mockEmail.add.mock.calls[1][2].jobId;
    expect(segundo).toBe(primero);
    expect(primero).toContain(`cuenta_RECUPERACION_PASSWORD_${usuarioId}_`);
    expect(primero).not.toContain(token);
  });

  it('cada aviso de seguridad sin enlace lleva identificador propio (no se descarta el segundo)', async () => {
    const servicio = new NotificationDispatcherService(
      mockDb,
      {} as any,
      {} as any,
      { add: vi.fn() } as any,
      mockEmail,
      { entregaReal: false, enviar: vi.fn() } as any,
    );
    const carga = {
      tipo: 'AVISO_PASSWORD_CAMBIADA' as const,
      usuarioId,
      email: 'ana@guachafit.com',
      nombre: 'Ana',
    };
    await servicio.despacharCorreoCuenta(carga as any);
    await servicio.despacharCorreoCuenta(carga as any);
    const primero = mockEmail.add.mock.calls[0][2].jobId;
    const segundo = mockEmail.add.mock.calls[1][2].jobId;
    expect(segundo).not.toBe(primero);
  });

  it('con canales apagados no encola nada pero sí registra el In-App universal', async () => {
    const servicio = crearServicio({
      id: 'pref-1',
      usuarioId,
      rol: Rol.ALUMNO,
      notifyWorkoutsPush: false,
      notifyWorkoutsEmail: false,
      notifyPaymentsPush: false,
      notifyPaymentsEmail: false,
      notifyCheckinsPush: false,
      notifyCheckinsEmail: false,
      digestWeeklyEmail: false,
      updatedAtUtc: new Date().toISOString(),
    });
    const resultado = await servicio.despacharEvento({
      tipoEvento: 'RUTINA_ASIGNADA',
      categoria: 'ENTRENAMIENTO',
      destinatarioUserId: usuarioId,
      titulo: 'Rutina',
      cuerpo: 'Cuerpo',
    } as any);
    expect(resultado.pushEnqueued).toBe(false);
    expect(resultado.emailEnqueued).toBe(false);
    expect(mockPush.add).not.toHaveBeenCalled();
    expect(mockEmail.add).not.toHaveBeenCalled();
    expect(inApp).toHaveLength(1);
  });

  it('la alerta de seguridad fuerza el correo aunque la preferencia esté apagada', async () => {
    const servicio = crearServicio({
      id: 'pref-1',
      usuarioId,
      rol: Rol.ALUMNO,
      notifySeguridadPush: false,
      notifySeguridadEmail: false,
      updatedAtUtc: new Date().toISOString(),
    });
    const resultado = await servicio.despacharEvento({
      tipoEvento: 'SEGURIDAD_PASSWORD_RESET',
      categoria: 'SEGURIDAD',
      esCriticoSeguridad: true,
      destinatarioUserId: usuarioId,
      titulo: 'Alerta',
      cuerpo: 'Cuerpo',
    } as any);
    expect(resultado.emailEnqueued).toBe(true);
    expect(mockEmail.add).toHaveBeenCalledTimes(1);
  });

  it('el punto de entrada de eventos de dominio delega en el pipeline', async () => {
    const servicio = crearServicio(null);
    mockPreferencias.obtenerPreferencias.mockRejectedValue(new Error('sin fila'));
    const resultado = await servicio.alEventoDeNotificacion({
      tipo: 'notificacion.finanzas',
      payload: {
        tipoEvento: 'CUOTA_POR_VENCER',
        categoria: 'FINANZAS',
        destinatarioUserId: usuarioId,
        titulo: 'Cuota',
        cuerpo: 'Cuerpo',
      },
    } as any);
    expect(resultado.inAppId).toBeDefined();
    expect(inApp).toHaveLength(1);
  });

  it('el punto de entrada de correo de cuenta delega en el despacho con límite', async () => {
    const servicio = new NotificationDispatcherService(
      mockDb,
      {} as any,
      {} as any,
      { add: vi.fn() } as any,
      mockEmail,
      { entregaReal: true, enviar: vi.fn() } as any,
    );
    const resultado = await servicio.alEventoCorreoCuenta(
      new RecuperacionPasswordSolicitadaEvent({
        tipo: 'RECUPERACION_PASSWORD',
        usuarioId,
        email: 'ana@guachafit.com',
        nombre: 'Ana',
        token,
      }),
    );
    expect(resultado).toEqual({ encolado: true, correoEnCamino: true });
  });

  it('la bienvenida también viaja por el mismo punto de entrada de cuenta', async () => {
    const servicio = new NotificationDispatcherService(
      mockDb,
      {} as any,
      {} as any,
      { add: vi.fn() } as any,
      mockEmail,
      { entregaReal: false, enviar: vi.fn() } as any,
    );
    const resultado = await servicio.alEventoCorreoCuenta(
      new BienvenidaAlumnoEvent({
        tipo: 'BIENVENIDA_ALUMNO',
        usuarioId,
        email: 'nuevo@guachafit.com',
        nombre: 'Nuevo',
        token,
      }),
    );
    expect(resultado).toEqual({ encolado: true, correoEnCamino: false });
  });
});
