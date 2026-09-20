import { describe, it, expect, beforeEach } from 'vitest';
import {
  EstadoSesion,
  SemaforoAdherencia,
  IniciarSesionSchema,
  SincronizarSeriesBatchSchema,
  FinalizarSesionSchema,
} from '@guachafit/shared';
import {
  WorkoutTestEngine,
  SesionEntrenamientoState,
  actualizarRacha,
  calcularRachaEfectiva,
} from './helpers/workout-nutrition-test-engine';

describe('RF-001: Checklist Interactivo de Entrenamiento Diario y Monitor Semanal', () => {
  let engine: WorkoutTestEngine;
  let sesionInicial: SesionEntrenamientoState;

  const alumnoId = 'a1111111-1111-4111-8111-111111111111';
  const sesionId = 'b2222222-2222-4222-8222-222222222222';
  const ejercicioId1 = 'c3333333-3333-4333-8333-333333333333';
  const ejercicioId2 = 'c4444444-4444-4444-8444-444444444444';

  const serie1Id = 'd5555555-5555-4555-8555-555555555551';
  const serie2Id = 'd5555555-5555-4555-8555-555555555552';
  const serie3Id = 'd5555555-5555-4555-8555-555555555553';
  const serie4Id = 'd5555555-5555-4555-8555-555555555554';
  const serie5Id = 'd5555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    engine = new WorkoutTestEngine();
    sesionInicial = {
      id: sesionId,
      alumnoId,
      rutinaId: 'e6666666-6666-4666-8666-666666666666',
      fechaProgramada: '2026-09-06',
      fechaInicioUtc: null,
      fechaFinUtc: null,
      timezoneCliente: 'America/Caracas',
      estado: EstadoSesion.PLANIFICADA,
      porcentajeCumplimiento: '0.00',
      notasAlumno: null,
      ejercicios: [
        {
          id: 'ej-sesion-1',
          sesionId,
          ejercicioId: ejercicioId1,
          orden: 1,
          notasCoach: 'Sentadilla Trasera con pausa en el fondo',
          series: [
            {
              id: serie1Id,
              ejercicioSesionId: 'ej-sesion-1',
              numeroSerie: 1,
              repsObjetivo: 10,
              repsLogradas: null,
              pesoKg: null,
              rpe: null,
              completada: false,
              timestampCompletadaUtc: null,
            },
            {
              id: serie2Id,
              ejercicioSesionId: 'ej-sesion-1',
              numeroSerie: 2,
              repsObjetivo: 10,
              repsLogradas: null,
              pesoKg: null,
              rpe: null,
              completada: false,
              timestampCompletadaUtc: null,
            },
            {
              id: serie3Id,
              ejercicioSesionId: 'ej-sesion-1',
              numeroSerie: 3,
              repsObjetivo: 8,
              repsLogradas: null,
              pesoKg: null,
              rpe: null,
              completada: false,
              timestampCompletadaUtc: null,
            },
          ],
        },
        {
          id: 'ej-sesion-2',
          sesionId,
          ejercicioId: ejercicioId2,
          orden: 2,
          notasCoach: 'Press de Banca Plano RPE 8',
          series: [
            {
              id: serie4Id,
              ejercicioSesionId: 'ej-sesion-2',
              numeroSerie: 1,
              repsObjetivo: 8,
              repsLogradas: null,
              pesoKg: null,
              rpe: null,
              completada: false,
              timestampCompletadaUtc: null,
            },
            {
              id: serie5Id,
              ejercicioSesionId: 'ej-sesion-2',
              numeroSerie: 2,
              repsObjetivo: 8,
              repsLogradas: null,
              pesoKg: null,
              rpe: null,
              completada: false,
              timestampCompletadaUtc: null,
            },
          ],
        },
      ],
    };
  });

  describe('Escenario 1: Consulta Pasiva de Rutina Programada (Sin Iniciar Entrenamiento, RN-04)', () => {
    it('debe mantenerse en estado "planificada" sin registrar timestamp de inicio al consultar la rutina', () => {
      // Given que el alumno ha iniciado sesión en la app y accede a la pantalla de la rutina
      expect(sesionInicial.estado).toBe(EstadoSesion.PLANIFICADA);
      expect(sesionInicial.fechaInicioUtc).toBeNull();

      // When navega entre los ejercicios para consultar series, notas y videos demostrativos
      // y NO presiona el botón "Comenzar a entrenar"
      const sesionConsultada = engine.consultarSesion(sesionInicial);

      // Then la sesión debe mantenerse en estado "planificada"
      expect(sesionConsultada.estado).toBe(EstadoSesion.PLANIFICADA);

      // And no se debe registrar ningún timestamp de inicio en el backend
      expect(sesionConsultada.fechaInicioUtc).toBeNull();

      // And el entrenador no debe ver al alumno como "En Progreso"
      expect(sesionConsultada.estado).not.toBe(EstadoSesion.EN_PROGRESO);
    });
  });

  describe('Escenario 2: Acción Explícita "Comenzar Entrenamiento" (RN-04, RN-05, ADR-002)', () => {
    it('debe transicionar a "en_progreso", capturar fechaInicioUtc en UTC estricto ("Z") y almacenar timezoneCliente', () => {
      // Given que el alumno se encuentra listo físicamente y su sesión de hoy está "planificada"
      expect(sesionInicial.estado).toBe(EstadoSesion.PLANIFICADA);

      // When presiona conscientemente el botón "Comenzar a entrenar"
      const payload = {
        timezoneCliente: 'America/Caracas',
        fechaInicioUtc: '2026-09-06T10:15:00Z',
      };

      // Validar contrato con IniciarSesionSchema
      const validacion = IniciarSesionSchema.safeParse(payload);
      expect(validacion.success).toBe(true);

      const sesionIniciada = engine.iniciarSesion(sesionInicial, payload);

      // Then el sistema transiciona el estado de la sesión a "en_progreso"
      expect(sesionIniciada.estado).toBe(EstadoSesion.EN_PROGRESO);

      // And captura el timestamp exacto del momento en UTC (ISO 8601 con sufijo 'Z')
      expect(sesionIniciada.fechaInicioUtc).toBe('2026-09-06T10:15:00Z');
      expect(sesionIniciada.fechaInicioUtc?.endsWith('Z')).toBe(true);

      // And almacena la zona horaria del dispositivo cliente (ej. 'America/Caracas')
      expect(sesionIniciada.timezoneCliente).toBe('America/Caracas');
    });

    it('debe generar timestamp UTC válido automáticamente si el cliente no lo envía', () => {
      const payload = {
        timezoneCliente: 'America/Bogota',
      };

      const validacion = IniciarSesionSchema.safeParse(payload);
      expect(validacion.success).toBe(true);

      const sesionIniciada = engine.iniciarSesion(sesionInicial, payload);
      expect(sesionIniciada.estado).toBe(EstadoSesion.EN_PROGRESO);
      expect(sesionIniciada.fechaInicioUtc).not.toBeNull();
      expect(sesionIniciada.fechaInicioUtc?.endsWith('Z')).toBe(true);
      expect(sesionIniciada.timezoneCliente).toBe('America/Bogota');
    });

    it('debe rechazar transiciones inválidas si la sesión ya fue iniciada o completada', () => {
      // Iniciar primera vez
      engine.iniciarSesion(sesionInicial, { timezoneCliente: 'America/Caracas' });
      expect(sesionInicial.estado).toBe(EstadoSesion.EN_PROGRESO);

      // Intentar iniciar nuevamente
      expect(() =>
        engine.iniciarSesion(sesionInicial, { timezoneCliente: 'America/Caracas' })
      ).toThrow(/Transición inválida/);
    });

    it('debe rechazar timestamps no conformes a ISO 8601 UTC en el schema', () => {
      const payloadInvalido = {
        timezoneCliente: 'America/Caracas',
        fechaInicioUtc: '2026-09-06 10:15:00', // Sin 'T' ni 'Z'
      };

      const validacion = IniciarSesionSchema.safeParse(payloadInvalido);
      expect(validacion.success).toBe(false);
    });
  });

  describe('Escenario 3: Registro de Series y Sincronización por Lotes (RN-01, Batch Sync, Offline-first)', () => {
    beforeEach(() => {
      // Iniciar la sesión para habilitar el checklist interactivo
      engine.iniciarSesion(sesionInicial, {
        timezoneCliente: 'America/Caracas',
        fechaInicioUtc: '2026-09-06T10:00:00Z',
      });
    });

    it('debe registrar repsLogradas, pesoKg (decimal 2 dígitos), rpe opcional, completada y timestampCompletadaUtc', () => {
      // Given que la sesión está "en_progreso"
      expect(sesionInicial.estado).toBe(EstadoSesion.EN_PROGRESO);

      // When el alumno sincroniza un lote de series completadas (ej. offline cache sync)
      const batchPayload = {
        series: [
          {
            serieId: serie1Id,
            repsLogradas: 10,
            pesoKg: '80.00',
            rpe: '8.0',
            completada: true,
            timestampCompletadaUtc: '2026-09-06T10:05:30Z',
          },
          {
            serieId: serie2Id,
            repsLogradas: 10,
            pesoKg: '82.50',
            rpe: '8.5',
            completada: true,
            timestampCompletadaUtc: '2026-09-06T10:09:15Z',
          },
          {
            serieId: serie3Id,
            repsLogradas: 8,
            pesoKg: '85.00',
            completada: true,
            timestampCompletadaUtc: '2026-09-06T10:14:00Z',
          },
        ],
      };

      // Validar contrato con SincronizarSeriesBatchSchema
      const parsed = SincronizarSeriesBatchSchema.safeParse(batchPayload);
      expect(parsed.success).toBe(true);

      const sesionActualizada = engine.sincronizarSeries(sesionInicial, batchPayload);

      // Then las series correspondientes se actualizan en el agregado
      const s1 = sesionActualizada.ejercicios[0].series[0];
      expect(s1.repsLogradas).toBe(10);
      expect(s1.pesoKg).toBe('80.00');
      expect(s1.rpe).toBe('8.0');
      expect(s1.completada).toBe(true);
      expect(s1.timestampCompletadaUtc).toBe('2026-09-06T10:05:30Z');

      const s2 = sesionActualizada.ejercicios[0].series[1];
      expect(s2.pesoKg).toBe('82.50');
      expect(s2.rpe).toBe('8.5');

      const s3 = sesionActualizada.ejercicios[0].series[2];
      expect(s3.pesoKg).toBe('85.00');
      expect(s3.rpe).toBeNull(); // RPE es opcional
    });

    it('debe rechazar pesos con formato decimal inválido o más de 2 decimales', () => {
      const payloadInvalido = {
        series: [
          {
            serieId: serie1Id,
            repsLogradas: 10,
            pesoKg: '80.555', // Inválido: 3 decimales
            completada: true,
          },
        ],
      };

      const parsed = SincronizarSeriesBatchSchema.safeParse(payloadInvalido);
      expect(parsed.success).toBe(false);
    });

    it('debe rechazar repeticiones negativas en la serie', () => {
      const payloadInvalido = {
        series: [
          {
            serieId: serie1Id,
            repsLogradas: -1, // Inválido: negativo
            pesoKg: '50.00',
            completada: true,
          },
        ],
      };

      const parsed = SincronizarSeriesBatchSchema.safeParse(payloadInvalido);
      expect(parsed.success).toBe(false);
    });

    it('debe denegar la sincronización si la sesión no está en progreso', () => {
      // Simular sesión en estado 'planificada'
      sesionInicial.estado = EstadoSesion.PLANIFICADA;

      const payload = {
        series: [
          {
            serieId: serie1Id,
            repsLogradas: 10,
            pesoKg: '80.00',
            completada: true,
          },
        ],
      };

      expect(() => engine.sincronizarSeries(sesionInicial, payload)).toThrow(
        /Solo se pueden registrar series en sesiones con estado 'en_progreso'/
      );
    });
  });

  describe('Escenario 4: Finalización de Sesión y Regla de Racha (RN-02, Gherkin Escenarios 3 y 5)', () => {
    beforeEach(() => {
      engine.iniciarSesion(sesionInicial, {
        timezoneCliente: 'America/Caracas',
        fechaInicioUtc: '2026-09-06T10:00:00Z',
      });
    });

    function clonarSesionInicial(): SesionEntrenamientoState {
      return JSON.parse(JSON.stringify(sesionInicial)) as SesionEntrenamientoState;
    }

    it('Caso 4A: Cumplimiento >= 70% (4 de 5 series = 80%) -> cumpleReglaRacha = true e incrementa racha en +1', () => {
      // Given que el alumno ha completado 4 de 5 series prescritas (80% del volumen)
      engine.sincronizarSeries(sesionInicial, {
        series: [
          { serieId: serie1Id, repsLogradas: 10, pesoKg: '80.00', completada: true },
          { serieId: serie2Id, repsLogradas: 10, pesoKg: '80.00', completada: true },
          { serieId: serie3Id, repsLogradas: 8, pesoKg: '85.00', completada: true },
          { serieId: serie4Id, repsLogradas: 8, pesoKg: '60.00', completada: true },
          // serie5Id permanece completada: false (1 serie omitida)
        ],
      });

      const rachaPrevia = { rachaDias: 7, rachaUltimaFecha: '2026-09-05' };
      const finalizarDto = {
        notasAlumno: 'Excelente bombeo, sentadillas muy sólidas',
        fechaFinUtc: '2026-09-06T11:05:00Z',
      };

      // Validar contrato con FinalizarSesionSchema
      const validacion = FinalizarSesionSchema.safeParse(finalizarDto);
      expect(validacion.success).toBe(true);

      // When presiona el botón "Finalizar Entrenamiento"
      const resultado = engine.finalizarSesion(sesionInicial, finalizarDto, rachaPrevia);

      // Then la sesión transiciona a estado "completada"
      expect(resultado.sesion.estado).toBe(EstadoSesion.COMPLETADA);

      // And el porcentaje de cumplimiento es 80.00%
      expect(resultado.sesion.porcentajeCumplimiento).toBe('80.00');

      // And cumple la regla de racha (>= 70%)
      expect(resultado.cumpleReglaRacha).toBe(true);
      expect(resultado.cumpleRacha).toBe(true);

      // And la racha de días consecutivos se incrementa en +1 (última fecha = ayer)
      expect(resultado.nuevaRacha).toBe(8);
      expect(resultado.rachaUltimaFecha).toBe('2026-09-06');

      // And registra el timestamp de fin en UTC con sufijo 'Z'
      expect(resultado.sesion.fechaFinUtc).toBe('2026-09-06T11:05:00Z');
      expect(resultado.sesion.fechaFinUtc?.endsWith('Z')).toBe(true);

      // And calcula la duración de la sesión (10:00 a 11:05 = 65 minutos)
      expect(resultado.duracionMinutos).toBe(65);

      // And preserva las notas del alumno
      expect(resultado.sesion.notasAlumno).toBe('Excelente bombeo, sentadillas muy sólidas');
    });

    it('Caso 4B: Cumplimiento < 70% (2 de 5 series = 40%) -> cumpleReglaRacha = false y racha no se incrementa', () => {
      // Given que el alumno solo completó 2 de 5 series (40% de volumen)
      engine.sincronizarSeries(sesionInicial, {
        series: [
          { serieId: serie1Id, repsLogradas: 10, pesoKg: '80.00', completada: true },
          { serieId: serie2Id, repsLogradas: 10, pesoKg: '80.00', completada: true },
        ],
      });

      const rachaPrevia = { rachaDias: 7, rachaUltimaFecha: '2026-09-05' };
      const finalizarDto = {
        notasAlumno: 'Tuve que cortar el entrenamiento por falta de tiempo',
        fechaFinUtc: '2026-09-06T10:30:00Z',
      };

      // When presiona "Finalizar Entrenamiento"
      const resultado = engine.finalizarSesion(sesionInicial, finalizarDto, rachaPrevia);

      // Then la sesión se marca completada pero con porcentaje inferior a la cota de racha
      expect(resultado.sesion.estado).toBe(EstadoSesion.COMPLETADA);
      expect(resultado.sesion.porcentajeCumplimiento).toBe('40.00');
      expect(resultado.cumpleReglaRacha).toBe(false);

      // And la racha de cumplimiento positivo NO se incrementa
      expect(resultado.nuevaRacha).toBe(rachaPrevia.rachaDias);
      expect(resultado.rachaUltimaFecha).toBe(rachaPrevia.rachaUltimaFecha);
      expect(resultado.duracionMinutos).toBe(30);
    });

    it('Caso 4C: Cierre vacío sin tipoCierre -> exige decisión explícita (400)', () => {
      // Given que el alumno comenzó pero no completó ninguna serie
      expect(() => engine.finalizarSesion(sesionInicial, { fechaFinUtc: '2026-09-06T10:05:00Z' })).toThrow(
        /no registra series completadas/
      );
    });

    it('Caso 4D: Cierre vacío con tipoCierre DESCANSADA -> OMITIDA, motivo DESCANSO y racha intacta', () => {
      const rachaPrevia = { rachaDias: 3, rachaUltimaFecha: '2026-09-05' };

      const resultado = engine.finalizarSesion(
        sesionInicial,
        { fechaFinUtc: '2026-09-06T10:05:00Z', tipoCierre: 'DESCANSADA' },
        rachaPrevia
      );

      expect(resultado.sesion.estado).toBe(EstadoSesion.OMITIDA);
      expect(resultado.motivoOmision).toBe('DESCANSO');
      expect(resultado.cumpleReglaRacha).toBe(false);
      expect(resultado.nuevaRacha).toBe(3);
      expect(resultado.sesion.fechaInicioUtc).toBe('2026-09-06T10:00:00Z'); // conserva timestamps
    });

    it('Caso 4E: Cierre vacío con tipoCierre INCOMPLETA -> OMITIDA, motivo INCOMPLETO y racha intacta', () => {
      const resultado = engine.finalizarSesion(
        sesionInicial,
        { fechaFinUtc: '2026-09-06T10:05:00Z', tipoCierre: 'INCOMPLETA' },
        { rachaDias: 2, rachaUltimaFecha: '2026-09-05' }
      );

      expect(resultado.sesion.estado).toBe(EstadoSesion.OMITIDA);
      expect(resultado.motivoOmision).toBe('INCOMPLETO');
      expect(resultado.nuevaRacha).toBe(2);
    });

    it('Caso 4F: COMPLETADA con 0 series sigue prohibido aunque venga tipoCierre', () => {
      expect(() =>
        engine.finalizarSesion(sesionInicial, { tipoCierre: 'COMPLETADA' })
      ).toThrow(/sin series completadas/);
    });

    it('Caso 4G: Cumplimiento por VOLUMEN >= 70% (75 kg reales de 100 kg prescritos) incrementa la racha', () => {
      const sesion = clonarSesionInicial();
      // Una sola serie prescrita a 100 kg x 10 reps; el alumno realizó 75 kg x 10 reps = 75% del volumen
      sesion.ejercicios = [
        {
          id: 'ej-sesion-vol',
          sesionId,
          ejercicioId: ejercicioId1,
          orden: 1,
          series: [
            {
              id: serie1Id,
              ejercicioSesionId: 'ej-sesion-vol',
              numeroSerie: 1,
              repsObjetivo: 10,
              repsLogradas: 10,
              pesoKg: '75.00',
              pesoPrescritoKg: '100.00',
              rpe: null,
              completada: true,
              timestampCompletadaUtc: '2026-09-06T10:10:00Z',
            },
          ],
        },
      ];

      const resultado = engine.finalizarSesion(
        sesion,
        { fechaFinUtc: '2026-09-06T11:00:00Z' },
        { rachaDias: 7, rachaUltimaFecha: '2026-09-05' }
      );

      expect(resultado.cumpleReglaRacha).toBe(true);
      expect(resultado.nuevaRacha).toBe(8);
    });

    it('Caso 4H: Cumplimiento por VOLUMEN < 70% (50 kg reales de 100 kg prescritos) NO incrementa la racha', () => {
      const sesion = clonarSesionInicial();
      sesion.ejercicios = [
        {
          id: 'ej-sesion-vol',
          sesionId,
          ejercicioId: ejercicioId1,
          orden: 1,
          series: [
            {
              id: serie1Id,
              ejercicioSesionId: 'ej-sesion-vol',
              numeroSerie: 1,
              repsObjetivo: 10,
              repsLogradas: 10,
              pesoKg: '50.00',
              pesoPrescritoKg: '100.00',
              rpe: null,
              completada: true,
              timestampCompletadaUtc: '2026-09-06T10:10:00Z',
            },
          ],
        },
      ];

      const resultado = engine.finalizarSesion(
        sesion,
        { fechaFinUtc: '2026-09-06T11:00:00Z' },
        { rachaDias: 7, rachaUltimaFecha: '2026-09-05' }
      );

      expect(resultado.cumpleReglaRacha).toBe(false);
      expect(resultado.nuevaRacha).toBe(7);
    });

    it('Caso 4I: Regla combinada: volumen 100% pero parte cualitativa al 0% -> NO cumple', () => {
      const sesion = clonarSesionInicial();
      sesion.ejercicios = [
        {
          id: 'ej-sesion-mixto',
          sesionId,
          ejercicioId: ejercicioId1,
          orden: 1,
          series: [
            {
              id: serie1Id,
              ejercicioSesionId: 'ej-sesion-mixto',
              numeroSerie: 1,
              repsObjetivo: 10,
              repsLogradas: 10,
              pesoKg: '100.00',
              pesoPrescritoKg: '100.00',
              rpe: null,
              completada: true,
              timestampCompletadaUtc: '2026-09-06T10:10:00Z',
            },
            {
              id: serie2Id,
              ejercicioSesionId: 'ej-sesion-mixto',
              numeroSerie: 2,
              repsObjetivo: 10,
              repsLogradas: null,
              pesoKg: null,
              pesoPrescritoKg: null,
              rpe: null,
              completada: false,
              timestampCompletadaUtc: null,
            },
          ],
        },
      ];

      const resultado = engine.finalizarSesion(
        sesion,
        { fechaFinUtc: '2026-09-06T11:00:00Z' },
        { rachaDias: 7, rachaUltimaFecha: '2026-09-05' }
      );

      expect(resultado.cumpleReglaRacha).toBe(false);
      expect(resultado.nuevaRacha).toBe(7);
    });

    it('Caso 4J: Mismo día no duplica la racha', () => {
      const resultado = actualizarRacha(
        { rachaDias: 5, rachaUltimaFecha: '2026-09-06' },
        '2026-09-06',
        true
      );

      expect(resultado.incrementada).toBe(false);
      expect(resultado.rachaDias).toBe(5);
      expect(resultado.rachaUltimaFecha).toBe('2026-09-06');
    });

    it('Caso 4K: Gap de días reinicia la racha a 1', () => {
      const resultado = actualizarRacha(
        { rachaDias: 9, rachaUltimaFecha: '2026-08-30' },
        '2026-09-06',
        true
      );

      expect(resultado.incrementada).toBe(true);
      expect(resultado.rachaDias).toBe(1);
      expect(resultado.rachaUltimaFecha).toBe('2026-09-06');
    });

    it('Caso 4L: Racha efectiva es 0 cuando la última fecha es anterior a ayer', () => {
      expect(calcularRachaEfectiva(9, '2026-08-30', '2026-09-06')).toBe(0);
      expect(calcularRachaEfectiva(9, '2026-09-05', '2026-09-06')).toBe(9);
      expect(calcularRachaEfectiva(9, null, '2026-09-06')).toBe(0);
    });

    it('Caso 4M: Debe rechazar finalizar una sesión que no esté en progreso', () => {
      sesionInicial.estado = EstadoSesion.PLANIFICADA;
      expect(() =>
        engine.finalizarSesion(sesionInicial, {}, { rachaDias: 0, rachaUltimaFecha: null })
      ).toThrow(/No se puede finalizar una sesión que no esté 'en_progreso'/);
    });
  });

  describe('Escenario 5: Monitor de Adherencia Semanal del Coach (RN-03, Gherkin Escenario 4)', () => {
    it('Caso 5A: Semáforo VERDE cuando cumplimiento >= 80% e inactividad <= 4 días', () => {
      // Alumno con 4 de 5 sesiones completadas (80.00%) y 1 día inactivo
      const evaluacion = engine.evaluarAdherenciaSemanal(5, 4, 1);

      expect(evaluacion.porcentajeCumplimientoSemanal).toBe('80.00');
      expect(evaluacion.semaforoAdherencia).toBe(SemaforoAdherencia.VERDE);
      expect(evaluacion.nivelRiesgo).toBe('BAJO');
    });

    it('Caso 5B: Semáforo AMARILLO cuando cumplimiento está entre 50% y 79% (en riesgo)', () => {
      // Alumno con 3 de 5 sesiones completadas (60.00%) y 2 días inactivo
      const evaluacion = engine.evaluarAdherenciaSemanal(5, 3, 2);

      expect(evaluacion.porcentajeCumplimientoSemanal).toBe('60.00');
      expect(evaluacion.semaforoAdherencia).toBe(SemaforoAdherencia.AMARILLO);
      expect(evaluacion.nivelRiesgo).toBe('MEDIO');
    });

    it('Caso 5C: Semáforo ROJO cuando cumplimiento < 50%', () => {
      // Alumno con 2 de 5 sesiones completadas (40.00%) y 2 días inactivo
      const evaluacion = engine.evaluarAdherenciaSemanal(5, 2, 2);

      expect(evaluacion.porcentajeCumplimientoSemanal).toBe('40.00');
      expect(evaluacion.semaforoAdherencia).toBe(SemaforoAdherencia.ROJO);
      expect(evaluacion.nivelRiesgo).toBe('ALTO');
    });

    it('Caso 5D: Semáforo ROJO si inactividad > 4 días consecutivos, aun con buen ratio', () => {
      // Alumno con 4 de 5 sesiones completadas (80.00%) pero ausente 5 días consecutivos
      const evaluacion = engine.evaluarAdherenciaSemanal(5, 4, 5);

      expect(evaluacion.semaforoAdherencia).toBe(SemaforoAdherencia.ROJO);
      expect(evaluacion.nivelRiesgo).toBe('ALTO');
    });

    it('Caso 5E: Priorización de bandeja por riesgo del coach (ROJO en la parte superior)', () => {
      const carteraAlumnos = [
        { nombre: 'Pedro (Verde)', ...engine.evaluarAdherenciaSemanal(5, 5, 0) },
        { nombre: 'Carlos (Rojo)', ...engine.evaluarAdherenciaSemanal(5, 1, 3) },
        { nombre: 'María (Amarillo)', ...engine.evaluarAdherenciaSemanal(5, 3, 2) },
        { nombre: 'Lucía (Rojo Inactivo)', ...engine.evaluarAdherenciaSemanal(5, 4, 5) },
      ];

      const pesoRiesgo: Record<SemaforoAdherencia, number> = {
        [SemaforoAdherencia.ROJO]: 3,
        [SemaforoAdherencia.AMARILLO]: 2,
        [SemaforoAdherencia.VERDE]: 1,
      };

      const ordenadosPorRiesgo = [...carteraAlumnos].sort(
        (a, b) => pesoRiesgo[b.semaforoAdherencia] - pesoRiesgo[a.semaforoAdherencia]
      );

      // Los primeros de la lista deben ser los de mayor riesgo (ROJO)
      expect(ordenadosPorRiesgo[0].semaforoAdherencia).toBe(SemaforoAdherencia.ROJO);
      expect(ordenadosPorRiesgo[1].semaforoAdherencia).toBe(SemaforoAdherencia.ROJO);
      expect(ordenadosPorRiesgo[2].semaforoAdherencia).toBe(SemaforoAdherencia.AMARILLO);
      expect(ordenadosPorRiesgo[3].semaforoAdherencia).toBe(SemaforoAdherencia.VERDE);
    });
  });
});
