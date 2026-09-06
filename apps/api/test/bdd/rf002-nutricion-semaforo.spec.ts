import { describe, it, expect, beforeEach } from 'vitest';
import {
  SemaforoNutricional,
  TipoComida,
  CheckinNutricionalSchema,
  FotoComidaInputSchema,
} from '@guachafit/shared';
import {
  NutricionTestEngine,
  MetasNutricionalesCoach,
} from './helpers/workout-nutrition-test-engine';

describe('RF-002: Módulo de Nutrición Ágil y Reporte Rápido', () => {
  let engine: NutricionTestEngine;
  const alumnoId = 'a1111111-1111-4111-8111-111111111111';
  const alumnoId2 = 'a2222222-2222-4222-8222-222222222222';
  const fechaHoy = '2026-09-06';

  beforeEach(() => {
    engine = new NutricionTestEngine();
  });

  describe('Escenario 1: Reporte Ágil Nocturno 1-Tap con Semáforo Nutricional (RN-02, Gherkin Escenario 1)', () => {
    it('debe registrar el estado nutricional como "cumplido" mediante 1-Tap', () => {
      // Given que el alumno finaliza su jornada y abre la sección de Nutrición
      const checkinPayload = {
        fecha: fechaHoy,
        semaforo: SemaforoNutricional.CUMPLIDO,
      };

      // Validar contrato con CheckinNutricionalSchema
      const validacion = CheckinNutricionalSchema.safeParse(checkinPayload);
      expect(validacion.success).toBe(true);

      // When selecciona la opción "Cumplido"
      const { checkin } = engine.registrarCheckin(alumnoId, checkinPayload);

      // Then el sistema registra el estado como 'cumplido'
      expect(checkin.semaforo).toBe(SemaforoNutricional.CUMPLIDO);
      expect(checkin.fecha).toBe(fechaHoy);
      expect(checkin.alumnoId).toBe(alumnoId);
    });

    it('debe soportar los tres estados del semáforo: cumplido, parcial y no_cumplido', () => {
      // Estado 'parcial'
      const checkinParcial = engine.registrarCheckin(alumnoId, {
        fecha: '2026-09-01',
        semaforo: SemaforoNutricional.PARCIAL,
        notasAlumno: 'Buena proteína pero cené pizza fuera del plan',
      });
      expect(checkinParcial.checkin.semaforo).toBe(SemaforoNutricional.PARCIAL);
      expect(checkinParcial.checkin.notasAlumno).toBe('Buena proteína pero cené pizza fuera del plan');

      // Estado 'no_cumplido'
      const checkinNoCumplido = engine.registrarCheckin(alumnoId, {
        fecha: '2026-09-02',
        semaforo: SemaforoNutricional.NO_CUMPLIDO,
        notasAlumno: 'Día libre / cumpleaños',
      });
      expect(checkinNoCumplido.checkin.semaforo).toBe(SemaforoNutricional.NO_CUMPLIDO);
    });

    it('debe permitir registrar notas opcionales de hasta 280 caracteres', () => {
      const notaExacta280 = 'A'.repeat(280);
      const payloadValido = {
        fecha: fechaHoy,
        semaforo: SemaforoNutricional.CUMPLIDO,
        notasAlumno: notaExacta280,
      };

      const validacion = CheckinNutricionalSchema.safeParse(payloadValido);
      expect(validacion.success).toBe(true);

      const { checkin } = engine.registrarCheckin(alumnoId, payloadValido);
      expect(checkin.notasAlumno?.length).toBe(280);
    });

    it('debe rechazar notas del alumno que superen el límite de 280 caracteres', () => {
      const notaExcedida = 'A'.repeat(281);
      const payloadInvalido = {
        fecha: fechaHoy,
        semaforo: SemaforoNutricional.CUMPLIDO,
        notasAlumno: notaExcedida,
      };

      const validacion = CheckinNutricionalSchema.safeParse(payloadInvalido);
      expect(validacion.success).toBe(false);
    });

    it('debe rechazar semáforos inválidos fuera del enum', () => {
      const payloadInvalido = {
        fecha: fechaHoy,
        semaforo: 'excelente' as any,
      };

      const validacion = CheckinNutricionalSchema.safeParse(payloadInvalido);
      expect(validacion.success).toBe(false);
    });
  });

  describe('Escenario 2: Diario Fotográfico de Comidas (RN-03, Gherkin Escenario 2)', () => {
    it('debe registrar hasta 4 fotografías correspondientes a las comidas principales', () => {
      // Given que el alumno captura fotografías de sus platos diarios
      const payloadFotos = {
        fecha: fechaHoy,
        semaforo: SemaforoNutricional.CUMPLIDO,
        fotosPlatos: [
          {
            tipoComida: TipoComida.DESAYUNO,
            storageKey: 'alumnos/1/nutricion/2026-09-06_desayuno.webp',
          },
          {
            tipoComida: TipoComida.ALMUERZO,
            storageKey: 'alumnos/1/nutricion/2026-09-06_almuerzo.webp',
          },
          {
            tipoComida: TipoComida.CENA,
            storageKey: 'alumnos/1/nutricion/2026-09-06_cena.webp',
          },
          {
            tipoComida: TipoComida.SNACK,
            storageKey: 'alumnos/1/nutricion/2026-09-06_snack.webp',
          },
        ],
      };

      // Validar contrato con CheckinNutricionalSchema
      const validacion = CheckinNutricionalSchema.safeParse(payloadFotos);
      expect(validacion.success).toBe(true);

      // When se registra el check-in con fotos
      const { checkin } = engine.registrarCheckin(alumnoId, payloadFotos);

      // Then se persisten exactamente las 4 fotos asociadas
      expect(checkin.fotosPlatos.length).toBe(4);
      expect(checkin.fotosPlatos[0].tipoComida).toBe(TipoComida.DESAYUNO);
      expect(checkin.fotosPlatos[1].tipoComida).toBe(TipoComida.ALMUERZO);
      expect(checkin.fotosPlatos[2].tipoComida).toBe(TipoComida.CENA);
      expect(checkin.fotosPlatos[3].tipoComida).toBe(TipoComida.SNACK);
      expect(checkin.fotosPlatos[0].storageKey).toContain('_desayuno.webp');
    });

    it('debe validar cada foto individual con FotoComidaInputSchema', () => {
      const fotoValida = {
        tipoComida: TipoComida.ALMUERZO,
        storageKey: 'r2/comidas/almuerzo_123.jpg',
      };
      expect(FotoComidaInputSchema.safeParse(fotoValida).success).toBe(true);

      const fotoInvalidaKeyCorta = {
        tipoComida: TipoComida.ALMUERZO,
        storageKey: 'abc', // Mínimo 5 caracteres
      };
      expect(FotoComidaInputSchema.safeParse(fotoInvalidaKeyCorta).success).toBe(false);

      const fotoInvalidaTipo = {
        tipoComida: 'brunch' as any,
        storageKey: 'r2/comidas/almuerzo_123.jpg',
      };
      expect(FotoComidaInputSchema.safeParse(fotoInvalidaTipo).success).toBe(false);
    });

    it('debe rechazar intentos de enviar más de 4 fotografías de platos por día (RN-03)', () => {
      const payloadExcesoFotos = {
        fecha: fechaHoy,
        semaforo: SemaforoNutricional.CUMPLIDO,
        fotosPlatos: [
          { tipoComida: TipoComida.DESAYUNO, storageKey: 'r2/foto1.webp' },
          { tipoComida: TipoComida.ALMUERZO, storageKey: 'r2/foto2.webp' },
          { tipoComida: TipoComida.CENA, storageKey: 'r2/foto3.webp' },
          { tipoComida: TipoComida.SNACK, storageKey: 'r2/foto4.webp' },
          { tipoComida: TipoComida.SNACK, storageKey: 'r2/foto5_exceso.webp' }, // Quinta foto
        ],
      };

      const validacion = CheckinNutricionalSchema.safeParse(payloadExcesoFotos);
      expect(validacion.success).toBe(false);
      if (!validacion.success) {
        expect(validacion.error.issues[0].message).toContain(
          'No se permiten más de 4 fotografías de platos por día'
        );
      }
    });
  });

  describe('Escenario 3: Ingreso Opcional de Totales de Calorías, Proteínas y Agua (RN-01, RN-04, Gherkin Escenario 3)', () => {
    const metasCoach: MetasNutricionalesCoach = {
      caloriasObjetivo: 2000,
      proteinaGramosObjetivo: 150,
      aguaLitrosObjetivo: '2.50',
    };

    it('Caso 3A: Totales dentro del margen de tolerancia (±10%) respecto a metas del entrenador', () => {
      // Given que el alumno reporta 2100 kcal (+5.0%) y 155g proteína (+3.3%)
      const payload = {
        fecha: fechaHoy,
        semaforo: SemaforoNutricional.CUMPLIDO,
        caloriasReportadas: 2100,
        proteinaGramosReportada: 155,
        aguaLitros: '2.50',
      };

      const validacion = CheckinNutricionalSchema.safeParse(payload);
      expect(validacion.success).toBe(true);

      // When se registra y evalúa contra metas
      const resultado = engine.registrarCheckin(alumnoId, payload, metasCoach);

      // Then el sistema persiste los totales numéricos
      expect(resultado.checkin.caloriasReportadas).toBe(2100);
      expect(resultado.checkin.proteinaGramosReportada).toBe(155);
      expect(resultado.checkin.aguaLitros).toBe('2.50');

      // And certifica que está dentro del margen de tolerancia (±10%)
      expect(resultado.dentroMargenTolerancia).toBe(true);
      expect(resultado.desviacionCaloriasPct).toBe(5);
      expect(resultado.desviacionProteinasPct).toBe(3.33);
    });

    it('Caso 3B: Calorías fuera del margen de tolerancia (+20%)', () => {
      // Given reporte con 2400 kcal (+20.0% sobre meta de 2000)
      const payload = {
        fecha: fechaHoy,
        semaforo: SemaforoNutricional.PARCIAL,
        caloriasReportadas: 2400,
        proteinaGramosReportada: 150,
      };

      const resultado = engine.registrarCheckin(alumnoId, payload, metasCoach);

      // Then queda marcado como fuera de tolerancia
      expect(resultado.dentroMargenTolerancia).toBe(false);
      expect(resultado.desviacionCaloriasPct).toBe(20);
      expect(resultado.desviacionProteinasPct).toBe(0);
    });

    it('Caso 3C: Proteína insuficiente fuera del margen de tolerancia (-26.7%)', () => {
      // Given reporte con 110g de proteína (-26.67% sobre meta de 150g)
      const payload = {
        fecha: fechaHoy,
        semaforo: SemaforoNutricional.PARCIAL,
        caloriasReportadas: 2000,
        proteinaGramosReportada: 110,
      };

      const resultado = engine.registrarCheckin(alumnoId, payload, metasCoach);

      expect(resultado.dentroMargenTolerancia).toBe(false);
      expect(resultado.desviacionProteinasPct).toBe(-26.67);
    });

    it('debe validar formato decimal en aguaLitros con hasta 2 decimales', () => {
      // Valores válidos
      expect(
        CheckinNutricionalSchema.safeParse({
          fecha: fechaHoy,
          semaforo: SemaforoNutricional.CUMPLIDO,
          aguaLitros: '2.50',
        }).success
      ).toBe(true);

      expect(
        CheckinNutricionalSchema.safeParse({
          fecha: fechaHoy,
          semaforo: SemaforoNutricional.CUMPLIDO,
          aguaLitros: '3',
        }).success
      ).toBe(true);

      // Valores inválidos: más de 2 decimales o letras
      expect(
        CheckinNutricionalSchema.safeParse({
          fecha: fechaHoy,
          semaforo: SemaforoNutricional.CUMPLIDO,
          aguaLitros: '2.555',
        }).success
      ).toBe(false);

      expect(
        CheckinNutricionalSchema.safeParse({
          fecha: fechaHoy,
          semaforo: SemaforoNutricional.CUMPLIDO,
          aguaLitros: 'mucho',
        }).success
      ).toBe(false);
    });

    it('debe rechazar calorías negativas o excesivas (>15000)', () => {
      expect(
        CheckinNutricionalSchema.safeParse({
          fecha: fechaHoy,
          semaforo: SemaforoNutricional.CUMPLIDO,
          caloriasReportadas: -50,
        }).success
      ).toBe(false);

      expect(
        CheckinNutricionalSchema.safeParse({
          fecha: fechaHoy,
          semaforo: SemaforoNutricional.CUMPLIDO,
          caloriasReportadas: 20000,
        }).success
      ).toBe(false);
    });
  });

  describe('Escenario 4: Unicidad Diaria (uq_checkin_nutricional_diario)', () => {
    it('debe permitir registrar exactamente un check-in por alumno y fecha', () => {
      const payload = {
        fecha: fechaHoy,
        semaforo: SemaforoNutricional.CUMPLIDO,
      };

      const resultado = engine.registrarCheckin(alumnoId, payload);
      expect(resultado.checkin.fecha).toBe(fechaHoy);
      expect(resultado.checkin.alumnoId).toBe(alumnoId);
    });

    it('debe rechazar un segundo check-in para el mismo alumno en la misma fecha calendario', () => {
      // Primer check-in del día
      engine.registrarCheckin(alumnoId, {
        fecha: fechaHoy,
        semaforo: SemaforoNutricional.CUMPLIDO,
      });

      // Segundo intento de check-in el mismo día
      expect(() =>
        engine.registrarCheckin(alumnoId, {
          fecha: fechaHoy,
          semaforo: SemaforoNutricional.PARCIAL,
        })
      ).toThrow(/Violación de unicidad: Ya existe un check-in nutricional registrado/);
    });

    it('debe permitir que un alumno registre check-ins en fechas distintas', () => {
      // Check-in de hoy
      engine.registrarCheckin(alumnoId, {
        fecha: '2026-09-06',
        semaforo: SemaforoNutricional.CUMPLIDO,
      });

      // Check-in de mañana
      const manana = engine.registrarCheckin(alumnoId, {
        fecha: '2026-09-07',
        semaforo: SemaforoNutricional.PARCIAL,
      });

      expect(manana.checkin.fecha).toBe('2026-09-07');
    });

    it('debe permitir que diferentes alumnos registren check-ins en la misma fecha (Aislamiento Multi-Tenant)', () => {
      // Alumno 1
      const checkin1 = engine.registrarCheckin(alumnoId, {
        fecha: fechaHoy,
        semaforo: SemaforoNutricional.CUMPLIDO,
      });

      // Alumno 2 en la misma fecha
      const checkin2 = engine.registrarCheckin(alumnoId2, {
        fecha: fechaHoy,
        semaforo: SemaforoNutricional.NO_CUMPLIDO,
      });

      expect(checkin1.checkin.alumnoId).toBe(alumnoId);
      expect(checkin2.checkin.alumnoId).toBe(alumnoId2);
      expect(checkin1.checkin.fecha).toBe(fechaHoy);
      expect(checkin2.checkin.fecha).toBe(fechaHoy);
    });

    it('debe exigir formato de fecha estrictamente YYYY-MM-DD', () => {
      expect(
        CheckinNutricionalSchema.safeParse({
          fecha: '06-09-2026', // Formato DD-MM-YYYY no permitido
          semaforo: SemaforoNutricional.CUMPLIDO,
        }).success
      ).toBe(false);

      expect(
        CheckinNutricionalSchema.safeParse({
          fecha: '2026/09/06', // Formato con barras no permitido
          semaforo: SemaforoNutricional.CUMPLIDO,
        }).success
      ).toBe(false);

      expect(
        CheckinNutricionalSchema.safeParse({
          fecha: '2026-09-06T18:00:00Z', // ISO datetime no permitido en fecha calendario
          semaforo: SemaforoNutricional.CUMPLIDO,
        }).success
      ).toBe(false);
    });
  });
});
