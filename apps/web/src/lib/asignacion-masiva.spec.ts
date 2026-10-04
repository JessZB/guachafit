import { describe, expect, it } from 'vitest';
import { ModoAsignacionPlantilla } from '@guachafit/shared';
import {
  LIMITE_PAGINA_ALUMNOS_ASIGNACION,
  MAX_ALUMNOS_ASIGNACION,
  MENSAJE_ASIGNACION_INCIERTA,
  alternarSeleccionAlumno,
  combinarPaginasAlumnos,
  construirUrlAlumnosAsignacion,
  describirResultadosAsignacion,
  esFalloAmbiguoAsignacion,
  hayMasAlumnos,
  mensajeListaVaciaAlumnos,
  requiereConfirmacionReintento,
  resolverClaveAsignacion,
  textoConfirmacionReemplazo,
} from './asignacion-masiva';
import { ApiError, ErrorDeConexion } from './api-client';
import { MENSAJE_ERROR_GENERICO } from './mensajes-error';

describe('asignacion-masiva: selección de alumnos (A6)', () => {
  it('agrega y quita alumnos de la selección', () => {
    const conUno = alternarSeleccionAlumno([], 'a');
    expect(conUno).toEqual({ seleccion: ['a'], limiteAlcanzado: false });
    expect(alternarSeleccionAlumno(conUno.seleccion, 'a')).toEqual({
      seleccion: [],
      limiteAlcanzado: false,
    });
  });

  it('no permite pasar de 50 alumnos (límite del contrato)', () => {
    expect(MAX_ALUMNOS_ASIGNACION).toBe(50);
    const llena = Array.from({ length: 50 }, (_, i) => `al-${i}`);
    const intento = alternarSeleccionAlumno(llena, 'otro');
    expect(intento.limiteAlcanzado).toBe(true);
    expect(intento.seleccion).toHaveLength(50);
    expect(intento.seleccion).not.toContain('otro');
    // Quitar sigue funcionando con la selección llena.
    expect(alternarSeleccionAlumno(llena, 'al-0').seleccion).toHaveLength(49);
  });
});

describe('asignacion-masiva: confirmación de reemplazo', () => {
  it('nombra al alumno cuando es uno y cuenta cuando son varios', () => {
    expect(textoConfirmacionReemplazo(1, 'Ana Pérez')).toBe(
      'Vas a reemplazar la rutina actual de Ana Pérez. ¿Continuar?'
    );
    expect(textoConfirmacionReemplazo(3)).toBe(
      'Vas a reemplazar la rutina actual de 3 alumnos. ¿Continuar?'
    );
  });
});

describe('asignacion-masiva: resultado por alumno con mensajes humanos', () => {
  it('usa el nombre del alumno y traduce los errores técnicos de la API', () => {
    const filas = describirResultadosAsignacion(
      [
        { alumnoId: 'p1', usuarioId: 'u1', exito: true, rutinaNombre: 'Fuerza base' },
        { alumnoId: 'p2', exito: false, error: "Alumno con ID 'p2' no encontrado." },
        { alumnoId: 'p3', exito: false, error: 'El alumno está archivado y no puede recibir rutinas.' },
        { alumnoId: 'p4', exito: false, error: null },
      ],
      { p1: 'Ana Pérez', p2: 'Luis Gómez', p3: 'Mar Ruiz' }
    );

    expect(filas).toEqual([
      { alumnoId: 'p1', nombre: 'Ana Pérez', exito: true, mensaje: 'Rutina asignada: «Fuerza base»' },
      { alumnoId: 'p2', nombre: 'Luis Gómez', exito: false, mensaje: MENSAJE_ERROR_GENERICO },
      {
        alumnoId: 'p3',
        nombre: 'Mar Ruiz',
        exito: false,
        mensaje: 'El alumno está archivado y no puede recibir rutinas.',
      },
      { alumnoId: 'p4', nombre: 'Alumno', exito: false, mensaje: MENSAJE_ERROR_GENERICO },
    ]);
  });
});

describe('asignacion-masiva: búsqueda y paginación en el servidor', () => {
  it('arma la URL con limit/offset y agrega q solo si hay término', () => {
    expect(LIMITE_PAGINA_ALUMNOS_ASIGNACION).toBe(100);
    expect(construirUrlAlumnosAsignacion('', 0)).toBe('/alumnos?limit=100&offset=0');
    expect(construirUrlAlumnosAsignacion('   ', 100)).toBe('/alumnos?limit=100&offset=100');
    expect(construirUrlAlumnosAsignacion(' Ana Pérez ', 0)).toBe(
      '/alumnos?limit=100&offset=0&q=Ana+P%C3%A9rez'
    );
    expect(construirUrlAlumnosAsignacion('50%_a&b', 200)).toBe(
      '/alumnos?limit=100&offset=200&q=50%25_a%26b'
    );
  });

  it('combina páginas sin duplicar alumnos y respeta el orden de llegada', () => {
    const previos = [{ id: 'a' }, { id: 'b' }];
    expect(combinarPaginasAlumnos(previos, [{ id: 'b' }, { id: 'c' }])).toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);
    expect(combinarPaginasAlumnos([], [])).toEqual([]);
  });

  it('decide si hay más alumnos por total o, sin total, por página llena', () => {
    expect(hayMasAlumnos({ cargados: 100, total: 250, tamanoUltimaPagina: 100 })).toBe(true);
    expect(hayMasAlumnos({ cargados: 250, total: 250, tamanoUltimaPagina: 50 })).toBe(false);
    expect(hayMasAlumnos({ cargados: 100, total: undefined, tamanoUltimaPagina: 100 })).toBe(true);
    expect(hayMasAlumnos({ cargados: 140, total: undefined, tamanoUltimaPagina: 40 })).toBe(false);
  });

  it('distingue "sin alumnos" de "sin coincidencias"', () => {
    expect(mensajeListaVaciaAlumnos('')).toBe('Todavía no tienes alumnos.');
    expect(mensajeListaVaciaAlumnos('  ')).toBe('Todavía no tienes alumnos.');
    expect(mensajeListaVaciaAlumnos('zz')).toBe('Ningún alumno coincide con la búsqueda.');
  });
});

