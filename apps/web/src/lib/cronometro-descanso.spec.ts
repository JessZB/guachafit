import { describe, expect, it, vi } from 'vitest';
import {
  type EstadoCronometro,
  DURACION_MIN_MS,
  DURACION_MAX_MS,
  EDAD_MAX_MS,
  prefijoClaveCronometro,
  claveCronometro,
  iniciar,
  restanteMs,
  estaTerminado,
  estaPausado,
  pausar,
  reanudar,
  ajustar,
  reiniciar,
  marcarNotificado,
  debeAvisarFin,
  serializar,
  parsear,
  leerCronometro,
  guardarCronometro,
} from './cronometro-descanso';

describe('cronometro-descanso (puro, reloj inyectado, sin React)', () => {
  const SESION_ID = 'sesion-test-123';
  const AHORA = 1_700_000_000_000;

  describe('constantes y claveCronometro', () => {
    it('expone las constantes de duración mínima, máxima y edad máxima', () => {
      expect(DURACION_MIN_MS).toBe(10_000);
      expect(DURACION_MAX_MS).toBe(600_000);
      expect(EDAD_MAX_MS).toBe(6 * 60 * 60 * 1000);
      expect(prefijoClaveCronometro).toBe('guachafit_cronometro_');
    });

    it('genera la clave prefijada con el id de sesión', () => {
      expect(claveCronometro('abc')).toBe('guachafit_cronometro_abc');
    });
  });

  describe('iniciar', () => {
    it('inicia corriendo con los valores iniciales y serie asociada', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 'serie-1',
        duracionMs: 90_000,
        ahoraMs: AHORA,
      });

      expect(estado).toEqual<EstadoCronometro>({
        v: 1,
        sesionId: SESION_ID,
        serieId: 'serie-1',
        duracionMs: 90_000,
        finEnMs: AHORA + 90_000,
        pausadoRestanteMs: null,
        notificadoFin: false,
        actualizadoEnMs: AHORA,
      });
      expect(estaPausado(estado)).toBe(false);
      expect(estaTerminado(estado, AHORA)).toBe(false);
    });

    it('permite cronómetro libre con serieId null (abierto desde cabecera)', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: null,
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      expect(estado.serieId).toBeNull();
    });

    it('acota la duración por debajo de DURACION_MIN_MS', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 'serie-1',
        duracionMs: 5_000,
        ahoraMs: AHORA,
      });
      expect(estado.duracionMs).toBe(DURACION_MIN_MS);
      expect(estado.finEnMs).toBe(AHORA + DURACION_MIN_MS);
    });

    it('acota la duración por encima de DURACION_MAX_MS', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 'serie-1',
        duracionMs: 700_000,
        ahoraMs: AHORA,
      });
      expect(estado.duracionMs).toBe(DURACION_MAX_MS);
      expect(estado.finEnMs).toBe(AHORA + DURACION_MAX_MS);
    });
  });

  describe('restanteMs y estaTerminado', () => {
    it('calcula el tiempo restante mientras corre', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 90_000,
        ahoraMs: AHORA,
      });

      expect(restanteMs(estado, AHORA)).toBe(90_000);
      expect(restanteMs(estado, AHORA + 30_000)).toBe(60_000);
      expect(restanteMs(estado, AHORA + 90_000)).toBe(0);
      expect(estaTerminado(estado, AHORA + 90_000)).toBe(true);
    });

    it('devuelve pausadoRestanteMs cuando está pausado', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 90_000,
        ahoraMs: AHORA,
      });
      const pausado = pausar(estado, AHORA + 30_000);
      expect(restanteMs(pausado, AHORA + 30_000)).toBe(60_000);
      expect(restanteMs(pausado, AHORA + 100_000)).toBe(60_000);
    });

    it('caso borde: reloj que salta hacia adelante no devuelve valores negativos', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      expect(restanteMs(estado, AHORA + 120_000)).toBe(0);
      expect(estaTerminado(estado, AHORA + 120_000)).toBe(true);
    });

    it('caso borde: reloj que retrocede nunca excede duracionMs', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      expect(restanteMs(estado, AHORA - 10_000)).toBe(60_000);
    });

    it('devuelve siempre un número entero', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      const res = restanteMs(estado, AHORA + 15_333);
      expect(Number.isInteger(res)).toBe(true);
    });
  });

  describe('pausar y reanudar', () => {
    it('congela el tiempo restante al pausar', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 90_000,
        ahoraMs: AHORA,
      });
      const pausado = pausar(estado, AHORA + 20_000);
      expect(estaPausado(pausado)).toBe(true);
      expect(pausado.pausadoRestanteMs).toBe(70_000);
      expect(pausado.finEnMs).toBeNull();
      expect(pausado.actualizadoEnMs).toBe(AHORA + 20_000);
    });

    it('es idempotente al pausar dos veces seguidas', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 90_000,
        ahoraMs: AHORA,
      });
      const pausado1 = pausar(estado, AHORA + 20_000);
      const pausado2 = pausar(pausado1, AHORA + 40_000);
      expect(pausado2.pausadoRestanteMs).toBe(70_000);
      expect(pausado2.actualizadoEnMs).toBe(pausado1.actualizadoEnMs);
    });

    it('regla explícita: pausar con 30 s restantes, avanzar 60 s, reanudar => quedan 30 s', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      // A los 30 s quedan 30 s
      const pausado = pausar(estado, AHORA + 30_000);
      expect(restanteMs(pausado, AHORA + 30_000)).toBe(30_000);

      // Avanzan 60 s más mientras está pausado
      const ahoraReanudacion = AHORA + 30_000 + 60_000;
      const reanudado = reanudar(pausado, ahoraReanudacion);

      expect(estaPausado(reanudado)).toBe(false);
      expect(reanudado.pausadoRestanteMs).toBeNull();
      expect(reanudado.finEnMs).toBe(ahoraReanudacion + 30_000);
      expect(restanteMs(reanudado, ahoraReanudacion)).toBe(30_000);
      expect(restanteMs(reanudado, ahoraReanudacion + 10_000)).toBe(20_000);
    });

    it('es idempotente al reanudar dos veces seguidas', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 90_000,
        ahoraMs: AHORA,
      });
      const pausado = pausar(estado, AHORA + 10_000);
      const reanudado1 = reanudar(pausado, AHORA + 20_000);
      const reanudado2 = reanudar(reanudado1, AHORA + 30_000);
      expect(reanudado2.finEnMs).toBe(reanudado1.finEnMs);
      expect(reanudado2.actualizadoEnMs).toBe(reanudado1.actualizadoEnMs);
    });
  });

  describe('ajustar', () => {
    it('suma al restante y a la duración mientras corre', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      // A los 20 s quedan 40 s; sumar 15 s => quedan 55 s, duracion pasa a 75 s
      const ajustado = ajustar(estado, 15_000, AHORA + 20_000);
      expect(ajustado.duracionMs).toBe(75_000);
      expect(restanteMs(ajustado, AHORA + 20_000)).toBe(55_000);
      expect(ajustado.finEnMs).toBe(AHORA + 20_000 + 55_000);
    });

    it('resta al restante y a la duración', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      const ajustado = ajustar(estado, -15_000, AHORA + 20_000);
      expect(ajustado.duracionMs).toBe(45_000);
      expect(restanteMs(ajustado, AHORA + 20_000)).toBe(25_000);
    });

    it('funciona correctamente estando pausado', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      const pausado = pausar(estado, AHORA + 30_000); // 30 s restante
      const ajustado = ajustar(pausado, 15_000, AHORA + 40_000);
      expect(estaPausado(ajustado)).toBe(true);
      expect(ajustado.duracionMs).toBe(75_000);
      expect(ajustado.pausadoRestanteMs).toBe(45_000);
      expect(restanteMs(ajustado, AHORA + 40_000)).toBe(45_000);
    });

    it('acota la duración mínima a DURACION_MIN_MS', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 15_000,
        ahoraMs: AHORA,
      });
      const ajustado = ajustar(estado, -10_000, AHORA);
      expect(ajustado.duracionMs).toBe(DURACION_MIN_MS);
    });

    it('acota la duración máxima a DURACION_MAX_MS', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 590_000,
        ahoraMs: AHORA,
      });
      const ajustado = ajustar(estado, 30_000, AHORA);
      expect(ajustado.duracionMs).toBe(DURACION_MAX_MS);
    });

    it('caso borde: ajuste por debajo de 0 termina y duración >= mínimo', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 30_000,
        ahoraMs: AHORA,
      });
      // Quedan 10 s; restar 20 s => restante 0 (terminado), duracion >= DURACION_MIN_MS
      const ajustado = ajustar(estado, -20_000, AHORA + 20_000);
      expect(restanteMs(ajustado, AHORA + 20_000)).toBe(0);
      expect(estaTerminado(ajustado, AHORA + 20_000)).toBe(true);
      expect(ajustado.duracionMs).toBeGreaterThanOrEqual(DURACION_MIN_MS);
      expect(debeAvisarFin(ajustado, AHORA + 20_000)).toBe(true);
    });
  });

  describe('reiniciar', () => {
    it('restaura el restante a la duración actual corriendo con notificadoFin en false', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      const terminado = marcarNotificado({
        ...estado,
        finEnMs: AHORA + 60_000,
        notificadoFin: true,
      });
      const ahoraReinicio = AHORA + 80_000;
      const reiniciado = reiniciar(terminado, ahoraReinicio);

      expect(reiniciado.duracionMs).toBe(60_000);
      expect(estaPausado(reiniciado)).toBe(false);
      expect(reiniciado.finEnMs).toBe(ahoraReinicio + 60_000);
      expect(reiniciado.notificadoFin).toBe(false);
      expect(restanteMs(reiniciado, ahoraReinicio)).toBe(60_000);
    });

    it('permite reiniciar con una duración explícita nueva', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      const reiniciado = reiniciar(estado, AHORA + 10_000, 90_000);
      expect(reiniciado.duracionMs).toBe(90_000);
      expect(reiniciado.finEnMs).toBe(AHORA + 10_000 + 90_000);
      expect(restanteMs(reiniciado, AHORA + 10_000)).toBe(90_000);
    });
  });

  describe('marcarNotificado y debeAvisarFin', () => {
    it('debeAvisarFin es true solo si está terminado y notificadoFin es false', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 30_000,
        ahoraMs: AHORA,
      });
      expect(debeAvisarFin(estado, AHORA)).toBe(false);
      expect(debeAvisarFin(estado, AHORA + 15_000)).toBe(false);
      expect(debeAvisarFin(estado, AHORA + 30_000)).toBe(true);
      expect(debeAvisarFin(estado, AHORA + 50_000)).toBe(true);
    });

    it('tras marcarNotificado, debeAvisarFin pasa a ser false', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 30_000,
        ahoraMs: AHORA,
      });
      const notificado = marcarNotificado(estado);
      expect(notificado.notificadoFin).toBe(true);
      expect(debeAvisarFin(notificado, AHORA + 30_000)).toBe(false);
    });
  });

  describe('serializar y parsear', () => {
    it('serializar -> parsear es identidad con un estado válido corriendo', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 90_000,
        ahoraMs: AHORA,
      });
      const raw = serializar(estado);
      const parseado = parsear(raw, { sesionId: SESION_ID, ahoraMs: AHORA + 1000 });
      expect(parseado).toEqual(estado);
    });

    it('serializar -> parsear es identidad con un estado válido pausado', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: null,
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      const pausado = pausar(estado, AHORA + 10_000);
      const raw = serializar(pausado);
      const parseado = parsear(raw, { sesionId: SESION_ID, ahoraMs: AHORA + 15_000 });
      expect(parseado).toEqual(pausado);
    });

    it('parsear devuelve null sin lanzar ante null o string vacío', () => {
      expect(parsear(null, { sesionId: SESION_ID, ahoraMs: AHORA })).toBeNull();
      expect(parsear('', { sesionId: SESION_ID, ahoraMs: AHORA })).toBeNull();
    });

    it('parsear devuelve null sin lanzar ante JSON inválido', () => {
      expect(parsear('{malformed', { sesionId: SESION_ID, ahoraMs: AHORA })).toBeNull();
    });

    it('parsear devuelve null ante v distinto de 1', () => {
      const raw = JSON.stringify({
        v: 2,
        sesionId: SESION_ID,
        serieId: null,
        duracionMs: 60_000,
        finEnMs: AHORA + 60_000,
        pausadoRestanteMs: null,
        notificadoFin: false,
        actualizadoEnMs: AHORA,
      });
      expect(parsear(raw, { sesionId: SESION_ID, ahoraMs: AHORA })).toBeNull();
    });

    it('parsear devuelve null ante campos numéricos corruptos (NaN, no numéricos, negativos)', () => {
      const base = {
        v: 1,
        sesionId: SESION_ID,
        serieId: null,
        duracionMs: 'sesenta_mil',
        finEnMs: AHORA + 60_000,
        pausadoRestanteMs: null,
        notificadoFin: false,
        actualizadoEnMs: AHORA,
      };
      expect(parsear(JSON.stringify(base), { sesionId: SESION_ID, ahoraMs: AHORA })).toBeNull();

      const conNegativo = { ...base, duracionMs: -10_000 };
      expect(parsear(JSON.stringify(conNegativo), { sesionId: SESION_ID, ahoraMs: AHORA })).toBeNull();
    });

    it('parsear devuelve null si finEnMs y pausadoRestanteMs están ambos no nulos o ambos nulos', () => {
      const ambosNoNulos = {
        v: 1,
        sesionId: SESION_ID,
        serieId: null,
        duracionMs: 60_000,
        finEnMs: AHORA + 60_000,
        pausadoRestanteMs: 30_000,
        notificadoFin: false,
        actualizadoEnMs: AHORA,
      };
      expect(parsear(JSON.stringify(ambosNoNulos), { sesionId: SESION_ID, ahoraMs: AHORA })).toBeNull();

      const ambosNulos = { ...ambosNoNulos, finEnMs: null, pausadoRestanteMs: null };
      expect(parsear(JSON.stringify(ambosNulos), { sesionId: SESION_ID, ahoraMs: AHORA })).toBeNull();
    });

    it('parsear devuelve null si la duración está fuera de [DURACION_MIN_MS, DURACION_MAX_MS]', () => {
      const muyBaja = {
        v: 1,
        sesionId: SESION_ID,
        serieId: null,
        duracionMs: 5_000,
        finEnMs: AHORA + 5_000,
        pausadoRestanteMs: null,
        notificadoFin: false,
        actualizadoEnMs: AHORA,
      };
      expect(parsear(JSON.stringify(muyBaja), { sesionId: SESION_ID, ahoraMs: AHORA })).toBeNull();

      const muyAlta = { ...muyBaja, duracionMs: 900_000, finEnMs: AHORA + 900_000 };
      expect(parsear(JSON.stringify(muyAlta), { sesionId: SESION_ID, ahoraMs: AHORA })).toBeNull();
    });

    it('parsear devuelve null si el sesionId difiere del pedido (sesión distinta descartada)', () => {
      const estado = iniciar({
        sesionId: 'sesion-vieja',
        serieId: null,
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      const raw = serializar(estado);
      expect(parsear(raw, { sesionId: 'sesion-nueva', ahoraMs: AHORA })).toBeNull();
    });

    it('parsear devuelve null si la edad supera maxEdadMs (o EDAD_MAX_MS por defecto)', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: null,
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      const raw = serializar(estado);
      // Edad mayor a 6 horas
      const ahoraTarde = AHORA + EDAD_MAX_MS + 1000;
      expect(parsear(raw, { sesionId: SESION_ID, ahoraMs: ahoraTarde })).toBeNull();

      // Con maxEdadMs explícito
      expect(parsear(raw, { sesionId: SESION_ID, ahoraMs: AHORA + 5000, maxEdadMs: 3000 })).toBeNull();
    });
  });

  describe('leerCronometro y guardarCronometro', () => {
    it('leerCronometro devuelve el estado si existe y es válido', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      const almacenFalso = {
        getItem: vi.fn((key: string) => {
          if (key === claveCronometro(SESION_ID)) return serializar(estado);
          return null;
        }),
      };

      const leido = leerCronometro(almacenFalso, SESION_ID, AHORA);
      expect(leido).toEqual(estado);
      expect(almacenFalso.getItem).toHaveBeenCalledWith(claveCronometro(SESION_ID));
    });

    it('leerCronometro devuelve null si el almacén es null o getItem devuelve null', () => {
      expect(leerCronometro(null, SESION_ID, AHORA)).toBeNull();

      const almacenVacio = { getItem: vi.fn(() => null) };
      expect(leerCronometro(almacenVacio, SESION_ID, AHORA)).toBeNull();
    });

    it('leerCronometro devuelve null sin lanzar si getItem lanza error', () => {
      const almacenQueLanza = {
        getItem: vi.fn(() => {
          throw new Error('Almacenamiento bloqueado');
        }),
      };
      expect(() => leerCronometro(almacenQueLanza, SESION_ID, AHORA)).not.toThrow();
      expect(leerCronometro(almacenQueLanza, SESION_ID, AHORA)).toBeNull();
    });

    it('guardarCronometro con estado guarda en el almacén y devuelve true', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      const almacenFalso = {
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };

      const resultado = guardarCronometro(almacenFalso, SESION_ID, estado);
      expect(resultado).toBe(true);
      expect(almacenFalso.setItem).toHaveBeenCalledWith(
        claveCronometro(SESION_ID),
        serializar(estado)
      );
    });

    it('guardarCronometro con null borra la clave y devuelve true', () => {
      const almacenFalso = {
        setItem: vi.fn(),
        removeItem: vi.fn(),
      };

      const resultado = guardarCronometro(almacenFalso, SESION_ID, null);
      expect(resultado).toBe(true);
      expect(almacenFalso.removeItem).toHaveBeenCalledWith(claveCronometro(SESION_ID));
    });

    it('guardarCronometro devuelve false si almacén es null', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: null,
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      expect(guardarCronometro(null, SESION_ID, estado)).toBe(false);
    });

    it('guardarCronometro caso borde: cuota llena o setItem que lanza devuelve false sin lanzar', () => {
      const estado = iniciar({
        sesionId: SESION_ID,
        serieId: 's-1',
        duracionMs: 60_000,
        ahoraMs: AHORA,
      });
      const almacenLleno = {
        setItem: vi.fn(() => {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        }),
        removeItem: vi.fn(),
      };

      expect(() => guardarCronometro(almacenLleno, SESION_ID, estado)).not.toThrow();
      expect(guardarCronometro(almacenLleno, SESION_ID, estado)).toBe(false);
    });
  });
});
