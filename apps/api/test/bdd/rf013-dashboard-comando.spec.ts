import { describe, it, expect, vi } from 'vitest';
import { EntrenadorService } from '../../src/modules/entrenador/entrenador.service';
import {
  EstadoAlumno,
  EstadoCuota,
} from '@guachafit/shared';
import { getTableName } from '@guachafit/database';

type RespuestaTabla = any[] | ((n: number) => any[]);

/**
 * Mock de Drizzle basado en el nombre de tabla, con contador de invocaciones por tabla
 * para distinguir consultas sucesivas sobre la misma entidad.
 */
function crearMockDb(respuestas: Record<string, RespuestaTabla>) {
  const contadores: Record<string, number> = {};
  const db: any = {
    select: vi.fn(() => ({
      from: vi.fn((table: any) => {
        const nombre = table ? getTableName(table) : '';
        contadores[nombre] = (contadores[nombre] ?? 0) + 1;
        const definicion = respuestas[nombre];
        const data =
          typeof definicion === 'function' ? definicion(contadores[nombre]) : definicion ?? [];

        const queryObj: any = {
          where: vi.fn(() => queryObj),
          orderBy: vi.fn(() => Promise.resolve(data)),
          limit: vi.fn(() => Promise.resolve(data)),
          then: (resolve: any) => resolve(data),
        };
        return queryObj;
      }),
    })),
  };
  return { db, contadores };
}

/**
 * RNF-003/ADR-009: passthrough del envoltorio transaccional RLS para el mock in-memory.
 * Permite verificar que las consultas a tablas con RLS (`rutinas`) pasan por withTenant.
 */
function crearWithTenantMock(db: any) {
  return vi.fn(async (_ctx: any, fn: any) => fn(db));
}

const DIA_MS = 24 * 60 * 60 * 1000;

function crearPerfilAlumno(
  id: string,
  usuarioId: string,
  opciones: Partial<any> = {}
): any {
  return {
    id,
    usuarioId,
    nombres: 'Carlos',
    apellidos: 'Mendoza',
    estadoActivacion: EstadoAlumno.ACTIVO,
    createdAtUtc: new Date(Date.now() - 10 * DIA_MS),
    ...opciones,
  };
}

/** Rutina con N bloques de día sugerido 1 (Lunes): siempre cuentan como prescritos en la semana. */
function crearRutina(alumnoId: string, cantidadBloques = 1): any {
  return {
    id: `rutina-${alumnoId}`,
    alumnoId,
    entrenadorId: 'coach-uuid-1',
    nombre: 'Plan',
    activa: true,
    bloques: Array.from({ length: cantidadBloques }, (_, idx) => ({
      diaId: `dia-1-${idx}`,
      titulo: `Día 1`,
      diaSugerido: 1,
      ejercicios: [{ nombre: 'Sentadilla', series: 3, reps: '10', peso: '50.00' }],
    })),
    createdAtUtc: new Date(),
  };
}

