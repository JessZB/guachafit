import { describe, it, expect, beforeEach } from 'vitest';
import {
  Rol,
  Modalidad,
  AnguloFoto,
  ConsultaComparadorFotograficoSchema,
} from '@guachafit/shared';
import { BadRequestException } from '@nestjs/common';
import {
  AntropometriaTestEngine,
  AlumnoAntropometriaProfile,
} from './helpers/antropometria-test-engine';

describe('RF-004: Visualización de Evolución Corporal y Comparador Fotográfico', () => {
  let engine: AntropometriaTestEngine;

  const coachId = 'c1111111-1111-4111-8111-111111111111';
  const alumnoId = 'a4444444-4444-4444-8444-444444444444';

  const alumno: AlumnoAntropometriaProfile = {
    id: alumnoId,
    entrenadorId: coachId,
    nombres: 'Pedro',
    apellidos: 'Gómez',
    modalidad: Modalidad.REMOTO,
  };

  const actorCoach = { id: coachId, rol: Rol.ENTRENADOR, entrenadorId: coachId };
  const actorAlumno = { id: alumnoId, rol: Rol.ALUMNO };

  beforeEach(() => {
    engine = new AntropometriaTestEngine();
    engine.registrarAlumno(alumno);
  });

  describe('Escenario 1: Generación de Gráfico Multieje de Evolución Corporal y Cálculo de Cambio Neto (Gherkin Escenario 1 & RN-01)', () => {
    it('debe filtrar estrictamente las evaluaciones en estado Aprobado y calcular el delta neto de peso y grasa', async () => {
      // Given que el cliente tiene registros aprobados a lo largo de los últimos meses
      // Control 1 (Semana 1 / 10 Enero) - Aprobado
      const control1 = await engine.registrarCheckin({
        actor: actorAlumno,
        alumno,
        dto: {
          alumnoId,
          fechaEvaluacion: '2026-01-10',
          pesoKg: '86.00',
          porcentajeGrasa: '22.50',
          fotos: [
            {
              angulo: AnguloFoto.FRONTAL,
              storageKey: `antropometria/${alumnoId}/2026/11111111-1111-4111-8111-000000000101.webp`,
            },
          ],
        },
        customId: '11111111-1111-4111-8111-000000000001',
      });
      engine.conciliarCheckin({
        coachId,
        controlId: control1.id,
        dto: { accion: 'aprobar', observacionesCoach: 'Inicio de plan hipertrofia' },
      });

      // Control 2 (Semana 4 / 07 Febrero) - Aprobado
      const control2 = await engine.registrarCheckin({
        actor: actorAlumno,
        alumno,
        dto: {
          alumnoId,
          fechaEvaluacion: '2026-02-07',
          pesoKg: '84.20',
          porcentajeGrasa: '20.80',
        },
        customId: '11111111-1111-4111-8111-000000000002',
      });
      engine.conciliarCheckin({
        coachId,
        controlId: control2.id,
        dto: { accion: 'aprobar' },
      });

      // Control 3 (Semana 6 / 21 Febrero) - PENDIENTE DE APROBACIÓN (no debe figurar en la curva)
      await engine.registrarCheckin({
        actor: actorAlumno,
        alumno,
        dto: {
          alumnoId,
          fechaEvaluacion: '2026-02-21',
          pesoKg: '99.00', // Valor anómalo no validado
          porcentajeGrasa: '30.00',
        },
        customId: '11111111-1111-4111-8111-000000000003',
      });

      // Control 4 (Semana 7 / 28 Febrero) - RECHAZADO (no debe figurar en la curva)
      const control4 = await engine.registrarCheckin({
        actor: actorAlumno,
        alumno,
        dto: {
          alumnoId,
          fechaEvaluacion: '2026-02-28',
          pesoKg: '83.50',
          porcentajeGrasa: '20.00',
        },
        customId: '11111111-1111-4111-8111-000000000004',
      });
      engine.conciliarCheckin({
        coachId,
        controlId: control4.id,
        dto: { accion: 'rechazar', motivoRechazo: 'Datos duplicados' },
      });

      // Control 5 (Semana 8 / 05 Marzo) - Aprobado
      const control5 = await engine.registrarCheckin({
        actor: actorAlumno,
        alumno,
        dto: {
          alumnoId,
          fechaEvaluacion: '2026-03-05',
          pesoKg: '81.50',
          porcentajeGrasa: '18.50',
          fotos: [
            {
              angulo: AnguloFoto.FRONTAL,
              storageKey: `antropometria/${alumnoId}/2026/11111111-1111-4111-8111-000000000105.webp`,
            },
          ],
        },
        customId: '11111111-1111-4111-8111-000000000005',
      });
      engine.conciliarCheckin({
        coachId,
        controlId: control5.id,
        dto: { accion: 'aprobar', observacionesCoach: 'Cierre del primer mesociclo' },
      });

      // When accede a la pestaña "Evolución Corporal" solicitando rango de fechas
      const evolucion = await engine.obtenerEvolucionCorporal(alumnoId, {
        desde: '2026-01-01',
        hasta: '2026-03-31',
      });

      // Then el sistema debe filtrar estrictamente las 3 evaluaciones aprobadas (excluyendo pendiente y rechazada)
      expect(evolucion.totalEvaluaciones).toBe(3);
      expect(evolucion.evaluaciones.map((e) => e.id)).toEqual([
        '11111111-1111-4111-8111-000000000001',
        '11111111-1111-4111-8111-000000000002',
        '11111111-1111-4111-8111-000000000005',
      ]);

      // And verificar orden cronológico ascendente
      expect(evolucion.evaluaciones[0].fechaEvaluacion).toBe('2026-01-10');
      expect(evolucion.evaluaciones[1].fechaEvaluacion).toBe('2026-02-07');
      expect(evolucion.evaluaciones[2].fechaEvaluacion).toBe('2026-03-05');

      // And calcular el cambio neto en kg: 81.50 - 86.00 = -4.50 kg
      expect(evolucion.cambioNetoPesoKg).toBe('-4.50');

      // And calcular el cambio neto en puntos porcentuales de grasa: 18.50 - 22.50 = -4.00%
      expect(evolucion.cambioNetoGrasaPorcentaje).toBe('-4.00');

      // And las fotos de cada registro cuentan con URLs firmadas GET temporales
      const fotosCtrl1 = evolucion.evaluaciones[0].fotos;
      expect(fotosCtrl1.length).toBe(1);
      expect(fotosCtrl1[0].presignedGetUrl).toContain('X-Amz-Expires=900');
    });
  });

  describe('Escenario 2: Comparativa Fotográfica Semana A vs. Semana B (Gherkin Escenario 2 & RN-02)', () => {
    const idControlA = '22222222-2222-4222-8222-000000000001';
    const idControlB = '22222222-2222-4222-8222-000000000002';

    beforeEach(async () => {
      // Control A (Semana 1 / 10 Enero): 85.00 kg, 22.00% grasa, fotos Frontal y Lateral
      const ctrlA = await engine.registrarCheckin({
        actor: actorCoach,
        alumno,
        dto: {
          alumnoId,
          fechaEvaluacion: '2026-01-10',
          pesoKg: '85.00',
          porcentajeGrasa: '22.00',
          fotos: [
            {
              angulo: AnguloFoto.FRONTAL,
              storageKey: `antropometria/${alumnoId}/2026/11111111-1111-4111-8111-000000000201.webp`,
            },
            {
              angulo: AnguloFoto.LATERAL,
              storageKey: `antropometria/${alumnoId}/2026/11111111-1111-4111-8111-000000000202.webp`,
            },
          ],
        },
        customId: idControlA,
      });

      // Control B (Semana 8 / 05 Marzo): 81.50 kg, 18.50% grasa, fotos Frontal y Lateral
      const ctrlB = await engine.registrarCheckin({
        actor: actorCoach,
        alumno,
        dto: {
          alumnoId,
          fechaEvaluacion: '2026-03-05',
          pesoKg: '81.50',
          porcentajeGrasa: '18.50',
          fotos: [
            {
              angulo: AnguloFoto.FRONTAL,
              storageKey: `antropometria/${alumnoId}/2026/11111111-1111-4111-8111-000000000203.webp`,
            },
            {
              angulo: AnguloFoto.LATERAL,
              storageKey: `antropometria/${alumnoId}/2026/11111111-1111-4111-8111-000000000204.webp`,
            },
          ],
        },
        customId: idControlB,
      });
    });

    it('debe presentar ambas imágenes con URLs firmadas GET (TTL 15 min / 900s) y metadatos de fecha y peso', async () => {
      // Given que el usuario selecciona el comparador fotográfico para el ángulo lateral
      const comparadorDto = {
        controlIdA: idControlA,
        controlIdB: idControlB,
        angulo: AnguloFoto.LATERAL,
      };

      const parsed = ConsultaComparadorFotograficoSchema.safeParse(comparadorDto);
      expect(parsed.success).toBe(true);

      // When solicita la comparativa
      const comparativa = await engine.compararFotografias(alumnoId, comparadorDto);

      // Then el sistema debe presentar ambas imágenes con URLs firmadas temporales
      expect(comparativa.angulo).toBe(AnguloFoto.LATERAL);
      expect(comparativa.fotoDisponible).toBe(true);

      expect(comparativa.fotoA).not.toBeNull();
      expect(comparativa.fotoA?.storageKey).toBe(`antropometria/${alumnoId}/2026/11111111-1111-4111-8111-000000000202.webp`);
      expect(comparativa.fotoA?.presignedGetUrl).toContain('X-Amz-Expires=900');

      expect(comparativa.fotoB).not.toBeNull();
      expect(comparativa.fotoB?.storageKey).toBe(`antropometria/${alumnoId}/2026/11111111-1111-4111-8111-000000000204.webp`);
      expect(comparativa.fotoB?.presignedGetUrl).toContain('X-Amz-Expires=900');

      // And mostrar la fecha y peso correspondiente a cada una de las dos tomas
      expect(comparativa.controlA.fechaEvaluacion).toBe('2026-01-10');
      expect(comparativa.controlA.pesoKg).toBe('85.00');
      expect(comparativa.controlA.porcentajeGrasa).toBe('22.00');

      expect(comparativa.controlB.fechaEvaluacion).toBe('2026-03-05');
      expect(comparativa.controlB.pesoKg).toBe('81.50');
      expect(comparativa.controlB.porcentajeGrasa).toBe('18.50');

      // And calcular la diferencia cuantitativa
      expect(comparativa.diferenciaPesoKg).toBe('-3.50');
      expect(comparativa.diferenciaGrasaPorcentaje).toBe('-3.50');
    });

    it('debe rechazar la comparativa si alguno de los controles no está en estado Aprobado (ADR-001)', async () => {
      // Crear un control pendiente
      const idControlPendiente = '22222222-2222-4222-8222-000000000099';
      await engine.registrarCheckin({
        actor: actorAlumno,
        alumno,
        dto: {
          alumnoId,
          fechaEvaluacion: '2026-03-10',
          pesoKg: '80.00',
        },
        customId: idControlPendiente,
      });

      await expect(
        engine.compararFotografias(alumnoId, {
          controlIdA: idControlA,
          controlIdB: idControlPendiente,
          angulo: AnguloFoto.LATERAL,
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Escenario 3: Caso Borde - Perspectiva Fotográfica Faltante en una Fecha (RF-004 §6)', () => {
    const idControlX = '33333333-3333-4333-8333-000000000001';
    const idControlY = '33333333-3333-4333-8333-000000000002';

    beforeEach(async () => {
      // Control X tiene foto frontal pero NO posterior
      await engine.registrarCheckin({
        actor: actorCoach,
        alumno,
        dto: {
          alumnoId,
          fechaEvaluacion: '2026-02-01',
          pesoKg: '80.00',
          fotos: [
            {
              angulo: AnguloFoto.FRONTAL,
              storageKey: `antropometria/${alumnoId}/2026/11111111-1111-4111-8111-000000000301.webp`,
            },
          ],
        },
        customId: idControlX,
      });

      // Control Y tiene foto frontal y posterior
      await engine.registrarCheckin({
        actor: actorCoach,
        alumno,
        dto: {
          alumnoId,
          fechaEvaluacion: '2026-03-01',
          pesoKg: '77.50',
          fotos: [
            {
              angulo: AnguloFoto.FRONTAL,
              storageKey: `antropometria/${alumnoId}/2026/11111111-1111-4111-8111-000000000302.webp`,
            },
            {
              angulo: AnguloFoto.POSTERIOR,
              storageKey: `antropometria/${alumnoId}/2026/11111111-1111-4111-8111-000000000303.webp`,
            },
          ],
        },
        customId: idControlY,
      });
    });

    it('debe responder exitosamente sin error 500 marcando fotoDisponible = false y foto = null', async () => {
      // When se solicita la comparativa para la perspectiva "Posterior" que falta en el Control X
      const comparativa = await engine.compararFotografias(alumnoId, {
        controlIdA: idControlX,
        controlIdB: idControlY,
        angulo: AnguloFoto.POSTERIOR,
      });

      // Then el sistema NO lanza error 500 y retorna fotoDisponible = false
      expect(comparativa.fotoDisponible).toBe(false);

      // And fotoA es null mientras que fotoB sí existe con su URL firmada
      expect(comparativa.fotoA).toBeNull();
      expect(comparativa.fotoB).not.toBeNull();
      expect(comparativa.fotoB?.storageKey).toBe(`antropometria/${alumnoId}/2026/11111111-1111-4111-8111-000000000303.webp`);

      // And los metadatos de peso y fecha siguen estando disponibles para comparación analítica
      expect(comparativa.controlA.pesoKg).toBe('80.00');
      expect(comparativa.controlB.pesoKg).toBe('77.50');
      expect(comparativa.diferenciaPesoKg).toBe('-2.50');
    });
  });
});
