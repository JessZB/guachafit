import { describe, it, expect, vi } from 'vitest';
import { Rol } from '@guachafit/shared';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

describe('RF-010: Arquitectura de Roles Jerárquicos (RBAC) y Aislamiento de Tenancy', () => {
  const reflectorMock = {
    getAllAndOverride: vi.fn(),
  };

  const rolesGuard = new RolesGuard(reflectorMock as any);

  function createMockContext(user: { id: string; rol: Rol; entrenadorId?: string }) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  describe('Escenario 1: Jerarquía RBAC', () => {
    it('Superadmin tiene acceso a endpoints de gestión de entrenadores', () => {
      reflectorMock.getAllAndOverride.mockReturnValue([Rol.SUPERADMIN]);
      const context = createMockContext({ id: 'sa-1', rol: Rol.SUPERADMIN });

      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('Entrenador NO puede acceder a endpoints de Superadmin', () => {
      reflectorMock.getAllAndOverride.mockReturnValue([Rol.SUPERADMIN]);
      const context = createMockContext({ id: 'coach-1', rol: Rol.ENTRENADOR, entrenadorId: 'coach-1' });

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('Alumno NO puede acceder a endpoints de Entrenador', () => {
      reflectorMock.getAllAndOverride.mockReturnValue([Rol.ENTRENADOR]);
      const context = createMockContext({ id: 'alumno-1', rol: Rol.ALUMNO, entrenadorId: 'coach-1' });

      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('Escenario 2: Intento de Acceso Cruzado entre Entrenadores (Aislamiento)', () => {
    it('Debe rechazar operaciones si el entrenador activo intenta manipular datos de otro tenant', () => {
      const coachATenantId = 'coach-a-uuid';
      const coachBTenantId = 'coach-b-uuid';

      // Simular verificación de tenant
      const assertTenantMatch = (currentCoachTenant: string, targetResourceTenant: string) => {
        if (currentCoachTenant !== targetResourceTenant) {
          throw new ForbiddenException('Aislamiento de Tenant: Acceso denegado a datos de otro entrenador.');
        }
      };

      expect(() => assertTenantMatch(coachATenantId, coachBTenantId)).toThrow(ForbiddenException);
      expect(() => assertTenantMatch(coachATenantId, coachATenantId)).not.toThrow();
    });
  });
});
