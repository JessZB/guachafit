/**
 * 01 pendientes (fase roja) · Contratos A1-A3: `calcularRachaEfectiva` en el módulo
 * común `apps/api/src/common/racha.util.ts` y guardián de frontera (alumnos no importa
 * de entrenamiento).
 *
 * El módulo común aún NO existe: este archivo falla en la carga por eso
 * (la razón esperada: falta el código, no un error del propio test).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { calcularRachaEfectiva } from '../../src/common/racha.util';

describe('A1 · calcularRachaEfectiva vive en apps/api/src/common/racha.util.ts', () => {
  const FECHA_LOCAL = '2026-10-19';

  it('rachaUltimaFecha null → 0', () => {
    expect(calcularRachaEfectiva(5, null, FECHA_LOCAL)).toBe(0);
  });

  it('rachaUltimaFecha undefined → 0', () => {
    expect(calcularRachaEfectiva(5, undefined, FECHA_LOCAL)).toBe(0);
  });

  it("'2026-10-17' (antes de ayer) → 0", () => {
    expect(calcularRachaEfectiva(5, '2026-10-17', FECHA_LOCAL)).toBe(0);
  });

  it("'2026-10-18' (ayer) con racha 5 → 5", () => {
    expect(calcularRachaEfectiva(5, '2026-10-18', FECHA_LOCAL)).toBe(5);
  });

  it("'2026-10-19' (hoy) con racha 5 → 5", () => {
    expect(calcularRachaEfectiva(5, '2026-10-19', FECHA_LOCAL)).toBe(5);
  });

  it('racha negativa (-3) con fecha de hoy → 0', () => {
    expect(calcularRachaEfectiva(-3, '2026-10-19', FECHA_LOCAL)).toBe(0);
  });

  it("cruce de mes: fechaLocal '2026-11-01', última '2026-10-31', racha 4 → 4", () => {
    expect(calcularRachaEfectiva(4, '2026-10-31', '2026-11-01')).toBe(4);
  });
});

describe('A3 · guardián de frontera: alumnos no importa de entrenamiento', () => {
  it('ningún .ts no-spec bajo modules/alumnos importa rutas con /entrenamiento/', () => {
    const raiz = path.resolve(__dirname, '../../src/modules/alumnos');
    const violaciones: string[] = [];
    const visitar = (dir: string): void => {
      for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        const ruta = path.join(dir, entrada.name);
        if (entrada.isDirectory()) {
          visitar(ruta);
        } else if (entrada.isFile() && ruta.endsWith('.ts') && !ruta.endsWith('.spec.ts')) {
          const lineas = fs.readFileSync(ruta, 'utf8').split('\n');
          lineas.forEach((linea, i) => {
            if (/^\s*import\s+.*\sfrom\s+['"][^'"]*\/entrenamiento\//.test(linea)) {
              violaciones.push(`${ruta}:${i + 1}: ${linea.trim()}`);
            }
          });
        }
      }
    };
    visitar(raiz);
    expect(violaciones).toEqual([]);
  });
});
