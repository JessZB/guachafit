import type { Logger } from '@nestjs/common';
import { ResumenSemanalCoachEvent } from '../../events/eventos-notificacion';
import type { ContextoResumenSemanal } from './contexto-resumen-semanal';
import {
  construirCuerpoResumenSemanal,
  type MetricasResumenSemanal,
  type ResultadoResumenSemanal,
} from './cuerpo-resumen-reglas';
import type { CoachResumen } from './leer-cartera';
import type { MetricasDigest } from './leer-metricas';

/**
 * Arma el digest de cada coach y emite un `ResumenSemanalCoachEvent` por coach.
 * Un fallo puntual no cancela el resto del digest.
 */
export async function despacharDigest(
  ctx: Pick<ContextoResumenSemanal, 'eventEmitter'>,
  logger: Logger,
  coaches: CoachResumen[],
  cartera: { alumnosActivosPorCoach: Map<string, number> },
  metricas: MetricasDigest
): Promise<ResultadoResumenSemanal> {
  const {
    desdeYmd,
    hastaYmd,
    sesionesCompletadasPorCoach,
    sesionesProgramadasPorCoach,
    nutricionNoReportadosPorCoach,
    cobradoPorCoach,
    porVencerPorCoach,
    enMoraPorCoach,
  } = metricas;

  // Emisión del evento por coach: un fallo puntual no cancela el resto del digest.
  let despachados = 0;
  const referenciaSemana = `semana_${hastaYmd}`;

  for (const coach of coaches) {
    const coachNombre =
      coach.nombreComercial || `${coach.nombres} ${coach.apellidos}`.trim();

    const metricasCoach: MetricasResumenSemanal = {
      coachNombre,
      alumnosActivos: cartera.alumnosActivosPorCoach.get(coach.usuarioId) ?? 0,
      sesionesCompletadas: sesionesCompletadasPorCoach.get(coach.usuarioId) ?? 0,
      sesionesProgramadas: sesionesProgramadasPorCoach.get(coach.usuarioId) ?? 0,
      cobradoUsd: cobradoPorCoach.get(coach.usuarioId) ?? '0.00',
      cuotasPorVencer: porVencerPorCoach.get(coach.usuarioId) ?? 0,
      cuotasEnMora: enMoraPorCoach.get(coach.usuarioId) ?? 0,
      nutricionDiasNoReportados: nutricionNoReportadosPorCoach.get(coach.usuarioId) ?? 0,
    };

    try {
      await ctx.eventEmitter.emitAsync(
        ResumenSemanalCoachEvent.NOMBRE,
        new ResumenSemanalCoachEvent({
          tipoEvento: 'RESUMEN_SEMANAL_COACH',
          destinatarioUserId: coach.usuarioId,
          entrenadorId: coach.usuarioId,
          categoria: 'RESUMEN_SEMANAL',
          titulo: 'Tu resumen semanal GUACHAFIT',
          cuerpo: construirCuerpoResumenSemanal(metricasCoach),
          linkAccion: '/coach',
          datosAdicionales: {
            semana: hastaYmd,
            alumnosActivos: metricasCoach.alumnosActivos,
            sesionesCompletadas: metricasCoach.sesionesCompletadas,
            sesionesProgramadas: metricasCoach.sesionesProgramadas,
            cobradoUsd: metricasCoach.cobradoUsd,
            cuotasPorVencer: metricasCoach.cuotasPorVencer,
            cuotasEnMora: metricasCoach.cuotasEnMora,
            nutricionDiasNoReportados: metricasCoach.nutricionDiasNoReportados,
          },
          esCriticoSeguridad: false,
          // RNF-004 §3: ref de origen del jobId determinista (semana del digest).
          referenciaId: referenciaSemana,
        })
      );
      despachados += 1;
    } catch (error) {
      logger.warn(
        `No se pudo despachar el resumen semanal del coach ${coach.usuarioId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  logger.log(
    `Resumen semanal generado: ${despachados}/${coaches.length} coaches despachados (ventana ${desdeYmd}..${hastaYmd}).`
  );

  return { coaches: coaches.length, despachados };
}
