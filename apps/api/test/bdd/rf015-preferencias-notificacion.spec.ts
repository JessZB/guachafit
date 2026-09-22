import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PreferenciasNotificacionService } from '../../src/modules/notificaciones/preferencias-notificacion.service';
import { NotificacionesController } from '../../src/modules/notificaciones/notificaciones.controller';
import {
  CAMPO_CONFIRMACION_FINANZAS,
  matrizPreferenciasPorRol,
  MENSAJE_CANAL_OBLIGATORIO_SEGURIDAD,
  PREFERENCIAS_NOTIFICACION_POR_DEFECTO,
  Rol,
} from '@guachafit/shared';

/**
 * RF-015 (Ola 3 / N2a): matriz COMPLETA de preferencias por rol y canal.
 *
 * Contrato servido por `GET/PUT /notificaciones/preferencias`:
 * - Defaults del doc (§A alumno / §B entrenador) al crear la fila.
 * - Matriz del rol del usuario autenticado, con `canalesObligatorios` (RN-01).
 * - RN-01 (correo de seguridad inviolable) y RN-02 (mínimo un canal en Finanzas) con error claro.
 */
describe('RF-015 N2a: matriz de preferencias de notificaciones por rol y canal', () => {
  let service: PreferenciasNotificacionService;
  let controller: NotificacionesController;
  let mockDb: any;
  let mockDispatcher: any;
  let filaPersistida: any | null;
  let usuarioRol: Rol | null;

  const usuarioId = '22222222-2222-4222-8222-222222222222';
  const reqAlumno = { user: { sub: usuarioId } };

  beforeEach(() => {
    filaPersistida = null;
    usuarioRol = Rol.ALUMNO;

    mockDb = {
      select: vi.fn().mockImplementation((fields?: Record<string, unknown>) => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              // El servicio consulta `usuarios.rol` y la fila de preferencias con la misma cadena.
              if (fields && 'rol' in fields) return usuarioRol ? [{ rol: usuarioRol }] : [];
              return filaPersistida ? [filaPersistida] : [];
            }),
          }),
        }),
      })),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => ({
          returning: vi.fn().mockImplementation(() => {
            filaPersistida = {
              id: 'pref-nueva',
              ...val,
              updatedAtUtc: val.updatedAtUtc ?? new Date(),
            };
            return [filaPersistida];
          }),
        })),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((val) => ({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => {
              if (!filaPersistida) return [];
              filaPersistida = { ...filaPersistida, ...val };
              return [filaPersistida];
            }),
          }),
        })),
      }),
    };

    mockDispatcher = {
      listarNotificacionesInApp: vi.fn().mockResolvedValue([]),
      marcarLeida: vi.fn().mockResolvedValue(true),
      marcarTodasLeidas: vi.fn().mockResolvedValue(0),
    };

    service = new PreferenciasNotificacionService(mockDb);
    controller = new NotificacionesController(service, mockDispatcher);
  });

  // ===========================================================================
  // Escenario 1 — Defaults del doc al inicializar
  // ===========================================================================
  describe('Escenario 1: inicialización automática con los defaults del doc', () => {
    it('un alumno nuevo hereda los defaults del §A (incluidas las filas de seguridad)', async () => {
      const prefs = await controller.obtenerPreferencias(reqAlumno);

      expect(prefs.usuarioId).toBe(usuarioId);
      expect(prefs.rol).toBe(Rol.ALUMNO);
      // §A Finanzas y Pagos
      expect(prefs.notifyPaymentsPush).toBe(true);
      expect(prefs.notifyPaymentsEmail).toBe(true);
      // §A Planificación Deportiva
      expect(prefs.notifyWorkoutsPush).toBe(true);
      expect(prefs.notifyWorkoutsEmail).toBe(false);
      // §A Check-in Antropométrico
      expect(prefs.notifyCheckinsPush).toBe(true);
      expect(prefs.notifyCheckinsEmail).toBe(false);
      // §A Seguridad de Cuenta (Email obligatorio)
      expect(prefs.notifySeguridadPush).toBe(false);
      expect(prefs.notifySeguridadEmail).toBe(true);
    });

    it('la fila nueva persiste la matriz COMPLETA con los defaults del doc (no solo los del rol)', async () => {
      await controller.obtenerPreferencias(reqAlumno);

      // §B Entrenador — presentes en la fila (el rol decide cuáles se gobiernan)
      expect(filaPersistida.notifyCobranzasPush).toBe(true);
      expect(filaPersistida.notifyCobranzasEmail).toBe(true);
      expect(filaPersistida.notifyNuevosRegistrosPush).toBe(true);
      expect(filaPersistida.notifyNuevosRegistrosEmail).toBe(true);
      expect(filaPersistida.notifyReportesProgresoPush).toBe(true);
      expect(filaPersistida.notifyReportesProgresoEmail).toBe(false);
      expect(filaPersistida.digestWeeklyPush).toBe(false);
      expect(filaPersistida.digestWeeklyEmail).toBe(true);

      // Coincide exactamente con la fuente única del contrato.
      for (const [campo, valor] of Object.entries(PREFERENCIAS_NOTIFICACION_POR_DEFECTO)) {
        expect(filaPersistida[campo]).toBe(valor);
      }
    });

    it('devuelve 404 si el usuario no existe (no inventa preferencias)', async () => {
      usuarioRol = null;

      await expect(controller.obtenerPreferencias(reqAlumno)).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // Escenario 2 — Matriz por rol
  // ===========================================================================
  describe('Escenario 2: la respuesta es la matriz del rol del usuario autenticado', () => {
    it('el alumno recibe las 4 filas del §A con su etiqueta y canales', async () => {
      const prefs = await controller.obtenerPreferencias(reqAlumno);

      expect(prefs.matriz.map((fila) => fila.id)).toEqual([
        'FINANZAS',
        'PLANIFICACION_DEPORTIVA',
        'CHECKIN_ANTROPOMETRICO',
        'SEGURIDAD',
      ]);
      expect(prefs.matriz[0]).toMatchObject({
        etiqueta: 'Finanzas y Pagos',
        push: true,
        email: true,
        canalesObligatorios: [],
      });
      expect(prefs.canalesObligatorios).toEqual(['notifySeguridadEmail']);
    });

    it('el entrenador recibe las filas del §B (cobranzas, nuevos registros, reportes, digest)', async () => {
      usuarioRol = Rol.ENTRENADOR;

      const prefs = await controller.obtenerPreferencias(reqAlumno);

      expect(prefs.rol).toBe(Rol.ENTRENADOR);
      expect(prefs.matriz.map((fila) => fila.id)).toEqual([
        'COBRANZAS',
        'NUEVOS_REGISTROS',
        'REPORTES_PROGRESO',
        'RESUMEN_SEMANAL',
        'SEGURIDAD',
      ]);
      const digest = prefs.matriz.find((fila) => fila.id === 'RESUMEN_SEMANAL');
      expect(digest).toMatchObject({ push: false, email: true });
      const reportes = prefs.matriz.find((fila) => fila.id === 'REPORTES_PROGRESO');
      expect(reportes).toMatchObject({ push: true, email: false });
    });

    it('la fila de seguridad reporta el Email como activo y bloqueado aunque la BD lo tenga apagado', async () => {
      filaPersistida = {
        id: 'pref-legacy',
        usuarioId,
        ...PREFERENCIAS_NOTIFICACION_POR_DEFECTO,
        notifySeguridadEmail: false,
        updatedAtUtc: new Date(),
      };

      const prefs = await controller.obtenerPreferencias(reqAlumno);

      const seguridad = prefs.matriz.find((fila) => fila.id === 'SEGURIDAD');
      expect(seguridad?.email).toBe(true);
      expect(seguridad?.canalesObligatorios).toContain('email');
      expect(prefs.notifySeguridadEmail).toBe(true);
    });
  });

  // ===========================================================================
  // Escenario 3 — PUT parcial y pertenencia al rol
  // ===========================================================================
  describe('Escenario 3: actualización parcial de la matriz', () => {
    it('persiste solo los campos enviados y conserva el resto', async () => {
      await controller.obtenerPreferencias(reqAlumno);

      const actualizado = await controller.actualizarPreferencias(reqAlumno, {
        notifyWorkoutsPush: false,
        notifyWorkoutsEmail: true,
      });

      expect(actualizado.notifyWorkoutsPush).toBe(false);
      expect(actualizado.notifyWorkoutsEmail).toBe(true);
      expect(actualizado.notifyPaymentsPush).toBe(true);
      expect(actualizado.notifyPaymentsEmail).toBe(true);
      expect(actualizado.notifyCobranzasPush).toBe(true);
    });

    it('rechaza campos que no pertenecen al rol del usuario', async () => {
      await controller.obtenerPreferencias(reqAlumno);

      await expect(
        controller.actualizarPreferencias(reqAlumno, { notifyCobranzasPush: false })
      ).rejects.toThrow(BadRequestException);

      expect(filaPersistida.notifyCobranzasPush).toBe(true);
    });

    it('un payload con tipos inválidos responde 400 con el detalle por campo (nunca 500)', async () => {
      await controller.obtenerPreferencias(reqAlumno);

      await expect(
        controller.actualizarPreferencias(reqAlumno, { notifyPaymentsPush: 'no-es-booleano' })
      ).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({ error: 'PREFERENCIAS_INVALIDAS' }),
      });
    });
  });

  // ===========================================================================
  // RN-01 — El correo de seguridad no puede desactivarse
  // ===========================================================================
  describe('RN-01: canal obligatorio de seguridad', () => {
    it('el contrato (Zod) rechaza notifySeguridadEmail = false con el mensaje de la interfaz', async () => {
      await controller.obtenerPreferencias(reqAlumno);

      await expect(
        controller.actualizarPreferencias(reqAlumno, { notifySeguridadEmail: false })
      ).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({
          errores: expect.arrayContaining([
            expect.objectContaining({
              campo: 'notifySeguridadEmail',
              mensaje: MENSAJE_CANAL_OBLIGATORIO_SEGURIDAD,
            }),
          ]),
        }),
      });

      expect(filaPersistida.notifySeguridadEmail).toBe(true);
    });

    it('el servicio también rechaza el intento aunque llegue sin pasar por el controlador', async () => {
      await expect(
        service.actualizarPreferencias(usuarioId, {
          notifySeguridadEmail: false,
        } as never)
      ).rejects.toMatchObject({
        response: expect.objectContaining({ error: 'RN-01' }),
      });
    });

    it('permite el resto de cambios y deja el correo de seguridad activo', async () => {
      await controller.obtenerPreferencias(reqAlumno);

      const actualizado = await controller.actualizarPreferencias(reqAlumno, {
        notifySeguridadPush: true,
        notifyCheckinsEmail: true,
      });

      expect(actualizado.notifySeguridadPush).toBe(true);
      expect(actualizado.notifySeguridadEmail).toBe(true);
      expect(actualizado.notifyCheckinsEmail).toBe(true);
    });
  });

  // ===========================================================================
  // RN-02 — Mínimo un canal en Finanzas y Pagos
  // ===========================================================================
  describe('RN-02: advertencia de canal mínimo en Finanzas', () => {
    it('rechaza apagar Push y Email a la vez sin confirmación, con la advertencia del doc', async () => {
      await controller.obtenerPreferencias(reqAlumno);

      await expect(
        controller.actualizarPreferencias(reqAlumno, {
          notifyPaymentsPush: false,
          notifyPaymentsEmail: false,
        })
      ).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({
          errores: expect.arrayContaining([
            expect.objectContaining({
              campo: 'notifyPaymentsPush',
              mensaje: expect.stringContaining(
                'Recomendamos mantener al menos un canal activo para no perder tu acceso por cuotas vencidas'
              ),
            }),
          ]),
        }),
      });

      expect(filaPersistida.notifyPaymentsPush).toBe(true);
      expect(filaPersistida.notifyPaymentsEmail).toBe(true);
    });

    it('con la confirmación explícita se persiste (el usuario decide)', async () => {
      await controller.obtenerPreferencias(reqAlumno);

      const actualizado = await controller.actualizarPreferencias(reqAlumno, {
        notifyPaymentsPush: false,
        notifyPaymentsEmail: false,
        [CAMPO_CONFIRMACION_FINANZAS]: true,
      });

      expect(actualizado.notifyPaymentsPush).toBe(false);
      expect(actualizado.notifyPaymentsEmail).toBe(false);
    });

    it('RN-02 evalúa el estado EFECTIVO: apagar el segundo canal con el primero ya apagado también exige confirmación', async () => {
      await controller.obtenerPreferencias(reqAlumno);
      await controller.actualizarPreferencias(reqAlumno, { notifyPaymentsPush: false });

      await expect(
        controller.actualizarPreferencias(reqAlumno, { notifyPaymentsEmail: false })
      ).rejects.toMatchObject({ status: 400 });

      expect(filaPersistida.notifyPaymentsEmail).toBe(true);
    });

    it('dejar un solo canal activo nunca exige confirmación', async () => {
      await controller.obtenerPreferencias(reqAlumno);

      const actualizado = await controller.actualizarPreferencias(reqAlumno, {
        notifyPaymentsPush: false,
      });

      expect(actualizado.notifyPaymentsPush).toBe(false);
      expect(actualizado.notifyPaymentsEmail).toBe(true);
    });
  });

  // ===========================================================================
  // Escenario 6 del doc — nuevas categorías sin romper lo preexistente
  // ===========================================================================
  describe('Casos borde: migración de categorías', () => {
    it('la matriz declarada por rol cubre todos los campos del contrato (sin campos huérfanos)', () => {
      const camposDeclarados = new Set(
        [Rol.ALUMNO, Rol.ENTRENADOR, Rol.SUPERADMIN].flatMap((rol) =>
          matrizPreferenciasPorRol(rol).flatMap((fila) => [fila.push, fila.email])
        )
      );

      for (const campo of Object.keys(PREFERENCIAS_NOTIFICACION_POR_DEFECTO)) {
        expect(camposDeclarados.has(campo as never)).toBe(true);
      }
    });
  });
});
