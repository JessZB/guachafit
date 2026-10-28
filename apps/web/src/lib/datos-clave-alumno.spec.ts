import { describe, expect, it } from 'vitest';
import { EstadoSesion } from '@guachafit/shared';
import type {
  ResumenFinancieroAlumnoDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { datosClaveAlumno } from './datos-clave-alumno';
import type { ControlAntroFila } from './alumno-detalle-controles';
import { formatFechaLocal } from './date-format';

/**
 * 07 · Ficha del alumno (L7 · cabecera) · tests del helper puro (en verde).
 *
 * Contrato L7.7: `datosClaveAlumno({ finanzas, ultimaSesion, controles, ahora })`
 * devuelve los cuatro datos ya formateados (`saldo`, `proximaCuota`, `ultimoEntreno`,
 * `peso`).
 *
 * Campos reales usados (no inventados):
 * - `ResumenFinancieroAlumnoDTO.saldoPendienteTotalUsd` y
 *   `cuotaMesActual.fechaVencimiento` (`packages/shared/src/types/finanzas.ts`);
 * - `SesionEntrenamientoDetalleDTO.fechaFinUtc` (`packages/shared/src/types/entrenamiento.ts`);
 * - `ControlAntroFila.pesoKg` (`apps/web/src/lib/alumno-detalle-controles.ts`).
 */

const AHORA = new Date('2026-10-28T12:00:00-04:00');

function resumenBase(
  parcial: Partial<ResumenFinancieroAlumnoDTO> = {},
): ResumenFinancieroAlumnoDTO {
  return {
    alumnoId: 'c1111111-1111-4111-8111-111111111111',
    usuarioId: 'u1111111-1111-4111-8111-111111111111',
    saldoPendienteTotalUsd: '0.00',
    saldoAFavorUsd: '0.00',
    totalPagadoHistoricoUsd: '0.00',
    totalPagadoMesActualUsd: '0.00',
    cuotaMesActual: null,
    transaccionesTotal: 0,
    transacciones: [],
    ...parcial,
  };
}

function sesionBase(
  parcial: Partial<SesionEntrenamientoDetalleDTO> = {},
): SesionEntrenamientoDetalleDTO {
  return {
    id: 's1111111-1111-4111-8111-111111111111',
    alumnoId: 'c1111111-1111-4111-8111-111111111111',
    fechaProgramada: '2026-10-28',
    fechaInicioUtc: '2026-10-28T09:30:00-04:00',
    fechaFinUtc: '2026-10-28T10:45:00-04:00',
    timezoneCliente: 'America/Caracas',
    estado: EstadoSesion.COMPLETADA,
    porcentajeCumplimiento: '85.00',
    ejercicios: [],
    createdAtUtc: '2026-10-28T09:30:00.000Z',
    updatedAtUtc: '2026-10-28T10:45:00.000Z',
    ...parcial,
  };
}

function filaControl(parcial: Partial<ControlAntroFila> = {}): ControlAntroFila {
  return {
    id: 'antro-1',
    fecha: '2026-10-20',
    pesoKg: '78.50',
    grasaPorcentaje: null,
    cinturaCm: null,
    brazoCm: null,
    pechoCm: null,
    musloCm: null,
    ...parcial,
  };
}

function argsBase() {
  return {
    finanzas: resumenBase({ saldoPendienteTotalUsd: '125.50' }),
    ultimaSesion: sesionBase(),
    controles: [filaControl()],
    ahora: AHORA,
  };
}

describe('datosClaveAlumno · L7.7 saldo', () => {
  it('con saldo > 0 devuelve el importe en dos decimales con $', () => {
    expect(datosClaveAlumno(argsBase()).saldo).toBe('$125.50');
    expect(
      datosClaveAlumno({
        ...argsBase(),
        finanzas: resumenBase({ saldoPendienteTotalUsd: '40' }),
      }).saldo,
    ).toBe('$40.00');
  });

  it('con saldo 0 o negativo devuelve "Sin deuda"', () => {
    expect(
      datosClaveAlumno({
        ...argsBase(),
        finanzas: resumenBase({ saldoPendienteTotalUsd: '0.00' }),
      }).saldo,
    ).toBe('Sin deuda');
    expect(
      datosClaveAlumno({
        ...argsBase(),
        finanzas: resumenBase({ saldoPendienteTotalUsd: '-5.00' }),
      }).saldo,
    ).toBe('Sin deuda');
  });

  it('sin finanzas devuelve "—"', () => {
    expect(datosClaveAlumno({ ...argsBase(), finanzas: null }).saldo).toBe('—');
  });
});

describe('datosClaveAlumno · L7.7 próxima cuota', () => {
  it('con cuota vigente devuelve el vencimiento con el helper de calendario de la ficha', () => {
    const datos = datosClaveAlumno({
      ...argsBase(),
      finanzas: resumenBase({
        cuotaMesActual: {
          id: 'cuota-1',
          periodo: '2026-11',
          montoTotalUsd: '40.00',
          montoPagadoUsd: '0.00',
          saldoPendienteUsd: '40.00',
          estado: 'pendiente',
          fechaVencimiento: '2026-11-05T23:59:59.000Z',
        },
      }),
    });
    // La API entrega un timestamp ISO; el formato visible es el local de calendario.
    expect(datos.proximaCuota).toBe(formatFechaLocal('2026-11-05T23:59:59.000Z'));
  });

  it('con una fecha de vencimiento inválida devuelve "—"', () => {
    const datos = datosClaveAlumno({
      ...argsBase(),
      finanzas: resumenBase({
        cuotaMesActual: {
          id: 'cuota-1',
          periodo: '2026-11',
          montoTotalUsd: '40.00',
          montoPagadoUsd: '0.00',
          saldoPendienteUsd: '40.00',
          estado: 'pendiente',
          fechaVencimiento: 'fecha-invalida',
        },
      }),
    });
    expect(datos.proximaCuota).toBe('—');
  });

  it('sin cuota vigente o sin finanzas devuelve "—"', () => {
    expect(datosClaveAlumno(argsBase()).proximaCuota).toBe('—');
    expect(datosClaveAlumno({ ...argsBase(), finanzas: null }).proximaCuota).toBe('—');
  });
});

describe('datosClaveAlumno · L7.7 último entreno', () => {
  it('reutiliza describirUltimoEntreno con la fecha de fin de la última sesión', () => {
    expect(datosClaveAlumno(argsBase()).ultimoEntreno).toBe('Entrenó hoy');
  });

  it('sin sesión devuelve su texto para "nunca"', () => {
    expect(datosClaveAlumno({ ...argsBase(), ultimaSesion: null }).ultimoEntreno).toBe(
      'Sin entrenos registrados',
    );
  });

  it('una sesión EN_PROGRESO devuelve "Entrenamiento en curso"', () => {
    const datos = datosClaveAlumno({
      ...argsBase(),
      ultimaSesion: sesionBase({
        estado: EstadoSesion.EN_PROGRESO,
        fechaFinUtc: null,
      }),
    });
    expect(datos.ultimoEntreno).toBe('Entrenamiento en curso');
  });

  it('una COMPLETADA sin fechaFinUtc usa fechaInicioUtc', () => {
    const datos = datosClaveAlumno({
      ...argsBase(),
      ultimaSesion: sesionBase({
        estado: EstadoSesion.COMPLETADA,
        fechaFinUtc: null,
        fechaInicioUtc: '2026-10-28T09:30:00-04:00',
      }),
    });
    expect(datos.ultimoEntreno).toBe('Entrenó hoy');
  });
});

describe('datosClaveAlumno · L7.7 peso', () => {
  it('con controles devuelve el peso del más reciente con " kg"', () => {
    expect(datosClaveAlumno(argsBase()).peso).toBe('78.50 kg');
  });

  it('sin controles devuelve "—"', () => {
    expect(datosClaveAlumno({ ...argsBase(), controles: [] }).peso).toBe('—');
  });
});