describe('asignacion-masiva: reintento tras un fallo ambiguo (clave de idempotencia + confirmación en modo Añadir)', () => {
  const problema = { type: 'about:blank', title: 'Error', status: 500, detail: 'x' } as any;

  it('trata como ambiguo el fallo de red, el timeout/cancelación y los 5xx', () => {
    expect(esFalloAmbiguoAsignacion(new ErrorDeConexion())).toBe(true);
    expect(esFalloAmbiguoAsignacion(new TypeError('Failed to fetch'))).toBe(true);
    expect(esFalloAmbiguoAsignacion(new DOMException('t', 'TimeoutError'))).toBe(true);
    expect(esFalloAmbiguoAsignacion(new DOMException('a', 'AbortError'))).toBe(true);
    expect(esFalloAmbiguoAsignacion(new ApiError(500, problema))).toBe(true);
    expect(esFalloAmbiguoAsignacion(new ApiError(504, problema))).toBe(true);
    expect(esFalloAmbiguoAsignacion(new ApiError(408, problema))).toBe(true);
  });

  it('no trata como ambiguo un rechazo claro del servidor (4xx)', () => {
    expect(esFalloAmbiguoAsignacion(new ApiError(400, problema))).toBe(false);
    expect(esFalloAmbiguoAsignacion(new ApiError(403, problema))).toBe(false);
    expect(esFalloAmbiguoAsignacion(new ApiError(404, problema))).toBe(false);
  });

  it('tras un fallo ambiguo no promete que el reintento sea seguro: pide revisar la rutina', () => {
    expect(MENSAJE_ASIGNACION_INCIERTA).toBe(
      'No pudimos confirmar la asignación. Si eliges «Añadir», revisa antes la rutina de tus alumnos para no duplicar días.'
    );
    expect(MENSAJE_ASIGNACION_INCIERTA).not.toMatch(/no se repetirá/);
  });

  it('pide confirmación antes de reintentar en modo Añadir solo tras un fallo ambiguo', () => {
    // La clave de idempotencia protege el caso común, pero el registro del servidor vive en
    // memoria (se pierde al reiniciar y no se comparte entre réplicas): no basta como garantía.
    expect(requiereConfirmacionReintento(true, ModoAsignacionPlantilla.FUSIONAR)).toBe(true);
    expect(requiereConfirmacionReintento(false, ModoAsignacionPlantilla.FUSIONAR)).toBe(false);
  });

  it('en modo Reemplazar no pide una confirmación extra tras un fallo ambiguo', () => {
    // Reemplazar ya tiene su propia confirmación y repetirlo deja el mismo resultado.
    expect(requiereConfirmacionReintento(true, ModoAsignacionPlantilla.REEMPLAZAR)).toBe(false);
    expect(requiereConfirmacionReintento(false, ModoAsignacionPlantilla.REEMPLAZAR)).toBe(false);
  });
});

describe('asignacion-masiva: clave de idempotencia por intento', () => {
  let contador = 0;
  const generar = () => `clave-${++contador}`;

  it('el primer intento genera una clave nueva', () => {
    contador = 0;
    const intento = resolverClaveAsignacion(null, ['a', 'b'], ModoAsignacionPlantilla.FUSIONAR, generar);
    expect(intento.clave).toBe('clave-1');
  });

  it('el reintento de la misma selección y modo reutiliza la clave', () => {
    contador = 0;
    const primero = resolverClaveAsignacion(null, ['a', 'b'], ModoAsignacionPlantilla.FUSIONAR, generar);
    const reintento = resolverClaveAsignacion(primero, ['a', 'b'], ModoAsignacionPlantilla.FUSIONAR, generar);
    expect(reintento).toEqual(primero);
  });

  it('otra selección u otro modo es otra asignación: clave nueva', () => {
    contador = 0;
    const primero = resolverClaveAsignacion(null, ['a', 'b'], ModoAsignacionPlantilla.FUSIONAR, generar);
    expect(
      resolverClaveAsignacion(primero, ['a'], ModoAsignacionPlantilla.FUSIONAR, generar).clave
    ).toBe('clave-2');
    expect(
      resolverClaveAsignacion(primero, ['a', 'b'], ModoAsignacionPlantilla.REEMPLAZAR, generar).clave
    ).toBe('clave-3');
  });
});
