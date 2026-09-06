import { describe, it, expect, vi } from 'vitest';
import { EntrenadorService } from '../../src/modules/entrenador/entrenador.service';
import { AlumnosService } from '../../src/modules/alumnos/alumnos.service';
import { Rol, EstadoAlumno, EstadoConciliacion, EstadoCuota, EstadoMedicion, EstadoSesion } from '@guachafit/shared';

describe('RF-013: Dashboard de Comando del Entrenador y Métricas de Capacidad', () => {
  const coachId = 'coach-uuid-1';

  it('debe calcular correctamente los KPIs macro y estructurar las bandejas rápidas', async () => {
    const mockDb = {
      select: vi.fn(),
    } as any;

    // Configurar simulación de datos en cadena
    let callCount = 0;
    mockDb.select.mockImplementation(() => {
      callCount++;
      return {
        from: vi.fn().mockImplementation((table) => {
          return {
            where: vi.fn().mockImplementation(() => {
              // 1. Capacidad Máxima (perfilesEntrenador)
              if (callCount === 1) {
                return Promise.resolve([{ capacidadMaxima: 50 }]);
              }
              // 2. Alumnos (perfilesAlumno)
              if (callCount === 2) {
                return Promise.resolve([
                  {
                    id: 'alumno-1',
                    usuarioId: 'user-alumno-1',
                    nombres: 'Carlos',
                    apellidos: 'Mendoza',
                    estadoActivacion: EstadoAlumno.ACTIVO,
                    createdAtUtc: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
                  },
                  {
                    id: 'alumno-2',
                    usuarioId: 'user-alumno-2',
                    nombres: 'Mariana',
                    apellidos: 'Gómez',
                    estadoActivacion: EstadoAlumno.ACTIVO,
                    createdAtUtc: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
                  },
                ]);
              }
              // 3. Pagos Aprobados (transaccionesPago)
              if (callCount === 3) {
                return Promise.resolve([
                  { montoEquivalenteUsd: '35.00' },
                  { montoEquivalenteUsd: '40.00' },
                ]);
              }
              // 4. Cuotas Periodo (cuotasMembresia)
              if (callCount === 4) {
                return Promise.resolve([
                  { montoTotalUsd: '35.00' },
                  { montoTotalUsd: '40.00' },
                  { montoTotalUsd: '25.00' },
                ]);
              }
              // 5. Sesiones Semana (sesionesEntrenamiento)
              if (callCount === 5) {
                return Promise.resolve([
                  { estado: EstadoSesion.COMPLETADA },
                  { estado: EstadoSesion.PLANIFICADA },
                ]);
              }
              // 6. Pagos Pendientes (transaccionesPago)
              if (callCount === 6) {
                return Promise.resolve([{ id: 'tx-1' }]);
              }
              // 7. Checkins Antropométricos Pendientes (controlesAntropometricos)
              if (callCount === 7) {
                return Promise.resolve([{ id: 'checkin-1' }]);
              }
              // 8. Cuotas en Mora (cuotasMembresia)
              if (callCount === 8) {
                return Promise.resolve([
                  {
                    id: 'cuota-mora-1',
                    clienteId: 'user-alumno-1',
                    saldoPendienteUsd: '35.00',
                    fechaCorteUtc: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                    estado: EstadoCuota.VENCIDA,
                  },
                ]);
              }
              // 9. Últimas Sesiones (sesionesEntrenamiento)
              if (callCount === 9) {
                return {
                  orderBy: vi.fn().mockResolvedValue([
                    {
                      alumnoId: 'user-alumno-2',
                      fechaProgramada: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
                        .toISOString()
                        .split('T')[0],
                    },
                  ]),
                };
              }
              return Promise.resolve([]);
            }),
          };
        }),
      };
    });

    const entrenadorService = new EntrenadorService(mockDb);
    const resultado = await entrenadorService.obtenerDashboardComando(coachId);

    // Verificaciones de KPIs Macro
    expect(resultado.kpisMacro.alumnosActivos).toBe(2);
    expect(resultado.kpisMacro.capacidadMaxima).toBe(50);
    expect(resultado.kpisMacro.porcentajeOcupacion).toBe('4.00'); // 2/50 * 100
    expect(resultado.kpisMacro.cobranzaMesUsd).toBe('75.00'); // 35 + 40
    expect(resultado.kpisMacro.metaCobranzaMesUsd).toBe('100.00'); // 35 + 40 + 25
    expect(resultado.kpisMacro.porcentajeCobranza).toBe('75.00'); // 75/100 * 100
    expect(resultado.kpisMacro.tasaAdherenciaSemanal).toBe('50.00'); // 1 de 2 completadas

    // Verificaciones de Bandejas Rápidas
    expect(resultado.bandejasRapidas.pagosPorConciliar).toBe(1);
    expect(resultado.bandejasRapidas.checkinsAntropometricosPendientes).toBe(1);
    expect(resultado.bandejasRapidas.alumnosEnMora.length).toBe(1);
    expect(resultado.bandejasRapidas.alumnosEnMora[0].nombre).toBe('Carlos Mendoza');
    expect(resultado.bandejasRapidas.alumnosEnMora[0].saldoPendienteUsd).toBe('35.00');
    expect(resultado.bandejasRapidas.alumnosEnMora[0].diasVencido).toBe(3);

    // Inactivos en entrenamiento (alumno 2 lleva 6 días sin entrenar >= 4)
    expect(resultado.bandejasRapidas.alumnosInactivosEntrenamiento.length).toBeGreaterThan(0);
    expect(resultado.kpisMacro.alumnosEnRiesgo).toBeGreaterThanOrEqual(1);
  });
});
