/**
 * Emisión del barrido antropométrico.
 *
 * Copia palabra por palabra los recorridos del procesador: filtros en
 * memoria, eventos al bus, conteos y avisos de bitácora. Sin consultas.
 */
import type { PeriodicidadAntropometria } from '@guachafit/shared';
import {
  CheckinAntropometricoExpiradoEvent,
  RecordatorioCheckinAntropometricoEvent,
} from '../../../notificaciones/events/eventos-notificacion';
import {
  inicioAvisoLocalMs,
  nombreCompleto,
  tieneAvisoDesdeMedianoche,
  tieneMedicionDesde,
  tieneReporteEnVentana,
  avisoExpiracionYaEmitido,
  ventanaRecordatorio,
  inicioVentanaExpiracion,
  type AvisoBandejaReglas,
  type AvisoReferenciaReglas,
  type CandidatoExpiracionReglas,
  type CandidatoRecordatorioReglas,
  type ControlAntropometricoReglas,
} from './recordatorio-reglas';

/** Bus mínimo para publicar los eventos del barrido. */
export interface EmisorBarrido {
  emitAsync(nombre: string, evento: unknown): Promise<unknown>;
}

/** Bitácora mínima para los recorridos de emisión. */
export interface BitacoraBarrido {
  log(mensaje: string): void;
  warn(mensaje: string): void;
}

/** Recorre los candidatos del día y publica su recordatorio. */
export async function emitirRecordatoriosCandidatos(args: {
  candidatos: CandidatoRecordatorioReglas[];
  controles: ControlAntropometricoReglas[];
  avisosPrevios: AvisoBandejaReglas[];
  eventEmitter: EmisorBarrido;
  logger: BitacoraBarrido;
  totalEvaluados: number;
  tipoEvento: string;
  linkAccion: string;
  mensaje: string;
}): Promise<{ omitidosPorReporte: number; omitidosPorAviso: number; despachados: number }> {
  const {
    candidatos,
    controles,
    avisosPrevios,
    eventEmitter,
    logger,
    totalEvaluados,
    tipoEvento,
    linkAccion,
    mensaje,
  } = args;
  let omitidosPorReporte = 0;
  let omitidosPorAviso = 0;
  let despachados = 0;

  for (const { alumno, recordatorio } of candidatos) {
    const fechaProgramada = recordatorio.fechaProgramada!;
    const { desdeVentana, hastaVentana } = ventanaRecordatorio(fechaProgramada);

    const yaReporto = tieneReporteEnVentana(
      controles,
      alumno.usuarioId,
      desdeVentana,
      hastaVentana
    );

    if (yaReporto) {
      omitidosPorReporte += 1;
      continue;
    }

    const inicioAvisoLocal = inicioAvisoLocalMs(fechaProgramada, alumno.timezone);
    const yaAvisado = tieneAvisoDesdeMedianoche(avisosPrevios, alumno.usuarioId, inicioAvisoLocal);

    if (yaAvisado) {
      omitidosPorAviso += 1;
      continue;
    }

    try {
      await eventEmitter.emitAsync(
        RecordatorioCheckinAntropometricoEvent.NOMBRE,
        new RecordatorioCheckinAntropometricoEvent({
          tipoEvento,
          destinatarioUserId: alumno.usuarioId,
          entrenadorId: alumno.entrenadorId,
          categoria: 'ANTROPOMETRIA',
          titulo: 'Hoy es día de check-in',
          cuerpo: mensaje,
          linkAccion,
          // RNF-004 §3: referencia determinista por alumno+fecha local (dedupe de push/email).
          referenciaId: recordatorio.referenciaId ?? undefined,
          datosAdicionales: {
            alumnoId: alumno.usuarioId,
            fechaProgramada,
            periodicidad: alumno.periodicidad as PeriodicidadAntropometria,
          },
          esCriticoSeguridad: false,
        })
      );
      despachados += 1;
    } catch (error) {
      logger.warn(
        `No se pudo despachar el recordatorio antropométrico del alumno ${alumno.usuarioId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  logger.log(
    `Recordatorio antropométrico: ${despachados} despachados, ${omitidosPorReporte} ya reportaron, ` +
      `${omitidosPorAviso} ya avisados (${totalEvaluados} alumnos con calendario evaluados).`
  );

  return {
    omitidosPorReporte,
    omitidosPorAviso,
    despachados,
  };
}

/** Recorre las ventanas vencidas y avisa al coach una vez por fecha. */
export async function emitirExpiracionesCandidatas(args: {
  candidatos: CandidatoExpiracionReglas[];
  controles: ControlAntropometricoReglas[];
  avisosPrevios: AvisoReferenciaReglas[];
  eventEmitter: EmisorBarrido;
  logger: BitacoraBarrido;
  tipoEvento: string;
  linkAccion: string;
}): Promise<{
  expiracionesDespachadas: number;
  expiracionesOmitidasPorMedicion: number;
  expiracionesOmitidasPorAviso: number;
}> {
  const { candidatos, controles, avisosPrevios, eventEmitter, logger, tipoEvento, linkAccion } =
    args;
  let expiracionesDespachadas = 0;
  let expiracionesOmitidasPorMedicion = 0;
  let expiracionesOmitidasPorAviso = 0;

  for (const { alumno, expiracion } of candidatos) {
    const fechaProgramada = expiracion.fechaProgramada!;
    const desdeVentana = inicioVentanaExpiracion(fechaProgramada);

    const yaMedido = tieneMedicionDesde(controles, alumno.usuarioId, desdeVentana);
    if (yaMedido) {
      expiracionesOmitidasPorMedicion += 1;
      continue;
    }

    const yaAvisado = avisoExpiracionYaEmitido(
      avisosPrevios,
      alumno.entrenadorId,
      expiracion.referenciaId!
    );
    if (yaAvisado) {
      expiracionesOmitidasPorAviso += 1;
      continue;
    }

    const nombre = nombreCompleto(alumno.nombres, alumno.apellidos);

    try {
      await eventEmitter.emitAsync(
        CheckinAntropometricoExpiradoEvent.NOMBRE,
        new CheckinAntropometricoExpiradoEvent({
          tipoEvento,
          destinatarioUserId: alumno.entrenadorId,
          entrenadorId: alumno.entrenadorId,
          categoria: 'ANTROPOMETRIA',
          titulo: 'Check-in antropométrico vencido',
          cuerpo: `${nombre} no completó su medición del ${fechaProgramada}; considera reprogramar.`,
          linkAccion,
          // RNF-004 §3: referencia determinista por alumno + fecha programada (dedupe).
          referenciaId: expiracion.referenciaId ?? undefined,
          datosAdicionales: {
            alumnoId: alumno.usuarioId,
            fechaProgramada,
            periodicidad: alumno.periodicidad as PeriodicidadAntropometria,
          },
          esCriticoSeguridad: false,
        })
      );
      expiracionesDespachadas += 1;
    } catch (error) {
      logger.warn(
        `No se pudo despachar la expiración antropométrica del alumno ${alumno.usuarioId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  logger.log(
    `Check-in antropométrico vencido: ${expiracionesDespachadas} avisos al coach, ` +
      `${expiracionesOmitidasPorMedicion} con medición, ${expiracionesOmitidasPorAviso} ya avisados ` +
      `(${candidatos.length} ventanas vencidas evaluadas).`
  );

  return {
    expiracionesDespachadas,
    expiracionesOmitidasPorMedicion,
    expiracionesOmitidasPorAviso,
  };
}
