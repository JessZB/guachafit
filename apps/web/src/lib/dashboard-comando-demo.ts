import type { DashboardComandoDTO } from '@guachafit/shared';

// MODO DEMO EXPLÍCITO (isDemoMode): KPIs de ejemplo solo con la bandera activa y
// sin llamadas contra la API real. En sesión real, un fallo es un error visible.
export const DASHBOARD_COMANDO_DEMO: DashboardComandoDTO = {
  kpisMacro: {
    alumnosActivos: 38,
    capacidadMaxima: 50,
    porcentajeOcupacion: '76.00',
    cobranzaMesUsd: '1900.00',
    metaCobranzaMesUsd: '2500.00',
    porcentajeCobranza: '76.00',
    tasaAdherenciaSemanal: '84.50',
    alumnosEnRiesgoDeportivo: 4,
    alumnosEnMoraFinanciera: 2,
    alumnosEnRiesgo: 4,
  },
  bandejasRapidas: {
    pagosPorConciliar: 3,
    checkinsAntropometricosPendientes: 2,
    alumnosEnMora: [
      {
        alumnoId: 'a1',
        nombre: 'Carlos Mendoza',
        cuotaId: 'c1',
        saldoPendienteUsd: '30.00',
        diasVencido: 5,
      },
      {
        alumnoId: 'a2',
        nombre: 'Mariana Pérez',
        cuotaId: 'c2',
        saldoPendienteUsd: '50.00',
        diasVencido: 2,
      },
    ],
    alumnosInactivosEntrenamiento: [
      {
        alumnoId: 'a3',
        nombre: 'Andrés Silva',
        diasSinEntrenar: 6,
      },
      {
        alumnoId: 'a4',
        nombre: 'Elena Gómez',
        diasSinEntrenar: 5,
      },
    ],
  },
};
