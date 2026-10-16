/**
 * Lote E7 · contrato C2 (fase roja): estado de edición de la sesión en curso.
 *
 * El módulo `./sesion-estado` todavía no existe: este archivo debe fallar al resolver el
 * import. Cuando exista, cada caso describe el contrato exacto:
 *
 * - C2.1: `clonarSesionParaEdicion` devuelve una copia en la que `ejercicios`, cada ejercicio,
 *   cada `series` y cada serie son objetos NUEVOS. Los handlers de `EntrenamientoPage`
 *   (`handleToggleSet`, `handleUpdateSerieValue`, `handleStepSerieValue`) mutan la serie del
 *   estado anterior con un spread superficial; esta copia es la base del arreglo.
 * - C2.2–C2.4: clave y persistencia del ejercicio preferido del modo foco ("Hacer ahora") en
 *   `sessionStorage`, tolerante a almacenes ausentes o que lancen (sin propagar el error).
 */
import { describe, expect, it, vi } from 'vitest';
import { EstadoSesion, type SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import {
  claveEjercicioPreferido,
  clonarSesionParaEdicion,
  guardarEjercicioPreferido,
  leerEjercicioPreferido,
  recalcularCumplimiento,
} from './sesion-estado';
import { estimarCumpleRachaPorVolumen } from './racha';

/** Sesión EN_PROGRESO de 2 ejercicios (2 y 1 series) con valores anidados que se mutarán. */
function crearSesion(): SesionEntrenamientoDetalleDTO {
  return {
    id: 'sesion-1',
    alumnoId: 'alumno-1',
    bloqueId: 'bloque-1',
    fechaProgramada: '2026-10-12',
    timezoneCliente: 'America/Caracas',
    estado: EstadoSesion.EN_PROGRESO,
    porcentajeCumplimiento: '0.00',
    ejercicios: [
      {
        id: 'es-1',
        sesionId: 'sesion-1',
        ejercicioId: 'ej-1',
        orden: 1,
        ejercicio: {
          id: 'ej-1',
          nombre: 'Sentadilla',
          grupoMuscular: 'Piernas',
          activo: true,
          createdAtUtc: '2026-10-01T00:00:00.000Z',
        },
        series: [
          {
            id: 's-1',
            ejercicioSesionId: 'es-1',
            numeroSerie: 1,
            repsObjetivo: 10,
            repsLogradas: null,
            pesoKg: null,
            pesoPrescritoKg: '60.00',
            rpe: null,
            descansoSegundos: 90,
            completada: false,
          },
          {
            id: 's-2',
            ejercicioSesionId: 'es-1',
            numeroSerie: 2,
            repsObjetivo: 10,
            repsLogradas: null,
            pesoKg: null,
            pesoPrescritoKg: '60.00',
            rpe: null,
            descansoSegundos: 90,
            completada: false,
          },
        ],
      },
      {
        id: 'es-2',
        sesionId: 'sesion-1',
        ejercicioId: 'ej-2',
        orden: 2,
        ejercicio: {
          id: 'ej-2',
          nombre: 'Press de banca',
          grupoMuscular: 'Pecho',
          activo: true,
          createdAtUtc: '2026-10-01T00:00:00.000Z',
        },
        series: [
          {
            id: 's-3',
            ejercicioSesionId: 'es-2',
            numeroSerie: 1,
            repsObjetivo: 8,
            repsLogradas: null,
            pesoKg: null,
            pesoPrescritoKg: '40.00',
            rpe: null,
            descansoSegundos: 120,
            completada: false,
          },
        ],
      },
    ],
    createdAtUtc: '2026-10-01T00:00:00.000Z',
    updatedAtUtc: '2026-10-01T00:00:00.000Z',
  };
}

describe('C2.1 · clonarSesionParaEdicion: copia profunda del estado de la sesión', () => {
  it('crea objetos nuevos en todos los niveles y con los mismos valores', () => {
    const original = crearSesion();
    const copia = clonarSesionParaEdicion(original);

    expect(copia).not.toBe(original);
    expect(copia.ejercicios).not.toBe(original.ejercicios);
    expect(copia.ejercicios[0]).not.toBe(original.ejercicios[0]);
    expect(copia.ejercicios[0].series).not.toBe(original.ejercicios[0].series);
    expect(copia.ejercicios[0].series[0]).not.toBe(original.ejercicios[0].series[0]);
    expect(copia).toEqual(original);
  });

  it('mutar la copia no altera el original (completada, peso y reps)', () => {
    const original = crearSesion();
    const copia = clonarSesionParaEdicion(original);

    copia.ejercicios[0].series[0].completada = true;
    copia.ejercicios[0].series[0].pesoKg = '60.00';
    copia.ejercicios[1].series[0].repsLogradas = 12;

    expect(original.ejercicios[0].series[0].completada).toBe(false);
    expect(original.ejercicios[0].series[0].pesoKg).toBeNull();
    expect(original.ejercicios[1].series[0].repsLogradas).toBeNull();
  });
});

describe('C2.2 · claveEjercicioPreferido: clave del foco preferido por sesión', () => {
  it('compone el prefijo con el id de la sesión', () => {
    expect(claveEjercicioPreferido('sesion-1')).toBe('guachafit_foco_preferido_sesion-1');
    expect(claveEjercicioPreferido('otra-sesion')).toBe('guachafit_foco_preferido_otra-sesion');
  });
});

describe('C2.3 · leerEjercicioPreferido: entero guardado o null', () => {
  it('devuelve el entero guardado (incluido 0)', () => {
    expect(leerEjercicioPreferido({ getItem: () => '2' }, 'sesion-1')).toBe(2);
    expect(leerEjercicioPreferido({ getItem: () => '0' }, 'sesion-1')).toBe(0);
  });

  it.each([null, '', 'abc', '1.5', '-1', '2x'])(
    'devuelve null con el valor %o',
    (valor) => {
      expect(leerEjercicioPreferido({ getItem: () => valor }, 'sesion-1')).toBeNull();
    }
  );

  it('devuelve null si el almacén es null', () => {
    expect(leerEjercicioPreferido(null, 'sesion-1')).toBeNull();
  });

  it('devuelve null (sin propagar) si getItem lanza', () => {
    const almacen = {
      getItem: () => {
        throw new Error('almacenamiento bloqueado');
      },
    };
    expect(leerEjercicioPreferido(almacen, 'sesion-1')).toBeNull();
  });
});

describe('C2.4 · guardarEjercicioPreferido: persistir o limpiar el preferido', () => {
  it('con un número llama a setItem con la clave y el índice en texto', () => {
    const almacen = { setItem: vi.fn(), removeItem: vi.fn() };

    guardarEjercicioPreferido(almacen, 'sesion-1', 2);

    expect(almacen.setItem).toHaveBeenCalledWith('guachafit_foco_preferido_sesion-1', '2');
    expect(almacen.removeItem).not.toHaveBeenCalled();
  });

  it('con null llama a removeItem y no escribe', () => {
    const almacen = { setItem: vi.fn(), removeItem: vi.fn() };

    guardarEjercicioPreferido(almacen, 'sesion-1', null);

    expect(almacen.removeItem).toHaveBeenCalledWith('guachafit_foco_preferido_sesion-1');
    expect(almacen.setItem).not.toHaveBeenCalled();
  });

  it('con almacén null no hace nada y no lanza', () => {
    expect(() => guardarEjercicioPreferido(null, 'sesion-1', 2)).not.toThrow();
    expect(() => guardarEjercicioPreferido(null, 'sesion-1', null)).not.toThrow();
  });

  it('si el almacén lanza, no propaga el error', () => {
    const almacen = {
      setItem: () => {
        throw new Error('cuota llena');
      },
      removeItem: () => {
        throw new Error('cuota llena');
      },
    };

    expect(() => guardarEjercicioPreferido(almacen, 'sesion-1', 1)).not.toThrow();
    expect(() => guardarEjercicioPreferido(almacen, 'sesion-1', null)).not.toThrow();
  });
});

describe('U9 · recalcularCumplimiento: % y racha desde las series actuales', () => {
  /** 4 series con prescripción de 60 kg × 10 reps; `completadas` = índices a marcar. */
  function sesionCon(completadas: number[]): SesionEntrenamientoDetalleDTO {
    return {
      id: 'sesion-1',
      alumnoId: 'alumno-1',
      bloqueId: 'bloque-1',
      fechaProgramada: '2026-10-12',
      timezoneCliente: 'America/Caracas',
      estado: EstadoSesion.EN_PROGRESO,
      porcentajeCumplimiento: '0.00',
      ejercicios: [
        {
          id: 'es-1',
          sesionId: 'sesion-1',
          ejercicioId: 'ej-1',
          orden: 1,
          ejercicio: {
            id: 'ej-1',
            nombre: 'Sentadilla',
            grupoMuscular: 'Piernas',
            activo: true,
            createdAtUtc: '2026-10-01T00:00:00.000Z',
          },
          series: [1, 2, 3, 4].map((n) => ({
            id: `s-${n}`,
            ejercicioSesionId: 'es-1',
            numeroSerie: n,
            repsObjetivo: 10,
            repsLogradas: completadas.includes(n) ? 10 : null,
            pesoKg: completadas.includes(n) ? '60.00' : null,
            pesoPrescritoKg: '60.00',
            rpe: null,
            descansoSegundos: 90,
            completada: completadas.includes(n),
            ...(completadas.includes(n)
              ? { timestampCompletadaUtc: '2026-10-12T10:00:00.000Z' }
              : {}),
          })),
        },
      ],
      createdAtUtc: '2026-10-01T00:00:00.000Z',
      updatedAtUtc: '2026-10-01T00:00:00.000Z',
    };
  }

  it('U9 · 0 de 0 → 0.00 y 1 de 4 → 25.00', () => {
    const vacia = { ...sesionCon([]), ejercicios: [] };
    expect(recalcularCumplimiento(vacia).porcentajeCumplimiento).toBe('0.00');
    expect(recalcularCumplimiento(sesionCon([1])).porcentajeCumplimiento).toBe('25.00');
  });

  it('U9 · la racha coincide con estimarCumpleRachaPorVolumen de las mismas series', () => {
    for (const completadas of [[], [1], [1, 2, 3], [1, 2, 3, 4]] as number[][]) {
      const sesion = sesionCon(completadas);
      const series = sesion.ejercicios.flatMap((e) => e.series);
      expect(recalcularCumplimiento(sesion).cumpleReglaRacha).toBe(
        estimarCumpleRachaPorVolumen(series)
      );
    }
  });
});
