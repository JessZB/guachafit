/**
 * Reglas puras del digest semanal (RF-014/RF-015 §B "Resumen Semanal").
 *
 * El compositor del cuerpo no toca base de datos ni colas: solo arma el texto
 * del digest para un coach con sus métricas ya agregadas.
 */
export interface MetricasResumenSemanal {
  coachNombre: string;
  alumnosActivos: number;
  sesionesCompletadas: number;
  sesionesProgramadas: number;
  cobradoUsd: string;
  cuotasPorVencer: number;
  cuotasEnMora: number;
  /**
   * RF-002 §6 (WU RF-002a): días CERRADOS de la ventana sin check-in nutricional en toda la
   * cartera del coach. La alerta viaja en el digest semanal (RF-015 §B "Resumen Semanal"; la
   * matriz no tiene una categoría NUTRICION propia, así que se reutiliza la fila del digest
   * — Email/Push según preferencia — y la copia In-App universal del despachador).
   */
  nutricionDiasNoReportados: number;
}

export interface ResultadoResumenSemanal {
  coaches: number;
  despachados: number;
}

/** Compositor PURO del cuerpo del digest (testeable sin DB). */
export function construirCuerpoResumenSemanal(metricas: MetricasResumenSemanal): string {
  const adherencia =
    metricas.sesionesProgramadas > 0
      ? `${metricas.sesionesCompletadas} de ${metricas.sesionesProgramadas} sesiones completadas (${Math.round(
          (metricas.sesionesCompletadas / metricas.sesionesProgramadas) * 100
        )}%)`
      : `${metricas.sesionesCompletadas} sesiones completadas (sin sesiones programadas esta semana)`;

  const alertaNutricion =
    metricas.nutricionDiasNoReportados > 0
      ? ` Atención: ${metricas.nutricionDiasNoReportados} día(s) de tu alumnado quedaron sin reporte nutricional.`
      : '';

  return (
    `Hola ${metricas.coachNombre}, tu semana en GUACHAFIT: ${adherencia}, ` +
    `$${metricas.cobradoUsd} USD cobrados, ${metricas.cuotasPorVencer} cuota(s) por vencer ` +
    `y ${metricas.cuotasEnMora} en mora.${alertaNutricion}`
  );
}
