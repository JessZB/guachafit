import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DispositivosService } from '../../src/modules/notificaciones/dispositivos.service';
import { DispositivosController } from '../../src/modules/notificaciones/dispositivos.controller';
import { PlataformaDispositivo } from '@guachafit/shared';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('RF-016: Gestión Multi-Dispositivo, Registro de Tokens Push y Depuración Reactiva', () => {
  let service: DispositivosService;
  let controller: DispositivosController;
  let mockDb: any;
  let deviceStore: any[];

  const usuarioId1 = '33333333-3333-4333-8333-333333333331';
  const usuarioId2 = '33333333-3333-4333-8333-333333333332';

  beforeEach(() => {
    deviceStore = [];

    mockDb = {
      select: vi.fn().mockImplementation((fields) => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockImplementation(() => [{ id: usuarioId1 }]), // User exists
          })),
        }),
      })),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((val) => ({
          returning: vi.fn().mockImplementation(() => {
            const row = { id: `dev-${Date.now()}`, ...val };
            deviceStore.push(row);
            return [row];
          }),
        })),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((val) => ({
          where: vi.fn().mockImplementation(() => {
            if (deviceStore.length > 0) {
              deviceStore[0] = { ...deviceStore[0], ...val };
            }
            return {
              returning: vi.fn().mockImplementation(() => {
                return deviceStore.length > 0 ? [deviceStore[0]] : [];
              }),
            };
          }),
        })),
      }),
    };

    service = new DispositivosService(mockDb);
    controller = new DispositivosController(service);
  });

  describe('Escenario 1: Registro Exitoso de Nuevo Dispositivo al Iniciar Sesión (RN-02)', () => {
    it('debe registrar un token nuevo con estado isActive = true y plataforma especificada', async () => {
      // Mock de token no existente previamente
      mockDb.select.mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue([{ id: usuarioId1 }]), // usuario existe
          }),
        }),
      }));
      mockDb.select.mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue([]), // token no existe previamente
          }),
        }),
      }));

      const req = { user: { sub: usuarioId1 } };
      const body = {
        deviceToken: 'fcm_token_samsung_galaxy_s24_ultra',
        platform: PlataformaDispositivo.ANDROID,
      };

      const registrado = await controller.registrarToken(req, body);

      expect(registrado).toBeDefined();
      expect(registrado.usuarioId).toBe(usuarioId1);
      expect(registrado.deviceToken).toBe(body.deviceToken);
      expect(registrado.platform).toBe(PlataformaDispositivo.ANDROID);
      expect(registrado.isActive).toBe(true);
    });
  });

  describe('Escenario 2: Renovación y Reasignación Idempotente de Token (RN-02)', () => {
    it('debe reasignar el token al nuevo usuario si otro usuario inicia sesión en el mismo teléfono', async () => {
      const tokenCompartido = 'fcm_token_tablet_compartida_12345';

      // Simular que el token pertenecía a usuarioId1
      deviceStore.push({
        id: 'dev-old',
        usuarioId: usuarioId1,
        deviceToken: tokenCompartido,
        platform: PlataformaDispositivo.IOS,
        isActive: true,
        updatedAtUtc: new Date(Date.now() - 10000),
      });

      // usuarioId2 se loguea
      mockDb.select.mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue([{ id: usuarioId2 }]),
          }),
        }),
      }));
      mockDb.select.mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue([deviceStore[0]]), // Token encontrado
          }),
        }),
      }));

      const req = { user: { sub: usuarioId2 } };
      const body = {
        deviceToken: tokenCompartido,
        platform: PlataformaDispositivo.IOS,
      };

      const resultado = await controller.registrarToken(req, body);

      expect(resultado.usuarioId).toBe(usuarioId2);
      expect(resultado.isActive).toBe(true);
    });
  });

  describe('Escenario 3: Desactivación por Cierre de Sesión (RN-03)', () => {
    it('debe marcar isActive = false exclusivamente para el token del dispositivo que hizo logout', async () => {
      deviceStore.push({
        id: 'dev-1',
        usuarioId: usuarioId1,
        deviceToken: 'token_a_desactivar_12345',
        platform: PlataformaDispositivo.WEB,
        isActive: true,
        updatedAtUtc: new Date(),
      });

      const req = { user: { sub: usuarioId1 } };
      const res = await controller.desactivarToken(req, 'token_a_desactivar_12345');

      expect(res.success).toBe(true);
      expect(deviceStore[0].isActive).toBe(false);
    });
  });

  describe('Escenario 4: Depuración Reactiva Automática (RN-04)', () => {
    it('debe marcar isActive = false en la BD cuando se invoca marcarTokenInvalido', async () => {
      deviceStore.push({
        id: 'dev-dead',
        usuarioId: usuarioId1,
        deviceToken: 'token_muerto_fcm_not_registered',
        platform: PlataformaDispositivo.ANDROID,
        isActive: true,
        updatedAtUtc: new Date(),
      });

      await service.marcarTokenInvalido('token_muerto_fcm_not_registered');

      expect(mockDb.update).toHaveBeenCalled();
      expect(deviceStore[0].isActive).toBe(false);
    });
  });

  describe('Escenario 5: Validación Zod de Entrada', () => {
    it('debe rechazar tokens vacíos o plataformas no válidas', async () => {
      const req = { user: { sub: usuarioId1 } };
      const invalidBody = {
        deviceToken: 'corto', // min 10
        platform: 'windows-phone',
      };

      // LOTE API-2: el controlador responde 400 (no un ZodError crudo que terminaría en 500).
      await expect(controller.registrarToken(req, invalidBody)).rejects.toThrow(BadRequestException);
    });
  });
});
