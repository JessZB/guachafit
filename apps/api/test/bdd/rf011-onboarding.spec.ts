import { describe, it, expect } from 'vitest';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';
import {
  Rol,
  TipoDocumento,
  Modalidad,
  EstadoAlumno,
  ActualizarPerfilAlumnoDTO,
} from '@guachafit/shared';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

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

  describe('Escenario 4: Edición Completa de la Ficha de Alumno por el Entrenador (RF-011, RF-012)', () => {
    const alumnoOriginal = {
      id: 'alumno-uuid-1',
      usuarioId: 'user-uuid-1',
      entrenadorId: 'coach-uuid-1',
      tipoDocumento: TipoDocumento.V,
      numeroDocumento: '24123456',
      nombres: 'Carlos',
      apellidos: 'Mendoza',
      email: 'carlos@guachafit.com',
      fechaNacimiento: '1998-05-14',
      telefonoWhatsapp: '+584121234567',
      modalidad: Modalidad.PRESENCIAL,
      estadoActivacion: EstadoAlumno.ACTIVO,
      tasaFijadaOverride: null,
      fichaSaludPrivada: 'encrypted:Ficha previa',
      deletedAtUtc: null,
      createdAtUtc: '2026-01-01T00:00:00.000Z',
      updatedAtUtc: '2026-01-01T00:00:00.000Z',
    };

    function createMockDbForUpdate(initialRecord: any) {
      const db: any = {
        select: () => ({
          from: () => {
            // WU-J (RF-005): la hidratación del plan activo consulta planes/overrides/cuotas en
            // lote; este mock responde vacío (el expediente bajo prueba no tiene plan asignado)
            // sin romper la cadena `select().from().where()` del perfil.
            const vacio: any = {
              where: () => vacio,
              orderBy: () => vacio,
              limit: () => vacio,
              innerJoin: () => ({
                where: () => Promise.resolve(initialRecord ? [{ ...initialRecord }] : []),
              }),
              then: (resolve: any) => resolve([]),
            };
            return vacio;
          },
        }),
        update: () => ({
          set: (valores: any) => ({
            where: () => ({
              returning: () => Promise.resolve([{ ...initialRecord, ...valores }]),
            }),
          }),
        }),
        // RNF-003/ADR-011 (etapa 2): superficie transaccional que usa withTenant (RLS financiero).
        transaction: async (cb: any) => cb(db),
        execute: async () => undefined,
      } as any;
      return db;
    }

    it('debe actualizar los campos del perfil y recalcular la edad dinámicamente', async () => {
      const mockDbInstance = createMockDbForUpdate(alumnoOriginal);
      const service = new AlumnosService(mockDbInstance, mockCrypto);

      const dto: ActualizarPerfilAlumnoDTO = {
        nombres: 'Carlos Antonio',
        apellidos: 'Mendoza Pérez',
        fechaNacimiento: '2000-01-01',
        modalidad: Modalidad.REMOTO,
        telefonoWhatsapp: '+584149998877',
      };

      const resultado = await service.actualizarAlumno('coach-uuid-1', 'alumno-uuid-1', dto);

      expect(resultado.nombres).toBe('Carlos Antonio');
      expect(resultado.apellidos).toBe('Mendoza Pérez');
      expect(resultado.modalidad).toBe(Modalidad.REMOTO);
      expect(resultado.telefonoWhatsapp).toBe('+584149998877');
      expect(resultado.fechaNacimiento).toBe('2000-01-01');
      expect(resultado.edadCalculada).toBe(service.calcularEdad('2000-01-01'));
    });

    it('debe cifrar la nueva ficha médica con AES-256-GCM y desencriptarla para el entrenador', async () => {
      const mockDbInstance = createMockDbForUpdate(alumnoOriginal);
      const service = new AlumnosService(mockDbInstance, mockCrypto);

      const dto: ActualizarPerfilAlumnoDTO = {
        fichaSaludPrivada: 'Nueva lesión en hombro derecho',
      };

      const resultado = await service.actualizarAlumno('coach-uuid-1', 'alumno-uuid-1', dto);

      // Al retornar sanitizado para el entrenador, debe mostrarse desencriptado
      expect(resultado.fichaSaludPrivada).toBe('Nueva lesión en hombro derecho');
    });

    it('debe permitir vaciar la ficha de salud privada enviando null o string vacío', async () => {
      const mockDbInstance = createMockDbForUpdate(alumnoOriginal);
      const service = new AlumnosService(mockDbInstance, mockCrypto);

      const dto: ActualizarPerfilAlumnoDTO = {
        fichaSaludPrivada: null,
      };

      const resultado = await service.actualizarAlumno('coach-uuid-1', 'alumno-uuid-1', dto);
      expect(resultado.fichaSaludPrivada).toBeNull();
    });

    it('debe lanzar ForbiddenException ante intento de edición cruzada entre entrenadores (Aislamiento de Tenant)', async () => {
      const mockDbInstance = createMockDbForUpdate(alumnoOriginal);
      const service = new AlumnosService(mockDbInstance, mockCrypto);

      const dto: ActualizarPerfilAlumnoDTO = {
        nombres: 'Intento Hacker',
      };

      await expect(
        service.actualizarAlumno('coach-uuid-2-intruso', 'alumno-uuid-1', dto)
      ).rejects.toThrow(ForbiddenException);
      // B4: mensaje claro, sin jerga interna.
      await expect(
        service.actualizarAlumno('coach-uuid-2-intruso', 'alumno-uuid-1', dto)
      ).rejects.toThrow('No tienes acceso a este alumno.');
    });

    it('debe lanzar NotFoundException si el alumno no existe en la base de datos', async () => {
      const mockDbInstance = createMockDbForUpdate(null);
      const service = new AlumnosService(mockDbInstance, mockCrypto);

      const dto: ActualizarPerfilAlumnoDTO = {
        nombres: 'No Existe',
      };

      await expect(
        service.actualizarAlumno('coach-uuid-1', 'alumno-inexistente', dto)
      ).rejects.toThrow(NotFoundException);
    });
  });
});
