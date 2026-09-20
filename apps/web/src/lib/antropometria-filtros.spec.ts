import { describe, it, expect } from 'vitest';
import { Modalidad, OrigenAntropometria, EstadoMedicion, type ControlAntropometricoDetalleDTO } from '@guachafit/shared';
import {
  etiquetaAlumnoPendiente,
  filtrarPendientesAntropometria,
  hayBusquedaAntropometriaActiva,
} from './antropometria-filtros';

function pendiente(parcial: {
  alumnoId: string;
  alumnoNombre?: string | null;
}): ControlAntropometricoDetalleDTO {
  return {
    id: `ctrl-${parcial.alumnoId}`,
    alumnoId: parcial.alumnoId,
    alumnoNombre: parcial.alumnoNombre,
    fechaEvaluacion: '2026-09-18',
    pesoKg: '70.00',
    modalidad: Modalidad.REMOTO,
    origen: OrigenAntropometria.REMOTO_AUTOREPORTE,
    registradoPor: parcial.alumnoId,
    estado: EstadoMedicion.PENDIENTE_APROBACION,
    fotos: [],
    createdAtUtc: '2026-09-18T10:00:00.000Z',
    updatedAtUtc: '2026-09-18T10:00:00.000Z',
  };
}

const COLA = [
  pendiente({ alumnoId: 'a3333333-3333-4333-8333-333333333333', alumnoNombre: 'Laura Remota' }),
  pendiente({ alumnoId: 'a2222222-2222-4222-8222-222222222222', alumnoNombre: 'Carlos Presencial' }),
  pendiente({ alumnoId: 'b7777777-7777-4777-8777-777777777777', alumnoNombre: null }),
];

describe('etiquetaAlumnoPendiente (WU20)', () => {
  it('usa nombres + apellidos cuando el servidor los resolvió', () => {
    expect(etiquetaAlumnoPendiente(COLA[0])).toBe('Laura Remota');
  });

  it('cae al ID recortado cuando falta el nombre (nunca inventa un nombre)', () => {
    expect(etiquetaAlumnoPendiente(COLA[2])).toBe('ID Alumno: b7777777...');
    expect(etiquetaAlumnoPendiente(pendiente({ alumnoId: 'a1', alumnoNombre: '   ' }))).toBe(
      'ID Alumno: a1...'
    );
  });
});

describe('filtrarPendientesAntropometria (WU20)', () => {
  it('sin búsqueda devuelve una copia con el mismo orden', () => {
    const resultado = filtrarPendientesAntropometria(COLA);
    expect(resultado.map((p) => p.alumnoId)).toEqual(COLA.map((p) => p.alumnoId));
    expect(resultado).not.toBe(COLA);
  });

  it('busca por nombre sin distinguir mayúsculas ni acentos', () => {
    expect(
      filtrarPendientesAntropometria(COLA, 'laura').map((p) => p.alumnoNombre)
    ).toEqual(['Laura Remota']);
    expect(
      filtrarPendientesAntropometria(COLA, 'CARLOS').map((p) => p.alumnoNombre)
    ).toEqual(['Carlos Presencial']);
  });

  it('también encuentra por ID aunque el nombre falte (fallback visible)', () => {
    expect(filtrarPendientesAntropometria(COLA, 'b7777777').map((p) => p.alumnoId)).toEqual([
      'b7777777-7777-4777-8777-777777777777',
    ]);
  });

  it('sin coincidencias devuelve lista vacía', () => {
    expect(filtrarPendientesAntropometria(COLA, 'zzz')).toEqual([]);
  });
});

describe('hayBusquedaAntropometriaActiva (WU20)', () => {
  it('solo es true con texto con contenido', () => {
    expect(hayBusquedaAntropometriaActiva()).toBe(false);
    expect(hayBusquedaAntropometriaActiva('   ')).toBe(false);
    expect(hayBusquedaAntropometriaActiva('laura')).toBe(true);
  });
});
