import { describe, it, expect } from 'vitest';
import {
  CheckinAntropometricoSchema,
  PerimetrosCorporalesInputSchema,
  PlieguesCutaneosInputSchema,
  PeriodicidadAntropometria,
} from '@guachafit/shared';
import {
  construirMensajeFueraDeVentana,
  construirReferenciaExpiracionAntropometria,
  construirReferenciaRecordatorioAntropometria,
  desplazarMesesCalendario,
  esDiaProgramadoAntropometria,
  evaluarExpiracionAntropometria,
  evaluarRecordatorioAntropometria,
  evaluarVentanaCheckinAntropometrico,
  fechasProgramadasAntropometria,
  HORA_RECORDATORIO_ANTROPOMETRIA,
  HORAS_RADIO_VENTANA_ANTROPOMETRIA,
  MENSAJE_RECORDATORIO_ANTROPOMETRIA,
} from '../../src/modules/antropometria/antropometria-periodicidad.util';

/**
 * WU RF-003a (RF-003 RN-01 / RN-02 / RN-04 / §6): modelo de medidas del RN-02, calendario de
 * periodicidad y ventana ±24 h/48 h con zonas horarias reales.
 *
 * El módulo bajo prueba es PURO: aquí se verifica la regla exacta del doc sin infraestructura.
 */
