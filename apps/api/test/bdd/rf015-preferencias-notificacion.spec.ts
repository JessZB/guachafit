import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PreferenciasNotificacionService } from '../../src/modules/notificaciones/preferencias-notificacion.service';
import { NotificacionesController } from '../../src/modules/notificaciones/notificaciones.controller';
import { NotFoundException } from '@nestjs/common';
import { ZodError } from 'zod';

describe('RF-015: Matriz de Preferencias de Notificaciones por Rol y Canal', () => {
  let service: PreferenciasNotificacionService;
  let controller: NotificacionesController;
  let mockDb: any;
  let mockDispatcher: any;
  let preferencesStore: any[];

  const usuarioId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    preferencesStore = [];

    mockDb = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockImplementation(() => {
              const item = preferencesStore.find((p) => p.usuarioId === usuarioId);
              return item ? [item] : [];
            }),
          })),
        }),
      })),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => ({
          returning: vi.fn().mockImplementation(() => {
            const row = { id: `pref-${Date.now()}`, ...val };
            preferencesStore.push(row);
            return [row];
          }),
        })),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((val) => ({
          where: vi.fn().mockImplementation(() => ({
            returning: vi.fn().mockImplementation(() => {
              const idx = preferencesStore.findIndex((p) => p.usuarioId === usuarioId);
              if (idx >= 0) {
                preferencesStore[idx] = { ...preferencesStore[idx], ...val };
                return [preferencesStore[idx]];
              }
              return [];
            }),
          })),
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

  describe('Escenario 1: Inicialización Automática de Preferencias con Defaults Óptimos', () => {
    it('debe crear y retornar preferencias con los defaults oficiales cuando el usuario no las tiene configuradas', async () => {
      // Mock de verificación de usuario existente
      mockDb.select.mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue([]), // No hay preferencias previas
          }),
        }),
      }));
      mockDb.select.mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue([{ id: usuarioId }]), // Usuario existe
          }),
        }),
      }));

      const req = { user: { sub: usuarioId } };
      const prefs = await controller.obtenerPreferencias(req);

      expect(prefs).toBeDefined();
      expect(prefs.usuarioId).toBe(usuarioId);
      expect(prefs.notifyPaymentsPush).toBe(true);
      expect(prefs.notifyPaymentsEmail).toBe(true);
      expect(prefs.notifyWorkoutsPush).toBe(true);
      expect(prefs.notifyWorkoutsEmail).toBe(false);
      expect(prefs.notifyCheckinsPush).toBe(true);
      expect(prefs.notifyCheckinsEmail).toBe(false);
      expect(prefs.digestWeeklyEmail).toBe(false);
    });
  });

  describe('Escenario 2: Alumno Personaliza Preferencias Deportivas', () => {
    it('debe actualizar notifyWorkoutsPush = false preservando el resto de los canales', async () => {
      // Poblar con preferencias existentes
      preferencesStore.push({
        id: 'pref-init',
        usuarioId,
        notifyPaymentsPush: true,
        notifyPaymentsEmail: true,
        notifyWorkoutsPush: true,
        notifyWorkoutsEmail: false,
        notifyCheckinsPush: true,
        notifyCheckinsEmail: false,
        digestWeeklyEmail: false,
        updatedAtUtc: new Date(),
      });

      const req = { user: { sub: usuarioId } };
      const body = {
        notifyWorkoutsPush: false,
        notifyWorkoutsEmail: true,
      };

      const actualizado = await controller.actualizarPreferencias(req, body);

      expect(actualizado.notifyWorkoutsPush).toBe(false);
      expect(actualizado.notifyWorkoutsEmail).toBe(true);
      // Los no enviados deben mantenerse
      expect(actualizado.notifyPaymentsPush).toBe(true);
      expect(actualizado.notifyPaymentsEmail).toBe(true);
    });
  });

  describe('Escenario 3: Validación de Esquema Zod en el Controlador', () => {
    it('debe rechazar payload con tipos inválidos', async () => {
      const req = { user: { sub: usuarioId } };
      const invalidBody = {
        notifyPaymentsPush: 'no-es-booleano',
      };

      await expect(controller.actualizarPreferencias(req, invalidBody)).rejects.toThrow(ZodError);
    });
  });
});
