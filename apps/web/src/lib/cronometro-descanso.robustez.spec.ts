import { describe, expect, it } from 'vitest';
import {
  DURACION_MIN_MS,
  TOLERANCIA_AVISO_TARDE_MS,
  ajustar,
  avisoTardio,
  iniciar,
  reiniciar,
  type EstadoCronometro,
} from './cronometro-descanso';

describe('cronometro-descanso · robustez matemática y aviso tardío', () => {
  const SESION_ID = 'sesion-cronometro-robustez';
  const AHORA = 100_000;

  describe('defensa contra NaN', () => {
    it('iniciar con duracionMs === NaN fija duracionMs en DURACION_MIN_MS y finEnMs finito', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 'ser-1',
        duracionMs: NaN,
        ahoraMs: AHORA,
      });

      expect(estado.duracionMs).toBe(DURACION_MIN_MS);
      expect(Number.isNaN(estado.duracionMs)).toBe(false);
      expect(Number.isFinite(estado.finEnMs)).toBe(true);
    });

    it('reiniciar con duracionMs === NaN fija duracionMs en DURACION_MIN_MS y finEnMs finito', () => {
      const base = iniciar({
        sesionId: SESION_ID,
        serieId: 'ser-1',
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });

      const estado = reiniciar(base, AHORA + 1_000, NaN);

      expect(estado.duracionMs).toBe(DURACION_MIN_MS);
      expect(Number.isNaN(estado.duracionMs)).toBe(false);
      expect(Number.isFinite(estado.finEnMs)).toBe(true);
    });

    it('ajustar con deltaMs === NaN devuelve un estado con duración y restante/finEnMs finitos', () => {
      const base = iniciar({
        sesionId: SESION_ID,
        serieId: 'ser-1',
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });

      const estado = ajustar(base, NaN, AHORA + 2_000);

      expect(Number.isFinite(estado.duracionMs)).toBe(true);
      expect(Number.isNaN(estado.duracionMs)).toBe(false);
      expect(Number.isFinite(estado.finEnMs)).toBe(true);
      expect(Number.isNaN(estado.finEnMs)).toBe(false);
    });
  });

  describe('contrato de aviso tardío (TOLERANCIA_AVISO_TARDE_MS y avisoTardio)', () => {
    it('exporta TOLERANCIA_AVISO_TARDE_MS con valor 30_000', () => {
      expect(TOLERANCIA_AVISO_TARDE_MS).toBe(30_000);
    });

    it('avisoTardio: false antes de terminar, false en la tolerancia exacta, true con 1 ms más, y false en pausa', () => {
      const FIN = 100_000;
      const estadoCorriendo: EstadoCronometro = {
        v: 1,
        sesionId: SESION_ID,
        serieId: 'ser-1',
        duracionMs: 60_000,
        finEnMs: FIN,
        pausadoRestanteMs: null,
        notificadoFin: false,
        actualizadoEnMs: 40_000,
      };

      // Antes de terminar
      expect(avisoTardio(estadoCorriendo, FIN - 1_000)).toBe(false);

      // Justo en el instante de terminar
      expect(avisoTardio(estadoCorriendo, FIN)).toBe(false);

      // En el instante exacto de la tolerancia (FIN + 30_000)
      expect(avisoTardio(estadoCorriendo, FIN + TOLERANCIA_AVISO_TARDE_MS)).toBe(false);

      // Con 1 ms más de la tolerancia: es tardío
      expect(avisoTardio(estadoCorriendo, FIN + TOLERANCIA_AVISO_TARDE_MS + 1)).toBe(true);

      // En pausa (finEnMs === null): siempre false
      const estadoPausado: EstadoCronometro = {
        ...estadoCorriendo,
        finEnMs: null,
        pausadoRestanteMs: 0,
      };
      expect(avisoTardio(estadoPausado, FIN + TOLERANCIA_AVISO_TARDE_MS + 5_000)).toBe(false);
    });
  });
});
