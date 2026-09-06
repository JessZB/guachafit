import { describe, it, expect } from 'vitest';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';
import { Rol } from '@guachafit/shared';

describe('RF-011: Onboarding Híbrido de Alumnos (Registro Manual y Enlace Deep Link)', () => {
  const mockDb = {} as any;
  const mockCrypto = {
    encryptHealthRecord: (text: string) => `encrypted:${text}`,
    decryptHealthRecord: (text: string) => text.replace('encrypted:', ''),
    generateInvitationToken: () => ({
      rawToken: 'raw-token-123456789012345678901234567890',
      tokenHash: 'token-hash-123',
      expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
    }),
  } as any;

  const alumnosService = new AlumnosService(mockDb, mockCrypto);

  describe('Escenario 1: Cálculo Dinámico de Edad', () => {
    it('debe calcular la edad exacta en años según la fecha de nacimiento', () => {
      // Tomando como referencia fecha de nacimiento de 1994-05-15
      const edadCalculada = alumnosService.calcularEdad('1994-05-15');
      const now = new Date();
      let expectedAge = now.getFullYear() - 1994;
      const monthDiff = now.getMonth() - 4; // Mayo es 4 (0-index)
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < 15)) {
        expectedAge--;
      }

      expect(edadCalculada).toBe(expectedAge);
    });

    it('debe calcular 0 años para recién nacidos', () => {
      const hoy = new Date().toISOString().split('T')[0];
      expect(alumnosService.calcularEdad(hoy)).toBe(0);
    });
  });

  describe('Escenario 3: Confidencialidad de la Ficha de Salud Privada (RNF-003)', () => {
    const rawPerfil = {
      id: 'alumno-1',
      usuarioId: 'user-1',
      entrenadorId: 'coach-1',
      tipoDocumento: 'V_',
      numeroDocumento: '24123456',
      nombres: 'Carlos',
      apellidos: 'Mendoza',
      fechaNacimiento: '1998-05-14',
      telefonoWhatsapp: '+584121234567',
      modalidad: 'presencial',
      estadoActivacion: 'activo',
      tasaFijadaOverride: null,
      fichaSaludPrivada: 'encrypted:Cirugía de rodilla',
      deletedAtUtc: null,
      createdAtUtc: new Date().toISOString(),
    };

    it('el Entrenador puede visualizar la ficha de salud desencriptada', () => {
      const dto = alumnosService.sanitizarPerfilParaRol(rawPerfil as any, Rol.ENTRENADOR);
      expect(dto.fichaSaludPrivada).toBe('Cirugía de rodilla');
    });

    it('el Alumno NO tiene acceso ni visibilidad sobre la ficha de salud privada', () => {
      const dto = alumnosService.sanitizarPerfilParaRol(rawPerfil as any, Rol.ALUMNO);
      expect(dto.fichaSaludPrivada).toBeNull();
    });
  });
});
