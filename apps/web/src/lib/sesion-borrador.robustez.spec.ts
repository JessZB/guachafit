import { describe, expect, it } from 'vitest';
import {
  EstadoSesion,
  LIMITES_SERIE,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { combinarSeriesPendientesLocales } from './sesion-borrador';

describe('sesion-borrador · combinarSeriesPendientesLocales (robustez)', () => {
  const SESION_ID = 'sesion-borrador-robustez';
  const ALUMNO_ID = 'alumno-123';

  const crearSesionBase = (): SesionEntrenamientoDetalleDTO => ({
    id: SESION_ID,
    alumnoId: ALUMNO_ID,
    bloqueId: 'bloque-1',
    fechaProgramada: '2026-11-04',
    timezoneCliente: 'America/Caracas',
    estado: EstadoSesion.EN_PROGRESO,
    porcentajeCumplimiento: '0.00',
    createdAtUtc: '2026-11-04T12:00:00.000Z',
    updatedAtUtc: '2026-11-04T12:00:00.000Z',
    ejercicios: [
      {
        id: 'ej-sesion-1',
        sesionId: SESION_ID,
        ejercicioId: 'ej-1',
        orden: 1,
        ejercicio: {
          id: 'ej-1',
          nombre: 'Press de Banca',
          grupoMuscular: 'Pecho',
          activo: true,
          createdAtUtc: '2026-11-01T00:00:00.000Z',
        },
        series: [
          {
            id: 'serie-1',
            ejercicioSesionId: 'ej-sesion-1',
            numeroSerie: 1,
            repsObjetivo: 10,
            repsLogradas: null,
            pesoKg: null,
            pesoPrescritoKg: '50.00',
            rpe: null,
            descansoSegundos: 90,
            completada: false,
          },
          {
            id: 'serie-2',
            ejercicioSesionId: 'ej-sesion-1',
            numeroSerie: 2,
            repsObjetivo: 10,
            repsLogradas: null,
            pesoKg: null,
            pesoPrescritoKg: '50.00',
            rpe: null,
            descansoSegundos: 90,
            completada: false,
          },
        ],
      },
    ],
  });

  describe('copia local corrupta no lanza y devuelve equivalente a servidor', () => {
    it('si local.ejercicios no es un array, no lanza y devuelve equivalente a servidor', () => {
      const servidor = crearSesionBase();
      const localCorrupto = {
        ...crearSesionBase(),
        ejercicios: undefined as unknown as typeof servidor.ejercicios,
      };

      expect(() => {
        const resultado = combinarSeriesPendientesLocales(servidor, localCorrupto);
        expect(resultado).toEqual(servidor);
      }).not.toThrow();
    });

    it('si algún ejercicio.series no es un array, no lanza y devuelve equivalente a servidor', () => {
      const servidor = crearSesionBase();
      const localCorrupto = {
        ...crearSesionBase(),
        ejercicios: [
          {
            ...servidor.ejercicios[0],
            series: null as unknown as typeof servidor.ejercicios[0]['series'],
          },
        ],
      };

      expect(() => {
        const resultado = combinarSeriesPendientesLocales(servidor, localCorrupto);
        expect(resultado).toEqual(servidor);
      }).not.toThrow();
    });
  });

  describe('aislamiento entre alumnos', () => {
    it('si local.alumnoId !== servidor.alumnoId no se combina nada', () => {
      const servidor = crearSesionBase();
      const local = crearSesionBase();
      local.alumnoId = 'otro-alumno-distinto';
      local.ejercicios[0].series[0].pesoKg = '80.00';
      local.ejercicios[0].series[0].repsLogradas = 8;
      local.ejercicios[0].series[0].rpe = '8';

      const resultado = combinarSeriesPendientesLocales(servidor, local);
      const serie1 = resultado.ejercicios[0].series[0];

      expect(serie1.pesoKg).toBeNull();
      expect(serie1.repsLogradas).toBeNull();
      expect(serie1.rpe).toBeNull();
      expect(resultado).toEqual(servidor);
    });
  });

  describe('validación contra límites compartidos de @guachafit/shared (LIMITES_SERIE)', () => {
    it('ignora pesoKg fuera del contrato (superior al máximo o con > 2 decimales) y conserva servidor', () => {
      const servidor = crearSesionBase();
      servidor.ejercicios[0].series[0].pesoKg = '40.00';
      servidor.ejercicios[0].series[1].pesoKg = '45.00';

      const local = crearSesionBase();
      // 1250.00 supera LIMITES_SERIE.pesoKgMax (999.99 kg)
      local.ejercicios[0].series[0].pesoKg = '1250.00';
      // 50.125 tiene 3 decimales (contrato exige <= 2)
      local.ejercicios[0].series[1].pesoKg = '50.125';

      const resultado = combinarSeriesPendientesLocales(servidor, local);

      expect(resultado.ejercicios[0].series[0].pesoKg).toBe('40.00');
      expect(resultado.ejercicios[0].series[1].pesoKg).toBe('45.00');
    });

    it('ignora repsLogradas fuera de límites (superior a repsMax o no entero) y conserva servidor', () => {
      const servidor = crearSesionBase();
      servidor.ejercicios[0].series[0].repsLogradas = 10;
      servidor.ejercicios[0].series[1].repsLogradas = 12;

      const local = crearSesionBase();
      // Supera el tope de repsMax (200)
      local.ejercicios[0].series[0].repsLogradas = LIMITES_SERIE.repsMax + 50;
      // Decimal inválido para repeticiones
      local.ejercicios[0].series[1].repsLogradas = 8.5 as unknown as number;

      const resultado = combinarSeriesPendientesLocales(servidor, local);

      expect(resultado.ejercicios[0].series[0].repsLogradas).toBe(10);
      expect(resultado.ejercicios[0].series[1].repsLogradas).toBe(12);
    });

    it('ignora rpe fuera de rango o con paso inválido y conserva servidor', () => {
      const servidor = crearSesionBase();
      servidor.ejercicios[0].series[0].rpe = '7';
      servidor.ejercicios[0].series[1].rpe = '8';

      const local = crearSesionBase();
      // Fuera de rango (> 10)
      local.ejercicios[0].series[0].rpe = '15';
      // Paso no válido (no múltiplo de 0.5)
      local.ejercicios[0].series[1].rpe = '8.3';

      const resultado = combinarSeriesPendientesLocales(servidor, local);

      expect(resultado.ejercicios[0].series[0].rpe).toBe('7');
      expect(resultado.ejercicios[0].series[1].rpe).toBe('8');
    });

    it('aplica valores válidos dentro del contrato (peso 62.5, reps 8, rpe 8.5)', () => {
      const servidor = crearSesionBase();
      const local = crearSesionBase();
      local.ejercicios[0].series[0].pesoKg = '62.5';
      local.ejercicios[0].series[0].repsLogradas = 8;
      local.ejercicios[0].series[0].rpe = '8.5';

      const resultado = combinarSeriesPendientesLocales(servidor, local);
      const serie1 = resultado.ejercicios[0].series[0];

      expect(serie1.pesoKg).toBe('62.5');
      expect(serie1.repsLogradas).toBe(8);
      expect(serie1.rpe).toBe('8.5');
    });

    it('no muta los argumentos recibidos', () => {
      const servidor = crearSesionBase();
      const local = crearSesionBase();
      local.ejercicios[0].series[0].pesoKg = '62.50';

      const copiaServidorJson = JSON.stringify(servidor);
      const copiaLocalJson = JSON.stringify(local);

      combinarSeriesPendientesLocales(servidor, local);

      expect(JSON.stringify(servidor)).toBe(copiaServidorJson);
      expect(JSON.stringify(local)).toBe(copiaLocalJson);
    });
  });
});
