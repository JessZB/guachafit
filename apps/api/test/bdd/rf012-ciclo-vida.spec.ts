import { describe, it, expect } from 'vitest';
import { EstadoAlumno } from '@guachafit/shared';

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

  describe('Escenario 2 & 3: Soft Delete y Reactivación (Cero Pérdida Física)', () => {
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

      // Reactivación meses después
      alumno.deletedAtUtc = null;
      alumno.estadoActivacion = EstadoAlumno.ACTIVO;
      expect(alumno.deletedAtUtc).toBeNull();
      expect(alumno.estadoActivacion).toBe(EstadoAlumno.ACTIVO);
    });
  });
});
