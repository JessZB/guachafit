/**
 * Mis alumnos (dueño 2026-10-19) · spec RED del módulo NUEVO
 * `lib/alumnos-directorio-actividad.ts` (aún NO existe: este spec debe fallar por
 * módulo/función ausente).
 *
 * - C5: exporta `UMBRAL_DIAS_SIN_ENTRENAR_ALERTA = 7`.
 * - C6: `describirUltimoEntreno(ultimaSesionFecha, ahora)` → `{ texto, alerta, dias }`
 *   con días de calendario locales; fixtures cerca del mediodía para no depender
 *   de la zona horaria.
 * - C7: `describirRacha(rachaDias)` con pluralización (`pluralizar`).
 * - C8: `ordenarAlumnosDirectorio(items, orden, ahora)` pura para el modo demo, con las
 *   mismas reglas que el contrato A.4; en `mayor_racha` la racha vencida vale 0 según
 *   `rachaUltimaFecha` frente a `ahora` en día local.
 */
import { describe, expect, it } from 'vitest';
import {
  UMBRAL_DIAS_SIN_ENTRENAR_ALERTA,
  describirRacha,
  describirUltimoEntreno,
  ordenarAlumnosDirectorio,
} from './alumnos-directorio-actividad';

/** Mediodía local: evita que el día de calendario cambie según la zona horaria. */
function mediodia(y: number, mes: number, dia: number): Date {
  return new Date(y, mes - 1, dia, 12, 0, 0);
}

function isoMediodia(y: number, mes: number, dia: number): string {
  return mediodia(y, mes, dia).toISOString();
}

function fechaLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Lunes 2026-10-19 12:00 local: el "ahora" fijo de los fixtures. */
const AHORA = mediodia(2026, 10, 19);
/** ISO de `n` días antes del AHORA, a mediodía local. */
const isoHace = (n: number) => isoMediodia(2026, 10, 19 - n);

describe('alumnos-directorio-actividad · C5 umbral de alerta', () => {
  it('exporta UMBRAL_DIAS_SIN_ENTRENAR_ALERTA = 7', () => {
    expect(UMBRAL_DIAS_SIN_ENTRENAR_ALERTA).toBe(7);
  });
});

describe('alumnos-directorio-actividad · C6 describirUltimoEntreno', () => {
  it(`null o undefined → 'Sin entrenos registrados', sin alerta, dias null`, () => {
    expect(describirUltimoEntreno(null, AHORA)).toEqual({
      texto: 'Sin entrenos registrados',
      alerta: false,
      dias: null,
    });
    expect(describirUltimoEntreno(undefined, AHORA)).toEqual({
      texto: 'Sin entrenos registrados',
      alerta: false,
      dias: null,
    });
  });

  it(`0 días → 'Entrenó hoy' sin alerta`, () => {
    expect(describirUltimoEntreno(isoHace(0), AHORA)).toEqual({
      texto: 'Entrenó hoy',
      alerta: false,
      dias: 0,
    });
  });

  it(`1 día → 'Entrenó ayer' sin alerta`, () => {
    expect(describirUltimoEntreno(isoHace(1), AHORA)).toEqual({
      texto: 'Entrenó ayer',
      alerta: false,
      dias: 1,
    });
  });

  it(`de 2 a 6 días → 'Entrenó hace N días' sin alerta`, () => {
    for (const n of [2, 3, 6]) {
      expect(describirUltimoEntreno(isoHace(n), AHORA)).toEqual({
        texto: `Entrenó hace ${n} días`,
        alerta: false,
        dias: n,
      });
    }
  });

  it(`7 o más días → 'Sin entrenar hace N días' con alerta`, () => {
    for (const n of [7, 10]) {
      expect(describirUltimoEntreno(isoHace(n), AHORA)).toEqual({
        texto: `Sin entrenar hace ${n} días`,
        alerta: true,
        dias: n,
      });
    }
  });

  it(`una fecha futura cuenta como 0 días ('Entrenó hoy'), nunca hay negativos`, () => {
    expect(describirUltimoEntreno(isoMediodia(2026, 10, 20), AHORA)).toEqual({
      texto: 'Entrenó hoy',
      alerta: false,
      dias: 0,
    });
  });
});

describe('alumnos-directorio-actividad · C7 describirRacha', () => {
  it('undefined o 0 → null', () => {
    expect(describirRacha(undefined)).toBeNull();
    expect(describirRacha(0)).toBeNull();
  });

  it(`1 → 'Racha de 1 día'; N → 'Racha de N días' (pluralizar)`, () => {
    expect(describirRacha(1)).toBe('Racha de 1 día');
    expect(describirRacha(2)).toBe('Racha de 2 días');
    expect(describirRacha(9)).toBe('Racha de 9 días');
  });
});

