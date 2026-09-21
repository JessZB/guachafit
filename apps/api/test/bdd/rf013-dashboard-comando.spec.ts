import { describe, it, expect, vi } from 'vitest';
import { EntrenadorService, calcularVentanaMesUtc } from '../../src/modules/entrenador/entrenador.service';
import {
  EstadoAlumno,
  EstadoCuota,
} from '@guachafit/shared';
import { getTableName } from '@guachafit/database';

type RespuestaTabla = any[] | ((n: number) => any[]);

/**
 * Mock de Drizzle basado en el nombre de tabla, con contador de invocaciones por tabla
 * para distinguir consultas sucesivas sobre la misma entidad. Los predicados de `where`
 * se capturan para poder auditar los filtros SQL (p. ej. la ventana del mes de cobranza).
 */
function crearMockDb(respuestas: Record<string, RespuestaTabla>) {
  const contadores: Record<string, number> = {};
  const predicados: any[] = [];
  const db: any = {
    select: vi.fn(() => ({
      from: vi.fn((table: any) => {
        const nombre = table ? getTableName(table) : '';
        contadores[nombre] = (contadores[nombre] ?? 0) + 1;
        const definicion = respuestas[nombre];
        const data =
          typeof definicion === 'function' ? definicion(contadores[nombre]) : definicion ?? [];

        const queryObj: any = {
          where: vi.fn((predicate: any) => {
            predicados.push(predicate);
            return queryObj;
          }),
          orderBy: vi.fn(() => Promise.resolve(data)),
          limit: vi.fn(() => Promise.resolve(data)),
          then: (resolve: any) => resolve(data),
        };
        return queryObj;
      }),
    })),
  };
  return { db, contadores, predicados };
}

/** Texto SQL de una expresión Drizzle (fragmentos de texto + nombres de columna). */
function textoDeExpresion(expr: any): string {
  if (!expr || typeof expr !== 'object' || !Array.isArray(expr.queryChunks)) return '';
  const partes: string[] = [];
  const visitar = (chunks: any[]) => {
    for (const c of chunks) {
      if (typeof c?.name === 'string') partes.push(c.name);
      if (Array.isArray(c?.value)) partes.push(c.value.join(' '));
      if (Array.isArray(c?.queryChunks)) visitar(c.queryChunks);
    }
  };
  visitar(expr.queryChunks);
  return partes.join(' ').toLowerCase();
}

/** Valores de los parámetros ligados a una expresión Drizzle (p. ej. las fechas de la ventana). */
function parametrosDeExpresion(expr: any): any[] {
  const valores: any[] = [];
  const visitar = (chunks: any[]) => {
    for (const c of chunks) {
      if (Array.isArray(c)) {
        visitar(c);
        continue;
      }
      // Los strings sueltos en un template `sql` se ligan como parámetros (no son texto SQL).
      if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') {
        valores.push(c);
        continue;
      }
      if (c instanceof Date) {
        // Drizzle embebe el valor crudo cuando el lado izquierdo es un fragmento SQL.
        valores.push(c);
      } else if (c && 'value' in c && !Array.isArray(c.value)) {
        valores.push(c.value);
      }
      if (Array.isArray(c?.queryChunks)) visitar(c.queryChunks);
    }
  };
  if (expr && Array.isArray(expr.queryChunks)) visitar(expr.queryChunks);
  return valores;
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

  it('"Cobros del Mes" suma solo pagos aprobados del mes en curso y filtra por la ventana UTC', async () => {
    // El mock no filtra SQL: el primer arreglo representa lo que la BD devolvería YA filtrado
    // (pagos aprobados del mes). El filtro real se audita inspeccionando el predicado capturado.
    const { db, predicados } = crearMockDb({
      perfiles_entrenador: [{ capacidadMaxima: 50 }],
      perfiles_alumno: [],
      transacciones_pago: (n) => (n === 1 ? [{ montoEquivalenteUsd: '35.00' }] : []),
      cuotas_membresia: [],
      rutinas: [],
      sesiones_entrenamiento: [],
      controles_antropometricos: [],
    });

    const withTenantMock = crearWithTenantMock(db);
    const entrenadorService = new EntrenadorService(db, withTenantMock);
    const resultado = await entrenadorService.obtenerDashboardComando(coachId);

    expect(resultado.kpisMacro.cobranzaMesUsd).toBe('35.00');

    const predicadoPagos = predicados.find((p) =>
      textoDeExpresion(p).includes('fecha_conciliacion_utc')
    );
    expect(predicadoPagos).toBeDefined();

    const texto = textoDeExpresion(predicadoPagos);
    // La fecha real de entrada del dinero manda; las filas legadas sin conciliación usan reporte.
    expect(texto).toContain('coalesce');
    expect(texto).toContain('fecha_reporte_utc');
    expect(texto).toContain('>=');
    expect(texto).toContain('<');

    // WU-I: los límites viajan como ISO string con cast `::timestamptz` (un Date crudo contra un
    // fragmento SQL revienta el driver postgres-js; verificado contra Postgres real).
    const { inicioMesUtc, inicioMesSiguienteUtc } = calcularVentanaMesUtc(new Date());
    const valores = parametrosDeExpresion(predicadoPagos).map((valor) => String(valor));
    expect(valores).toContain(inicioMesUtc.toISOString());
    expect(valores).toContain(inicioMesSiguienteUtc.toISOString());
  });

  describe('calcularVentanaMesUtc (ventana del mes calendario en UTC)', () => {
    it('delimita el mes UTC y conserva el formato YYYY-MM de `periodoActual`', () => {
      const ventana = calcularVentanaMesUtc(new Date('2026-09-20T22:30:00.000Z'));
      expect(ventana.periodoActual).toBe('2026-09');
      expect(ventana.inicioMesUtc.toISOString()).toBe('2026-09-01T00:00:00.000Z');
      expect(ventana.inicioMesSiguienteUtc.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    });

    it('cruza el cambio de año sin desfases', () => {
      const ventana = calcularVentanaMesUtc(new Date('2026-12-31T23:59:59.000Z'));
      expect(ventana.periodoActual).toBe('2026-12');
      expect(ventana.inicioMesUtc.toISOString()).toBe('2026-12-01T00:00:00.000Z');
      expect(ventana.inicioMesSiguienteUtc.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });
  });
});