describe('WU RF-003a: modelo antropométrico RN-02, periodicidad RN-01 y ventana RN-04/§6', () => {
  describe('RN-02: modelo de medidas completo', () => {
    const alumnoId = 'a3333333-3333-4333-8333-333333333333';

    it('acepta el modelo completo del doc (brazo relajado/contraído, muslo medio y 4 pliegues)', () => {
      const payload = {
        alumnoId,
        fechaEvaluacion: '2026-09-07',
        pesoKg: '78.50',
        alturaCm: '178.00',
        porcentajeGrasa: '15.50',
        perimetros: {
          cuelloCm: '39.00',
          pechoCm: '102.50',
          cinturaCm: '82.00',
          caderaCm: '98.00',
          brazoRelajadoCm: '37.50',
          brazoContraidoCm: '40.20',
          musloMedioCm: '58.00',
        },
        pliegues: {
          tricepsMm: '12.50',
          subescapularMm: '14.00',
          suprailiacoMm: '18.50',
          abdominalMm: '22.00',
        },
      };

      const resultado = CheckinAntropometricoSchema.safeParse(payload);
      expect(resultado.success).toBe(true);
      if (resultado.success) {
        expect(resultado.data.perimetros?.brazoRelajadoCm).toBe('37.50');
        expect(resultado.data.perimetros?.brazoContraidoCm).toBe('40.20');
        expect(resultado.data.perimetros?.musloMedioCm).toBe('58.00');
        expect(resultado.data.pliegues?.tricepsMm).toBe('12.50');
        expect(resultado.data.pliegues?.abdominalMm).toBe('22.00');
      }
    });

    it('conserva los alias legados `brazoCm`/`musloCm` (compatibilidad de payloads previos)', () => {
      const resultado = CheckinAntropometricoSchema.safeParse({
        alumnoId,
        fechaEvaluacion: '2026-09-07',
        pesoKg: '78.50',
        perimetros: { cinturaCm: '82.00', brazoCm: '37.50', musloCm: '58.00' },
      });

      expect(resultado.success).toBe(true);
      if (resultado.success) {
        expect(resultado.data.perimetros?.brazoCm).toBe('37.50');
        expect(resultado.data.perimetros?.musloCm).toBe('58.00');
      }
    });

    it('sigue exigiendo formato decimal de hasta 2 decimales en los perímetros nuevos', () => {
      expect(PerimetrosCorporalesInputSchema.safeParse({ brazoRelajadoCm: '37,5' }).success).toBe(
        false
      );
      expect(PerimetrosCorporalesInputSchema.safeParse({ musloMedioCm: '58.333' }).success).toBe(
        false
      );
    });

    it('rechaza perímetros biológicamente imposibles (saneamiento del §6)', () => {
      const brazo = PerimetrosCorporalesInputSchema.safeParse({ brazoContraidoCm: '95.00' });
      expect(brazo.success).toBe(false);
      if (!brazo.success) {
        expect(brazo.error.errors[0].message).toMatch(
          /El brazo contraído debe estar entre 10\.00 cm y 80\.00 cm/i
        );
      }

      const cuello = PerimetrosCorporalesInputSchema.safeParse({ cuelloCm: '9.00' });
      expect(cuello.success).toBe(false);

      const muslo = PerimetrosCorporalesInputSchema.safeParse({ musloMedioCm: '150.00' });
      expect(muslo.success).toBe(false);
    });

    it('rechaza pliegues fuera del rango de un cáliper (1–100 mm)', () => {
      expect(PlieguesCutaneosInputSchema.safeParse({ tricepsMm: '0.50' }).success).toBe(false);
      const alto = PlieguesCutaneosInputSchema.safeParse({ abdominalMm: '120.00' });
      expect(alto.success).toBe(false);
      if (!alto.success) {
        expect(alto.error.errors[0].message).toMatch(
          /El pliegue abdominal debe estar entre 1\.00 mm y 100\.00 mm/i
        );
      }
    });

    it('RN-01: la constante del radio de ventana del doc es 24 h (48 h totales con §6)', () => {
      expect(HORAS_RADIO_VENTANA_ANTROPOMETRIA).toBe(24);
      expect(HORAS_RADIO_VENTANA_ANTROPOMETRIA * 2).toBe(48);
      expect(HORA_RECORDATORIO_ANTROPOMETRIA).toBe(6);
    });
  });

  describe('RN-01: calendario de periodicidad', () => {
    it('semanal: hoy programado devuelve la misma fecha como anterior y siguiente', () => {
      const { anterior, siguiente } = fechasProgramadasAntropometria(
        '2026-09-07',
        PeriodicidadAntropometria.SEMANAL,
        '2026-09-14'
      );
      expect(anterior).toBe('2026-09-14');
      expect(siguiente).toBe('2026-09-14');
      expect(
        esDiaProgramadoAntropometria('2026-09-07', PeriodicidadAntropometria.SEMANAL, '2026-09-14')
      ).toBe(true);
    });

    it('semanal: un día intermedio deja la última fecha cumplida y la próxima', () => {
      const { anterior, siguiente } = fechasProgramadasAntropometria(
        '2026-09-07',
        PeriodicidadAntropometria.SEMANAL,
        '2026-09-16'
      );
      expect(anterior).toBe('2026-09-14');
      expect(siguiente).toBe('2026-09-21');
      expect(
        esDiaProgramadoAntropometria('2026-09-07', PeriodicidadAntropometria.SEMANAL, '2026-09-16')
      ).toBe(false);
    });

    it('quincenal: respeta el intervalo de 14 días desde el ancla', () => {
      const { anterior, siguiente } = fechasProgramadasAntropometria(
        '2026-09-07',
        PeriodicidadAntropometria.QUINCENAL,
        '2026-09-20'
      );
      expect(anterior).toBe('2026-09-07');
      expect(siguiente).toBe('2026-09-21');
    });

    it('mensual: usa meses calendario y satura al último día del mes', () => {
      expect(desplazarMesesCalendario('2026-01-31', 1)).toBe('2026-02-28');
      expect(desplazarMesesCalendario('2026-01-31', 2)).toBe('2026-03-31');
      expect(desplazarMesesCalendario('2026-03-15', -1)).toBe('2026-02-15');

      const { anterior, siguiente } = fechasProgramadasAntropometria(
        '2026-01-31',
        PeriodicidadAntropometria.MENSUAL,
        '2026-03-15'
      );
      expect(anterior).toBe('2026-02-28');
      expect(siguiente).toBe('2026-03-31');

      // El día saturado del mes ES la fecha programada de ese mes.
      expect(
        esDiaProgramadoAntropometria('2026-01-31', PeriodicidadAntropometria.MENSUAL, '2026-02-28')
      ).toBe(true);
    });

    it('ancla futura: no hay fecha cumplida todavía', () => {
      const { anterior, siguiente } = fechasProgramadasAntropometria(
        '2026-12-01',
        PeriodicidadAntropometria.SEMANAL,
        '2026-09-07'
      );
      expect(anterior).toBeNull();
      expect(siguiente).toBe('2026-12-01');
      expect(
        esDiaProgramadoAntropometria('2026-12-01', PeriodicidadAntropometria.SEMANAL, '2026-09-07')
      ).toBe(false);
    });
  });

  describe('RN-04/§6: ventana de check-in remoto (±24 h alrededor del día programado)', () => {
    const quincenal = {
      periodicidad: PeriodicidadAntropometria.QUINCENAL,
      antropometriaInicio: '2026-09-07',
      timezone: 'America/Caracas',
    };

    it('sin periodicidad ni ancla NO aplica ventana (comportamiento previo preservado)', () => {
      const resultado = evaluarVentanaCheckinAntropometrico({ timezone: 'America/Caracas' });
      expect(resultado.aplica).toBe(false);
      expect(resultado.permitido).toBe(true);
      expect(resultado.motivo).toBe('SIN_PERIODICIDAD');
    });

    it('permite el registro el propio día programado y describe la ventana de 48 h', () => {
      // 2026-09-07 06:00 en Caracas (UTC-4) = 10:00 UTC.
      const resultado = evaluarVentanaCheckinAntropometrico({
        ...quincenal,
        ahora: new Date('2026-09-07T10:00:00.000Z'),
      });

      expect(resultado.permitido).toBe(true);
      expect(resultado.ventanaVigente).toEqual({
        fecha: '2026-09-07',
        desde: '2026-09-06',
        hasta: '2026-09-08',
      });
    });

    it('los límites son exactos: 00:00 locales de D-1 abre y 00:00 locales de D+1 cierra', () => {
      // 2026-09-06 00:00 en Caracas = 04:00 UTC → primer instante permitido.
      const apertura = evaluarVentanaCheckinAntropometrico({
        ...quincenal,
        ahora: new Date('2026-09-06T04:00:00.000Z'),
      });
      expect(apertura.permitido).toBe(true);
      expect(apertura.ventanaVigente?.fecha).toBe('2026-09-07');

      // 2026-09-08 00:00 en Caracas = 04:00 UTC → primer instante YA cerrado.
      const cierre = evaluarVentanaCheckinAntropometrico({
        ...quincenal,
        ahora: new Date('2026-09-08T04:00:00.000Z'),
      });
      expect(cierre.permitido).toBe(false);
      expect(cierre.motivo).toBe('FUERA_DE_VENTANA');
      expect(cierre.ultimaVentanaVencida).toEqual({
        fecha: '2026-09-07',
        desde: '2026-09-06',
        hasta: '2026-09-08',
      });
      expect(cierre.proximaVentana).toEqual({
        fecha: '2026-09-21',
        desde: '2026-09-20',
        hasta: '2026-09-22',
      });
    });

    it('antes de la primera fecha programada la ventana aún no está abierta', () => {
      const resultado = evaluarVentanaCheckinAntropometrico({
        ...quincenal,
        ahora: new Date('2026-09-06T03:00:00.000Z'), // 2026-09-05 23:00 en Caracas
      });

      expect(resultado.permitido).toBe(false);
      expect(resultado.proximaVentana).toEqual({
        fecha: '2026-09-07',
        desde: '2026-09-06',
        hasta: '2026-09-08',
      });
      expect(resultado.ultimaVentanaVencida).toBeNull();
      expect(construirMensajeFueraDeVentana(resultado)).toMatch(/aún no está abierta/i);
      expect(construirMensajeFueraDeVentana(resultado)).toContain('2026-09-06');
      expect(construirMensajeFueraDeVentana(resultado)).toContain('2026-09-08');
    });

    it('explica el cierre con la ventana vencida y la próxima (mensaje accionable)', () => {
      const resultado = evaluarVentanaCheckinAntropometrico({
        ...quincenal,
        ahora: new Date('2026-09-10T15:00:00.000Z'),
      });

      const mensaje = construirMensajeFueraDeVentana(resultado);
      expect(resultado.permitido).toBe(false);
      expect(mensaje).toMatch(/ya cerró/i);
      expect(mensaje).toContain('2026-09-06');
      expect(mensaje).toContain('2026-09-20');
      expect(mensaje).toMatch(/entrenador/i);
    });

    it('la misma hora UTC cae dentro o fuera según la zona IANA del alumno', () => {
      const instante = new Date('2026-09-05T22:00:00.000Z');

      // Caracas (UTC-4): 2026-09-05 18:00 → ventana aún cerrada.
      const caracas = evaluarVentanaCheckinAntropometrico({
        ...quincenal,
        ahora: instante,
      });
      expect(caracas.hoyLocal).toBe('2026-09-05');
      expect(caracas.permitido).toBe(false);

      // Madrid (UTC+2 en septiembre): 2026-09-06 00:00 → ventana recién abierta.
      const madrid = evaluarVentanaCheckinAntropometrico({
        ...quincenal,
        timezone: 'Europe/Madrid',
        ahora: instante,
      });
      expect(madrid.hoyLocal).toBe('2026-09-06');
      expect(madrid.permitido).toBe(true);
      expect(madrid.ventanaVigente?.fecha).toBe('2026-09-07');
    });

    it('una zona inválida cae a la zona por defecto del producto (America/Caracas)', () => {
      const resultado = evaluarVentanaCheckinAntropometrico({
        ...quincenal,
        timezone: 'Zona/Inventada',
        ahora: new Date('2026-09-07T10:00:00.000Z'),
      });
      expect(resultado.hoyLocal).toBe('2026-09-07');
      expect(resultado.permitido).toBe(true);
    });
  });

  describe('RN-01: recordatorio a las 06:00 locales (job horario)', () => {
    const semanal = {
      periodicidad: PeriodicidadAntropometria.SEMANAL,
      antropometriaInicio: '2026-09-07',
      timezone: 'America/Caracas',
    };

    it('corresponde solo en la fecha programada y a las 06:00 locales', () => {
      const aLasSeis = evaluarRecordatorioAntropometria({
        ...semanal,
        ahora: new Date('2026-09-14T10:00:00.000Z'), // 06:00 Caracas
      });
      expect(aLasSeis.corresponde).toBe(true);
      expect(aLasSeis.horaLocal).toBe(6);
      expect(aLasSeis.fechaProgramada).toBe('2026-09-14');
      expect(aLasSeis.referenciaId).toBe('antropometria_2026-09-14');

      const aLasSiete = evaluarRecordatorioAntropometria({
        ...semanal,
        ahora: new Date('2026-09-14T11:00:00.000Z'),
      });
      expect(aLasSiete.corresponde).toBe(false);
      expect(aLasSiete.horaLocal).toBe(7);
    });

    it('no corresponde en un día no programado aunque sea a las 06:00 locales', () => {
      const resultado = evaluarRecordatorioAntropometria({
        ...semanal,
        ahora: new Date('2026-09-15T10:00:00.000Z'),
      });
      expect(resultado.corresponde).toBe(false);
      expect(resultado.fechaProgramada).toBeNull();
    });

    it('la hora del recordatorio es local: 04:00 UTC es 06:00 en Madrid (UTC+2)', () => {
      const resultado = evaluarRecordatorioAntropometria({
        ...semanal,
        timezone: 'Europe/Madrid',
        ahora: new Date('2026-09-14T04:00:00.000Z'),
      });
      expect(resultado.corresponde).toBe(true);
      expect(resultado.horaLocal).toBe(6);
      expect(resultado.hoyLocal).toBe('2026-09-14');
    });

    it('la referencia del aviso es determinista por alumno y fecha local', () => {
      expect(construirReferenciaRecordatorioAntropometria('2026-09-14')).toBe(
        'antropometria_2026-09-14'
      );
    });

    it('sin calendario configurado nunca corresponde', () => {
      const resultado = evaluarRecordatorioAntropometria({
        timezone: 'America/Caracas',
        ahora: new Date('2026-09-14T10:00:00.000Z'),
      });
      expect(resultado.corresponde).toBe(false);
      expect(resultado.referenciaId).toBeNull();
    });

    it('el copy del recordatorio es el mensaje literal del doc', () => {
      expect(MENSAJE_RECORDATORIO_ANTROPOMETRIA).toBe(
        'Hoy es día de check-in: registra tus métricas en ayunas.'
      );
    });
  });

  /**
   * WU "RF-003 · cierre" (§6): detección PURA de la ventana cerrada sin check-in. La fecha vencida
   * es la programada más reciente ANTERIOR al día local (la de hoy tiene la ventana abierta).
   */
  describe('§6: expiración de la ventana de check-in (cierre)', () => {
    const alumnoId = 'a3333333-3333-4333-8333-333333333333';
    const semanal = {
      alumnoId,
      periodicidad: PeriodicidadAntropometria.SEMANAL,
      antropometriaInicio: '2026-09-07',
      timezone: 'America/Caracas',
    };

    it('no expira el día programado (la ventana de hoy sigue abierta)', () => {
      const resultado = evaluarExpiracionAntropometria({
        ...semanal,
        ahora: new Date('2026-09-07T10:00:00.000Z'), // lunes programado, 06:00 Caracas
      });

      expect(resultado.expirado).toBe(false);
      expect(resultado.fechaProgramada).toBeNull();
      expect(resultado.referenciaId).toBeNull();
    });

    it('expira al día siguiente del día programado con la fecha vencida y referencia determinista', () => {
      const resultado = evaluarExpiracionAntropometria({
        ...semanal,
        ahora: new Date('2026-09-08T10:00:00.000Z'), // martes 06:00 Caracas
      });

      expect(resultado.expirado).toBe(true);
      expect(resultado.hoyLocal).toBe('2026-09-08');
      expect(resultado.fechaProgramada).toBe('2026-09-07');
      expect(resultado.referenciaId).toBe(
        `antropometria_expirado_${alumnoId}_2026-09-07`
      );
      expect(construirReferenciaExpiracionAntropometria(alumnoId, '2026-09-07')).toBe(
        `antropometria_expirado_${alumnoId}_2026-09-07`
      );
    });

    it('en los días intermedios sigue apuntando a la MISMA fecha vencida (una vez por fecha)', () => {
      const miercoles = evaluarExpiracionAntropometria({
        ...semanal,
        ahora: new Date('2026-09-09T14:00:00.000Z'),
      });
      const sabado = evaluarExpiracionAntropometria({
        ...semanal,
        ahora: new Date('2026-09-12T14:00:00.000Z'),
      });

      expect(miercoles.fechaProgramada).toBe('2026-09-07');
      expect(sabado.fechaProgramada).toBe('2026-09-07');
      expect(sabado.referenciaId).toBe(miercoles.referenciaId);
    });

    it('vuelve a expirar con la siguiente fecha programada cuando esa también vence', () => {
      const proximoLunes = evaluarExpiracionAntropometria({
        ...semanal,
        ahora: new Date('2026-09-15T14:00:00.000Z'), // martes tras el 2º lunes
      });

      expect(proximoLunes.expirado).toBe(true);
      expect(proximoLunes.fechaProgramada).toBe('2026-09-14');
      expect(proximoLunes.referenciaId).toBe(
        `antropometria_expirado_${alumnoId}_2026-09-14`
      );
    });

    it('la medianoche local cierra la ventana: 03:59 UTC del día D+1 en Caracas es 23:59 del día D', () => {
      // 2026-09-08T03:59Z = 2026-09-07 23:59 en Caracas: la ventana de D=2026-09-07 sigue ABIERTA.
      const antesDelCierre = evaluarExpiracionAntropometria({
        ...semanal,
        ahora: new Date('2026-09-08T03:59:00.000Z'),
      });
      expect(antesDelCierre.expirado).toBe(false);

      // 2026-09-08T04:00Z = 2026-09-08 00:00 en Caracas: la ventana ya cerró.
      const alCierre = evaluarExpiracionAntropometria({
        ...semanal,
        ahora: new Date('2026-09-08T04:00:00.000Z'),
      });
      expect(alCierre.expirado).toBe(true);
      expect(alCierre.fechaProgramada).toBe('2026-09-07');
    });

    it('sin calendario configurado nunca expira', () => {
      const resultado = evaluarExpiracionAntropometria({
        alumnoId,
        timezone: 'America/Caracas',
        ahora: new Date('2026-09-14T10:00:00.000Z'),
      });

      expect(resultado.expirado).toBe(false);
      expect(resultado.referenciaId).toBeNull();
    });
  });
});