describe('RF-013: Dashboard de Comando del Entrenador y Métricas de Capacidad', () => {
  const coachId = 'coach-uuid-1';

  it('debe calcular KPIs macro con adherencia RN-03 y separar riesgos deportivo/financiero', async () => {
    const { db } = crearMockDb({
      perfiles_entrenador: [{ capacidadMaxima: 50 }],
      perfiles_alumno: [
        crearPerfilAlumno('alumno-1', 'user-alumno-1', {
          nombres: 'Carlos',
          apellidos: 'Mendoza',
          createdAtUtc: new Date(Date.now() - 10 * DIA_MS),
        }),
        crearPerfilAlumno('alumno-2', 'user-alumno-2', {
          nombres: 'Mariana',
          apellidos: 'Gómez',
          createdAtUtc: new Date(Date.now() - 5 * DIA_MS),
        }),
      ],
      // 1ra consulta: pagos aprobados / 2da: pagos por conciliar
      transacciones_pago: (n) =>
        n === 1
          ? [{ montoEquivalenteUsd: '35.00' }, { montoEquivalenteUsd: '40.00' }]
          : [{ id: 'tx-1' }],
      // 1ra consulta: cuotas del periodo / 2da: cuotas en mora
      cuotas_membresia: (n) =>
        n === 1
          ? [{ montoTotalUsd: '35.00' }, { montoTotalUsd: '40.00' }, { montoTotalUsd: '25.00' }]
          : [
              {
                id: 'cuota-mora-1',
                clienteId: 'user-alumno-1',
                saldoPendienteUsd: '35.00',
                fechaCorteUtc: new Date(Date.now() - 3 * DIA_MS),
                estado: EstadoCuota.VENCIDA,
              },
            ],
      // Dos bloques prescritos ya debidos (Lunes) en una sola rutina => 2 sesiones prescritas.
      // 1ra consulta de sesiones: completadas de la semana / 2da: historial completado.
      rutinas: [crearRutina('user-alumno-1', 2)],
      sesiones_entrenamiento: (n) =>
        n === 1
          ? [{ alumnoId: 'user-alumno-1' }]
          : [
              {
                alumnoId: 'user-alumno-2',
                fechaProgramada: new Date(Date.now() - 6 * DIA_MS).toISOString().split('T')[0],
                fechaFinUtc: new Date(Date.now() - 6 * DIA_MS),
              },
            ],
      controles_antropometricos: [{ id: 'checkin-1' }],
    });

    const withTenantMock = crearWithTenantMock(db);
    const entrenadorService = new EntrenadorService(db, withTenantMock);
    const resultado = await entrenadorService.obtenerDashboardComando(coachId);

    // RNF-003/ADR-009: la lectura de rutinas del dashboard corre con el GUC del coach.
    expect(withTenantMock).toHaveBeenCalledWith(
      expect.objectContaining({ entrenadorId: coachId }),
      expect.any(Function)
    );

    // Verificaciones de KPIs Macro
    expect(resultado.kpisMacro.alumnosActivos).toBe(2);
    expect(resultado.kpisMacro.capacidadMaxima).toBe(50);
    expect(resultado.kpisMacro.porcentajeOcupacion).toBe('4.00'); // 2/50 * 100
    expect(resultado.kpisMacro.cobranzaMesUsd).toBe('75.00'); // 35 + 40
    expect(resultado.kpisMacro.metaCobranzaMesUsd).toBe('100.00'); // 35 + 40 + 25
    expect(resultado.kpisMacro.porcentajeCobranza).toBe('75.00'); // 75/100 * 100

    // Adherencia RN-03: 1 completada / 2 prescritas del alumno con plan activo
    expect(resultado.kpisMacro.tasaAdherenciaSemanal).toBe('50.00');

    // Riesgos separados: ambos alumnos inactivos (>= 4 días) y sólo uno en mora
    expect(resultado.kpisMacro.alumnosEnRiesgoDeportivo).toBe(2);
    expect(resultado.kpisMacro.alumnosEnMoraFinanciera).toBe(1);
    expect(resultado.kpisMacro.alumnosEnRiesgo).toBe(2); // unión legacy

    // Verificaciones de Bandejas Rápidas
    expect(resultado.bandejasRapidas.pagosPorConciliar).toBe(1);
    expect(resultado.bandejasRapidas.checkinsAntropometricosPendientes).toBe(1);
    expect(resultado.bandejasRapidas.alumnosEnMora.length).toBe(1);
    expect(resultado.bandejasRapidas.alumnosEnMora[0].nombre).toBe('Carlos Mendoza');
    expect(resultado.bandejasRapidas.alumnosEnMora[0].saldoPendienteUsd).toBe('35.00');
    expect(resultado.bandejasRapidas.alumnosEnMora[0].diasVencido).toBe(3);
    expect(resultado.bandejasRapidas.alumnosInactivosEntrenamiento.length).toBe(2);
  });

  it('devuelve tasaAdherenciaSemanal = null cuando no hay datos evaluables (sin fallback 85.00)', async () => {
    const { db } = crearMockDb({
      perfiles_entrenador: [{ capacidadMaxima: 50 }],
      perfiles_alumno: [
        crearPerfilAlumno('alumno-1', 'user-alumno-1', {
          createdAtUtc: new Date(Date.now() - DIA_MS),
        }),
      ],
      transacciones_pago: [],
      cuotas_membresia: [],
      rutinas: [],
      sesiones_entrenamiento: [],
      controles_antropometricos: [],
    });

    const withTenantMock = crearWithTenantMock(db);
    const entrenadorService = new EntrenadorService(db, withTenantMock);
    const resultado = await entrenadorService.obtenerDashboardComando(coachId);

    expect(resultado.kpisMacro.tasaAdherenciaSemanal).toBeNull();
    expect(resultado.kpisMacro.alumnosEnMoraFinanciera).toBe(0);
  });

  it('un alumno sólo en mora financiera (sin inactividad ni mal adherencia) no cuenta como riesgo deportivo', async () => {
    const ahora = new Date();

    const { db } = crearMockDb({
      perfiles_entrenador: [{ capacidadMaxima: 50 }],
      perfiles_alumno: [
        crearPerfilAlumno('alumno-1', 'user-alumno-1', {
          createdAtUtc: new Date(Date.now() - 10 * DIA_MS),
        }),
      ],
      transacciones_pago: [],
      cuotas_membresia: (n) =>
        n === 1
          ? []
          : [
              {
                id: 'cuota-mora-1',
                clienteId: 'user-alumno-1',
                saldoPendienteUsd: '35.00',
                fechaCorteUtc: new Date(Date.now() - 3 * DIA_MS),
                estado: EstadoCuota.VENCIDA,
              },
            ],
      rutinas: [crearRutina('user-alumno-1')],
      sesiones_entrenamiento: (n) =>
        n === 1
          ? [{ alumnoId: 'user-alumno-1' }]
          : [
              {
                alumnoId: 'user-alumno-1',
                fechaProgramada: ahora.toISOString().split('T')[0],
                fechaFinUtc: ahora,
              },
            ],
      controles_antropometricos: [],
    });

    const withTenantMock = crearWithTenantMock(db);
    const entrenadorService = new EntrenadorService(db, withTenantMock);
    const resultado = await entrenadorService.obtenerDashboardComando(coachId);

    expect(resultado.kpisMacro.tasaAdherenciaSemanal).toBe('100.00');
    expect(resultado.kpisMacro.alumnosEnRiesgoDeportivo).toBe(0);
    expect(resultado.kpisMacro.alumnosEnMoraFinanciera).toBe(1);
    expect(resultado.kpisMacro.alumnosEnRiesgo).toBe(1);
  });
});
