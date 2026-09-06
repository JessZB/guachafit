import { describe, it, expect, beforeEach } from 'vitest';
import {
  Rol,
  Modalidad,
  OrigenAntropometria,
  EstadoMedicion,
  AnguloFoto,
  CheckinAntropometricoSchema,
  ConciliarAntropometriaSchema,
} from '@guachafit/shared';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import {
  AntropometriaTestEngine,
  AlumnoAntropometriaProfile,
} from './helpers/antropometria-test-engine';

describe('RF-003: Check-in Antropométrico y Auditoría RBAC Híbrida (Presencial vs. Remoto)', () => {
  let engine: AntropometriaTestEngine;

  const coachId = 'c1111111-1111-4111-8111-111111111111';
  const alumnoPresencialId = 'a2222222-2222-4222-8222-222222222222';
  const alumnoRemotoId = 'a3333333-3333-4333-8333-333333333333';

  const alumnoPresencial: AlumnoAntropometriaProfile = {
    id: alumnoPresencialId,
    entrenadorId: coachId,
    nombres: 'Juan',
    apellidos: 'Pérez',
    modalidad: Modalidad.PRESENCIAL,
  };

  const alumnoRemoto: AlumnoAntropometriaProfile = {
    id: alumnoRemotoId,
    entrenadorId: coachId,
    nombres: 'María',
    apellidos: 'López',
    modalidad: Modalidad.REMOTO,
  };

  beforeEach(() => {
    engine = new AntropometriaTestEngine();
    engine.registrarAlumno(alumnoPresencial);
    engine.registrarAlumno(alumnoRemoto);
  });

  describe('Escenario 1: Registro Presencial Realizado por el Entrenador (Gherkin Escenario 1 & RN-03)', () => {
    it('debe registrar la medición con origen presencial_verificado, estado aprobado, fechaAprobacionUtc inmediata y registradoPor coachId', async () => {
      // Given que el cliente "Juan Pérez" tiene modalidad "Presencial"
      expect(alumnoPresencial.modalidad).toBe(Modalidad.PRESENCIAL);

      // And el entrenador se encuentra autenticado en consulta en el gimnasio
      const actorCoach = { id: coachId, rol: Rol.ENTRENADOR, entrenadorId: coachId };

      const checkinPayload = {
        alumnoId: alumnoPresencialId,
        fechaEvaluacion: '2026-09-06',
        pesoKg: '78.50',
        alturaCm: '178.00',
        porcentajeGrasa: '15.50',
        perimetros: {
          pechoCm: '102.50',
          cinturaCm: '82.00',
          caderaCm: '98.00',
          brazoCm: '37.50',
          musloCm: '58.00',
          cuelloCm: '39.00',
        },
        fotos: [
          {
            angulo: AnguloFoto.FRONTAL,
            storageKey: `antropometria/${alumnoPresencialId}/2026/foto-frontal-1.webp`,
          },
          {
            angulo: AnguloFoto.LATERAL,
            storageKey: `antropometria/${alumnoPresencialId}/2026/foto-lateral-1.webp`,
          },
          {
            angulo: AnguloFoto.POSTERIOR,
            storageKey: `antropometria/${alumnoPresencialId}/2026/foto-posterior-1.webp`,
          },
        ],
        observacionesCoach: 'Medición tomada en consulta con cáliper Harpenden y cinta ergonómica.',
      };

      // Validar conformidad de contrato Zod (ARCH-003 §5)
      const validacionZod = CheckinAntropometricoSchema.safeParse(checkinPayload);
      expect(validacionZod.success).toBe(true);

      // When el entrenador completa el formulario de medidas físicas y presiona "Guardar Registro"
      const registro = await engine.registrarCheckin({
        actor: actorCoach,
        alumno: alumnoPresencial,
        dto: checkinPayload,
      });

      // Then el sistema debe guardar el registro con los metadatos de auditoría estricta (ADR-001)
      expect(registro.registradoPor).toBe(coachId);
      expect(registro.origen).toBe(OrigenAntropometria.PRESENCIAL_VERIFICADO);
      expect(registro.estado).toBe(EstadoMedicion.APROBADO);
      expect(registro.modalidad).toBe(Modalidad.PRESENCIAL);

      // And la fecha de aprobación UTC debe estar estampada de forma inmediata con formato ISO 8601 UTC ('Z')
      expect(registro.fechaAprobacionUtc).not.toBeNull();
      expect(typeof registro.fechaAprobacionUtc).toBe('string');
      expect(registro.fechaAprobacionUtc?.endsWith('Z')).toBe(true);

      // And los datos biométricos se preservan íntegros
      expect(registro.pesoKg).toBe('78.50');
      expect(registro.porcentajeGrasa).toBe('15.50');
      expect(registro.fotos.length).toBe(3);
    });
  });

  describe('Escenario 2: Alumno Presencial Intentando Modificar / Registrar Medidas (Gherkin Escenario 3 & RN-03)', () => {
    it('debe ser interceptado por la política RBAC híbrida (ADR-001) y rechazar con HTTP 403 Forbidden', async () => {
      // Given que el cliente "Juan Pérez" tiene modalidad "Presencial"
      expect(alumnoPresencial.modalidad).toBe(Modalidad.PRESENCIAL);

      // And el cliente intenta enviar un payload HTTP de mutación sobre sus medidas
      const actorAlumnoPresencial = { id: alumnoPresencialId, rol: Rol.ALUMNO };

      const checkinIntentoFraudulento = {
        alumnoId: alumnoPresencialId,
        fechaEvaluacion: '2026-09-06',
        pesoKg: '72.00', // Modificación no autorizada
        porcentajeGrasa: '11.00',
      };

      // When el backend procesa la petición
      // Then debe interceptar la solicitud mediante la política RBAC y rechazar con 403 Forbidden
      await expect(
        engine.registrarCheckin({
          actor: actorAlumnoPresencial,
          alumno: alumnoPresencial,
          dto: checkinIntentoFraudulento,
        })
      ).rejects.toThrow(ForbiddenException);

      await expect(
        engine.registrarCheckin({
          actor: actorAlumnoPresencial,
          alumno: alumnoPresencial,
          dto: checkinIntentoFraudulento,
        })
      ).rejects.toThrow(/modalidad presencial tienen permisos de solo lectura/i);
    });

    it('debe rechazar con HTTP 403 Forbidden si un alumno intenta registrar medidas para otro alumno', async () => {
      const actorAlumno = { id: alumnoRemotoId, rol: Rol.ALUMNO };

      const payload = {
        alumnoId: alumnoPresencialId, // Intento de mutación sobre otro usuario
        fechaEvaluacion: '2026-09-06',
        pesoKg: '75.00',
      };

      await expect(
        engine.registrarCheckin({
          actor: actorAlumno,
          alumno: alumnoPresencial,
          dto: payload,
        })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Escenario 3: Autoreporte Remoto del Alumno en Ventana de Check-in (Gherkin Escenario 2 & RN-04)', () => {
    it('debe persistir con origen remoto_autoreporte, estado pendiente_aprobacion, registradoPor alumnoId y fechaAprobacionUtc nula', async () => {
      // Given que el cliente "María López" tiene modalidad "Online/Remoto"
      expect(alumnoRemoto.modalidad).toBe(Modalidad.REMOTO);

      const actorAlumnoRemoto = { id: alumnoRemotoId, rol: Rol.ALUMNO };

      // When accede a la app, llena su peso, perímetros y fotos de progreso
      const autoreportePayload = {
        alumnoId: alumnoRemotoId,
        fechaEvaluacion: '2026-09-06',
        pesoKg: '62.40',
        alturaCm: '165.00',
        porcentajeGrasa: '23.50',
        perimetros: {
          cinturaCm: '68.00',
          caderaCm: '94.00',
          musloCm: '52.00',
        },
        fotos: [
          {
            angulo: AnguloFoto.FRONTAL,
            storageKey: `antropometria/${alumnoRemotoId}/2026/foto-maria-f.webp`,
          },
          {
            angulo: AnguloFoto.LATERAL,
            storageKey: `antropometria/${alumnoRemotoId}/2026/foto-maria-l.webp`,
          },
        ],
      };

      const validacionZod = CheckinAntropometricoSchema.safeParse(autoreportePayload);
      expect(validacionZod.success).toBe(true);

      const registro = await engine.registrarCheckin({
        actor: actorAlumnoRemoto,
        alumno: alumnoRemoto,
        dto: autoreportePayload,
        customId: 'ctrl-remoto-maria-001',
      });

      // Then el sistema debe persistir el registro con estado pendiente_aprobacion
      expect(registro.id).toBe('ctrl-remoto-maria-001');
      expect(registro.registradoPor).toBe(alumnoRemotoId);
      expect(registro.origen).toBe(OrigenAntropometria.REMOTO_AUTOREPORTE);
      expect(registro.estado).toBe(EstadoMedicion.PENDIENTE_APROBACION);
      expect(registro.modalidad).toBe(Modalidad.REMOTO);

      // And la fecha de aprobación UTC debe ser null hasta que el coach emita conciliación
      expect(registro.fechaAprobacionUtc).toBeNull();
    });
  });

  describe('Escenario 4: Conciliación por el Coach (Aprobación y Rechazo con Motivo Obligatorio)', () => {
    let controlPendienteId: string;

    beforeEach(async () => {
      const autoreporte = await engine.registrarCheckin({
        actor: { id: alumnoRemotoId, rol: Rol.ALUMNO },
        alumno: alumnoRemoto,
        dto: {
          alumnoId: alumnoRemotoId,
          fechaEvaluacion: '2026-09-06',
          pesoKg: '63.00',
          porcentajeGrasa: '24.00',
        },
        customId: 'ctrl-a-conciliar-001',
      });
      controlPendienteId = autoreporte.id;
      expect(autoreporte.estado).toBe(EstadoMedicion.PENDIENTE_APROBACION);
    });

    it('Sub-escenario 4A: El coach aprueba y consolida la evaluación remota', () => {
      // When el coach revisa fotos y presiona "Aprobar y Consolidar"
      const conciliacionDto = {
        accion: 'aprobar' as const,
        observacionesCoach: 'Excelente adherencia y reducción de retención de líquidos.',
      };

      const parseResult = ConciliarAntropometriaSchema.safeParse(conciliacionDto);
      expect(parseResult.success).toBe(true);

      const resultado = engine.conciliarCheckin({
        coachId,
        controlId: controlPendienteId,
        dto: conciliacionDto,
      });

      // Then el registro transiciona a estado "Aprobado"
      expect(resultado.estado).toBe(EstadoMedicion.APROBADO);
      expect(resultado.fechaAprobacionUtc).not.toBeNull();
      expect(resultado.fechaAprobacionUtc?.endsWith('Z')).toBe(true);
      expect(resultado.observacionesCoach).toBe('Excelente adherencia y reducción de retención de líquidos.');
      expect(resultado.motivoRechazo).toBeNull();
    });

    it('Sub-escenario 4B: El coach rechaza la evaluación remota proveyendo el motivo de rechazo obligatorio', () => {
      // When el coach detecta anomalías y rechaza especificando motivo descriptivo
      const conciliacionDto = {
        accion: 'rechazar' as const,
        motivoRechazo: 'Fotos tomadas a contra-luz e inconsistencia de 5kg respecto a la balanza del gimnasio.',
        observacionesCoach: 'Por favor repetir check-in en ayunas y con buena iluminación.',
      };

      const parseResult = ConciliarAntropometriaSchema.safeParse(conciliacionDto);
      expect(parseResult.success).toBe(true);

      const resultado = engine.conciliarCheckin({
        coachId,
        controlId: controlPendienteId,
        dto: conciliacionDto,
      });

      // Then el registro transiciona a estado "Rechazado" y almacena el motivo
      expect(resultado.estado).toBe(EstadoMedicion.RECHAZADO);
      expect(resultado.motivoRechazo).toBe(
        'Fotos tomadas a contra-luz e inconsistencia de 5kg respecto a la balanza del gimnasio.'
      );
      expect(resultado.fechaAprobacionUtc).toBeNull();
    });

    it('Sub-escenario 4C: Intento de rechazo sin motivoRechazo es bloqueado por validación de contrato Zod (HTTP 400)', () => {
      // When se intenta enviar accion: "rechazar" sin motivoRechazo
      const conciliacionInvalida = {
        accion: 'rechazar' as const,
        motivoRechazo: '', // Cadena vacía o no provista
      };

      const parseResult = ConciliarAntropometriaSchema.safeParse(conciliacionInvalida);

      // Then falla la validación de contrato Zod con código de error personalizado
      expect(parseResult.success).toBe(false);
      if (!parseResult.success) {
        const errorPath = parseResult.error.errors[0].path;
        const errorMessage = parseResult.error.errors[0].message;

        expect(errorPath).toContain('motivoRechazo');
        expect(errorMessage).toMatch(/motivo de rechazo es obligatorio/i);
      }
    });
  });

  describe('Escenario 5: Validación de Límites Biológicos en Zod / Service (RF-003 §6 Casos Borde)', () => {
    it('debe rechazar pesos fuera del rango biológico (menor a 30.00 kg o mayor a 300.00 kg)', () => {
      // Peso menor a 30 kg
      const pesoBajo = CheckinAntropometricoSchema.safeParse({
        alumnoId: alumnoRemotoId,
        fechaEvaluacion: '2026-09-06',
        pesoKg: '25.00',
      });
      expect(pesoBajo.success).toBe(false);
      if (!pesoBajo.success) {
        expect(pesoBajo.error.errors[0].message).toMatch(/peso debe estar entre 30.00 kg y 300.00 kg/i);
      }

      // Peso mayor a 300 kg
      const pesoAlto = CheckinAntropometricoSchema.safeParse({
        alumnoId: alumnoRemotoId,
        fechaEvaluacion: '2026-09-06',
        pesoKg: '305.50',
      });
      expect(pesoAlto.success).toBe(false);
      if (!pesoAlto.success) {
        expect(pesoAlto.error.errors[0].message).toMatch(/peso debe estar entre 30.00 kg y 300.00 kg/i);
      }
    });

    it('debe rechazar porcentaje de grasa corporal fuera del rango biológico (menor a 2.00% o mayor a 70.00%)', () => {
      // Grasa menor a 2%
      const grasaBaja = CheckinAntropometricoSchema.safeParse({
        alumnoId: alumnoRemotoId,
        fechaEvaluacion: '2026-09-06',
        pesoKg: '70.00',
        porcentajeGrasa: '1.50',
      });
      expect(grasaBaja.success).toBe(false);
      if (!grasaBaja.success) {
        expect(grasaBaja.error.errors[0].message).toMatch(/porcentaje de grasa debe estar entre 2.00% y 70.00%/i);
      }

      // Grasa mayor a 70%
      const grasaAlta = CheckinAntropometricoSchema.safeParse({
        alumnoId: alumnoRemotoId,
        fechaEvaluacion: '2026-09-06',
        pesoKg: '70.00',
        porcentajeGrasa: '72.00',
      });
      expect(grasaAlta.success).toBe(false);
      if (!grasaAlta.success) {
        expect(grasaAlta.error.errors[0].message).toMatch(/porcentaje de grasa debe estar entre 2.00% y 70.00%/i);
      }
    });

    it('debe admitir valores exactos en los límites biológicos permisibles (30.00 kg, 300.00 kg, 2.00%, 70.00%)', () => {
      const limiteInferior = CheckinAntropometricoSchema.safeParse({
        alumnoId: alumnoRemotoId,
        fechaEvaluacion: '2026-09-06',
        pesoKg: '30.00',
        porcentajeGrasa: '2.00',
        alturaCm: '100.00',
      });
      expect(limiteInferior.success).toBe(true);

      const limiteSuperior = CheckinAntropometricoSchema.safeParse({
        alumnoId: alumnoRemotoId,
        fechaEvaluacion: '2026-09-06',
        pesoKg: '300.00',
        porcentajeGrasa: '70.00',
        alturaCm: '250.00',
      });
      expect(limiteSuperior.success).toBe(true);
    });

    it('debe limitar a un máximo estricto de 3 fotografías corporales de progreso por evaluación (RN-02)', () => {
      const cuatroFotos = CheckinAntropometricoSchema.safeParse({
        alumnoId: alumnoRemotoId,
        fechaEvaluacion: '2026-09-06',
        pesoKg: '70.00',
        fotos: [
          { angulo: AnguloFoto.FRONTAL, storageKey: 'antropometria/1.webp' },
          { angulo: AnguloFoto.LATERAL, storageKey: 'antropometria/2.webp' },
          { angulo: AnguloFoto.POSTERIOR, storageKey: 'antropometria/3.webp' },
          { angulo: AnguloFoto.FRONTAL, storageKey: 'antropometria/4.webp' },
        ],
      });
      expect(cuatroFotos.success).toBe(false);
      if (!cuatroFotos.success) {
        expect(cuatroFotos.error.errors[0].message).toMatch(/No se permiten más de 3 fotografías/i);
      }
    });
  });
});
