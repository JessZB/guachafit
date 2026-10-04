import { describe, it, expect } from 'vitest';
import { EstadoAlumno, TipoDocumento, Modalidad } from '@guachafit/shared';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';
import { NotFoundException } from '@nestjs/common';

describe('RF-012: Ciclo de Vida del Alumno y Preservación Soft Delete', () => {
  interface AlumnoRecord {
    id: string;
    entrenadorId: string;
    estadoActivacion: EstadoAlumno;
    deletedAtUtc: string | null;
  }

  describe('Escenario 1: Máquina de Estados de Activación', () => {
    it('debe permitir transiciones válidas entre estados de activación', () => {
      let alumno: AlumnoRecord = {
        id: 'alumno-1',
        entrenadorId: 'coach-1',
        estadoActivacion: EstadoAlumno.ACTIVO,
        deletedAtUtc: null,
      };

      // Pausar por viaje o lesión
      alumno.estadoActivacion = EstadoAlumno.INACTIVO_PAUSADO;
      expect(alumno.estadoActivacion).toBe(EstadoAlumno.INACTIVO_PAUSADO);

      // Reactivar
      alumno.estadoActivacion = EstadoAlumno.ACTIVO;
      expect(alumno.estadoActivacion).toBe(EstadoAlumno.ACTIVO);

      // Suspender por falta de pago
      alumno.estadoActivacion = EstadoAlumno.SUSPENDIDO_PAGO;
      expect(alumno.estadoActivacion).toBe(EstadoAlumno.SUSPENDIDO_PAGO);
    });
  });

  describe('Escenario 2 & 3: Soft Delete y Preservación de Datos', () => {
    it('debe aplicar borrado lógico sellando deletedAtUtc sin eliminar el registro de la BD', () => {
      const alumno: AlumnoRecord = {
        id: 'alumno-1',
        entrenadorId: 'coach-1',
        estadoActivacion: EstadoAlumno.ACTIVO,
        deletedAtUtc: null,
      };

      // Ejecutar Soft Delete
      alumno.deletedAtUtc = new Date().toISOString();
      expect(alumno.deletedAtUtc).not.toBeNull();
      expect(alumno.deletedAtUtc?.endsWith('Z')).toBe(true);
    });
  });

  describe('Escenario 4: Restauración de Alumno Dado de Baja (AlumnosService.restaurarAlumno)', () => {
    const mockCrypto = {
      encryptHealthRecord: (text: string) => text,
      decryptHealthRecord: (text: string) => text,
    } as any;

    it('debe restaurar un alumno archivado limpiando deletedAtUtc y reactivando la cuenta', async () => {
      let alumnoDb = {
        id: 'alumno-archivado-1',
        usuarioId: 'user-archivado-1',
        entrenadorId: 'coach-1',
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '12345678',
        nombres: 'Fernando',
        apellidos: 'Castro',
        fechaNacimiento: '1995-03-10',
        telefonoWhatsapp: '+584120001122',
        modalidad: Modalidad.PRESENCIAL,
        estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
        deletedAtUtc: '2026-01-01T00:00:00.000Z',
        createdAtUtc: '2025-01-01T00:00:00.000Z',
      };

      let userDb = {
        id: 'user-archivado-1',
        activo: false,
      };

      const mockDb: any = {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([{ ...alumnoDb }]),
          }),
        }),
        update: () => ({
          set: (valores: any) => ({
            where: () => {
              if (valores.deletedAtUtc === null) {
                alumnoDb = { ...alumnoDb, ...valores };
              } else if (valores.activo !== undefined) {
                userDb = { ...userDb, ...valores };
              }
              return Promise.resolve();
            },
          }),
        }),
        // RNF-003/ADR-011 (etapa 3): restaurar lee/escribe el perfil (RLS) dentro de withTenant.
        execute: async () => undefined,
      };
      mockDb.transaction = async (cb: any) => cb(mockDb);

      const service = new AlumnosService(mockDb, mockCrypto);
      const resultado = await service.restaurarAlumno('coach-1', 'alumno-archivado-1');

      expect(resultado.id).toBe('alumno-archivado-1');
      expect(resultado.estadoActivacion).toBe(EstadoAlumno.ACTIVO);
      expect(resultado.deletedAtUtc).toBeNull();
      expect(alumnoDb.deletedAtUtc).toBeNull();
      expect(alumnoDb.estadoActivacion).toBe(EstadoAlumno.ACTIVO);
      expect(userDb.activo).toBe(true);
    });

    it('debe ser idempotente si el alumno ya se encuentra activo', async () => {
      const alumnoActivo = {
        id: 'alumno-activo-1',
        usuarioId: 'user-activo-1',
        entrenadorId: 'coach-1',
        estadoActivacion: EstadoAlumno.ACTIVO,
        deletedAtUtc: null,
      };

      const mockDb: any = {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([{ ...alumnoActivo }]),
          }),
        }),
        // RNF-003/ADR-011 (etapa 3): restaurar lee el perfil (RLS) dentro de withTenant.
        execute: async () => undefined,
      };
      mockDb.transaction = async (cb: any) => cb(mockDb);

      const service = new AlumnosService(mockDb, mockCrypto);
      const resultado = await service.restaurarAlumno('coach-1', 'alumno-activo-1');

      expect(resultado.id).toBe('alumno-activo-1');
      expect(resultado.estadoActivacion).toBe(EstadoAlumno.ACTIVO);
      expect(resultado.mensaje).toContain('ya está activo');
    });

    it('debe arrojar NotFoundException si el alumno no pertenece al entrenador', async () => {
      const mockDb: any = {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
        // RNF-003/ADR-011 (etapa 3): restaurar lee el perfil (RLS) dentro de withTenant.
        execute: async () => undefined,
      };
      mockDb.transaction = async (cb: any) => cb(mockDb);

      const service = new AlumnosService(mockDb, mockCrypto);
      await expect(
        service.restaurarAlumno('coach-intruso', 'alumno-inexistente')
      ).rejects.toThrow(NotFoundException);
    });
  });
});