interface AlumnoDirectorioDemo {
  id: string;
  nombres: string;
  apellidos: string;
  createdAtUtc: string;
  ultimaSesionFecha: string | null;
  rachaDias: number;
  rachaUltimaFecha: string | null;
}

type OrdenDirectorio = 'alta_reciente' | 'nombre' | 'sin_entrenar' | 'mayor_racha';

function alumno(parcial: Partial<AlumnoDirectorioDemo> & { id: string }): AlumnoDirectorioDemo {
  return {
    nombres: 'Ana',
    apellidos: 'Ríos',
    createdAtUtc: isoMediodia(2026, 10, 1),
    ultimaSesionFecha: null,
    rachaDias: 0,
    rachaUltimaFecha: null,
    ...parcial,
  };
}

function ids(items: readonly { id: string }[]): string[] {
  return items.map((i) => i.id);
}

describe('alumnos-directorio-actividad · C8 ordenarAlumnosDirectorio (modo demo)', () => {
  it(`alta_reciente: createdAtUtc desc y id asc`, () => {
    const items = [
      alumno({ id: 'b', createdAtUtc: isoMediodia(2026, 10, 1) }),
      alumno({ id: 'a', createdAtUtc: isoMediodia(2026, 10, 5) }),
      alumno({ id: 'c', createdAtUtc: isoMediodia(2026, 10, 5) }),
    ];
    expect(ids(ordenarAlumnosDirectorio(items, 'alta_reciente' satisfies OrdenDirectorio, AHORA))).toEqual([
      'a',
      'c',
      'b',
    ]);
  });

  it(`nombre: lower(nombres) asc, luego lower(apellidos) asc, luego id asc`, () => {
    const items = [
      alumno({ id: 'b', nombres: 'zora', apellidos: 'Ríos' }),
      alumno({ id: 'a', nombres: 'Ana', apellidos: 'Zuluaga' }),
      alumno({ id: 'c', nombres: 'ana', apellidos: 'Ríos' }),
    ];
    expect(ids(ordenarAlumnosDirectorio(items, 'nombre' satisfies OrdenDirectorio, AHORA))).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it(`sin_entrenar: última sesión asc; los que nunca entrenaron van primero; id asc desempata`, () => {
    const items = [
      alumno({ id: 'c', ultimaSesionFecha: isoHace(1) }),
      alumno({ id: 'a', ultimaSesionFecha: null }),
      alumno({ id: 'b', ultimaSesionFecha: null }),
      alumno({ id: 'd', ultimaSesionFecha: isoHace(5) }),
    ];
    expect(
      ids(ordenarAlumnosDirectorio(items, 'sin_entrenar' satisfies OrdenDirectorio, AHORA)),
    ).toEqual(['a', 'b', 'd', 'c']);
  });

  it(`mayor_racha: racha efectiva desc; la vencida vale 0; desempata por nombre e id`, () => {
    const hoy = fechaLocal(AHORA);
    const ayer = fechaLocal(mediodia(2026, 10, 18));
    const items = [
      alumno({ id: 'vencida', nombres: 'Zora', rachaDias: 30, rachaUltimaFecha: '2026-10-10' }),
      alumno({ id: 'b', nombres: 'Bruno', rachaDias: 2, rachaUltimaFecha: ayer }),
      alumno({ id: 'a', nombres: 'Ana', rachaDias: 5, rachaUltimaFecha: hoy }),
      alumno({ id: 'c', nombres: 'Ana', rachaDias: 5, rachaUltimaFecha: hoy }),
    ];
    expect(
      ids(ordenarAlumnosDirectorio(items, 'mayor_racha' satisfies OrdenDirectorio, AHORA)),
    ).toEqual(['a', 'c', 'b', 'vencida']);
  });

  it('es pura: no muta el arreglo de entrada', () => {
    const items = [
      alumno({ id: 'b', createdAtUtc: isoMediodia(2026, 10, 1) }),
      alumno({ id: 'a', createdAtUtc: isoMediodia(2026, 10, 5) }),
    ];
    const antes = items.map((i) => ({ ...i }));
    ordenarAlumnosDirectorio(items, 'alta_reciente' satisfies OrdenDirectorio, AHORA);
    expect(items).toEqual(antes);
  });
});
