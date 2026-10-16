// @vitest-environment node
/**
 * Lote E9 (RF-001 §7.10) · contratos U1–U3 del registro de envíos en vuelo.
 *
 * Cada caso describe el contrato exacto del módulo `./envios-en-vuelo`
 * (punto 1 del diseño):
 *
 * - U1: `hayEnvioEnVuelo` es `false` → `registrar` → `true` → `liberar` →
 *   `false`; dos registros del mismo grupo necesitan dos `liberar`; llamar dos
 *   veces al mismo `liberar` cuenta una sola vez (idempotente, sin negativos);
 *   otros grupos no se afectan.
 * - U2: `alLiberarGrupo` avisa una vez al pasar a 0, con el grupo, y no al
 *   bajar de 2 a 1; la baja de la suscripción deja de avisar.
 * - U3: `marcaDeAccionMs(1000)` → 1000; otra vez con 1000 → 1001; con 900 →
 *   1002; con 5000 → 5000; `gruposConEnvioEnVuelo()` es una copia (mutarla no
 *   cambia el registro).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  alLiberarGrupo,
  gruposConEnvioEnVuelo,
  hayEnvioEnVuelo,
  marcaDeAccionMs,
  registrarEnvioEnVuelo,
  reiniciarEnviosEnVueloParaTests,
} from './envios-en-vuelo';

beforeEach(() => {
  reiniciarEnviosEnVueloParaTests();
});

describe('U1 · registro de envíos directos en vuelo por grupo causal', () => {
  it('hayEnvioEnVuelo es false → registrar → true → liberar → false', () => {
    expect(hayEnvioEnVuelo('sesion:A')).toBe(false);
    const liberar = registrarEnvioEnVuelo('sesion:A');
    expect(hayEnvioEnVuelo('sesion:A')).toBe(true);
    liberar();
    expect(hayEnvioEnVuelo('sesion:A')).toBe(false);
  });

  it('dos registros del mismo grupo necesitan dos liberar', () => {
    const liberarPrimero = registrarEnvioEnVuelo('sesion:A');
    const liberarSegundo = registrarEnvioEnVuelo('sesion:A');
    liberarPrimero();
    expect(hayEnvioEnVuelo('sesion:A')).toBe(true);
    liberarSegundo();
    expect(hayEnvioEnVuelo('sesion:A')).toBe(false);
  });

  it('llamar dos veces al mismo liberar cuenta una sola vez (sin negativos)', () => {
    const liberar = registrarEnvioEnVuelo('sesion:A');
    liberar();
    liberar();
    expect(hayEnvioEnVuelo('sesion:A')).toBe(false);
    // Sin negativos: un registro nuevo vuelve a necesitar su propio liberar.
    const otro = registrarEnvioEnVuelo('sesion:A');
    expect(hayEnvioEnVuelo('sesion:A')).toBe(true);
    otro();
    expect(hayEnvioEnVuelo('sesion:A')).toBe(false);
  });

  it('otros grupos no se afectan', () => {
    const liberarA = registrarEnvioEnVuelo('sesion:A');
    expect(hayEnvioEnVuelo('sesion:B')).toBe(false);
    liberarA();
    expect(hayEnvioEnVuelo('sesion:A')).toBe(false);
    expect(hayEnvioEnVuelo('sesion:B')).toBe(false);
  });
});

describe('U2 · alLiberarGrupo avisa al pasar a 0', () => {
  it('avisa una vez al pasar a 0, con el grupo, y no al bajar de 2 a 1', () => {
    const avisos: string[] = [];
    alLiberarGrupo((grupo: string) => void avisos.push(grupo));
    const liberarPrimero = registrarEnvioEnVuelo('sesion:A');
    const liberarSegundo = registrarEnvioEnVuelo('sesion:A');
    liberarPrimero();
    expect(avisos).toEqual([]);
    liberarSegundo();
    expect(avisos).toEqual(['sesion:A']);
  });

  it('la baja de la suscripción deja de avisar', () => {
    const avisos: string[] = [];
    const baja = alLiberarGrupo((grupo: string) => void avisos.push(grupo));
    baja();
    registrarEnvioEnVuelo('sesion:A')();
    expect(avisos).toEqual([]);
  });
});

describe('U3 · marcaDeAccionMs y copia de grupos en vuelo', () => {
  it('marcaDeAccionMs es estrictamente creciente en ms', () => {
    expect(marcaDeAccionMs(1000)).toBe(1000);
    expect(marcaDeAccionMs(1000)).toBe(1001);
    expect(marcaDeAccionMs(900)).toBe(1002);
    expect(marcaDeAccionMs(5000)).toBe(5000);
  });

  it('gruposConEnvioEnVuelo es una copia (mutarla no cambia el registro)', () => {
    registrarEnvioEnVuelo('sesion:A');
    const copia = gruposConEnvioEnVuelo();
    expect(copia.has('sesion:A')).toBe(true);
    (copia as Set<string>).delete('sesion:A');
    (copia as Set<string>).add('sesion:inventado');
    expect(hayEnvioEnVuelo('sesion:A')).toBe(true);
    expect(hayEnvioEnVuelo('sesion:inventado')).toBe(false);
  });
});
