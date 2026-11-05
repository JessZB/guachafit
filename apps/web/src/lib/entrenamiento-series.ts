import type { SerieRegistroDetalleDTO, SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { pesoEfectivoKg } from './entrenamiento-peso-plan';
import { normalizarKgParaContrato, validarReps, validarRpe } from './weight-unit';

/** Valida una serie completa antes de enviarla/encolarla (contrato RegistrarSerieSchema). */
export function validarSerieParaEnviar(
  serie: SerieRegistroDetalleDTO
): { campo: 'pesoKg' | 'rpe' | 'repsLogradas'; mensaje: string } | null {
  // RN-01: el peso es opcional; solo un texto presente y no representable es inválido.
  const sinPeso = serie.pesoKg === null || serie.pesoKg === undefined || serie.pesoKg === '';
  if (!sinPeso && normalizarKgParaContrato(serie.pesoKg) === null) {
    return { campo: 'pesoKg', mensaje: 'Peso inválido: corrige el valor (ej. 28.5)' };
  }
  const errorReps = validarReps(serie.repsLogradas ?? serie.repsObjetivo);
  if (errorReps) return { campo: 'repsLogradas', mensaje: errorReps };
  if (serie.rpe) {
    const resultado = validarRpe(serie.rpe);
    if (!resultado.ok) {
      return { campo: 'rpe', mensaje: resultado.error ?? 'Esfuerzo no válido' };
    }
  }
  return null;
}

export interface PayloadSerie {
  serieId: string;
  repsLogradas: number | null;
  pesoKg: string | null;
  rpe: string | null;
  descansoSegundos: number | null;
  completada: boolean;
  timestampInicioUtc: string | undefined;
  timestampCompletadaUtc: string | null | undefined;
}

export interface DatosReversionSerie {
  ejercicioIndex: number;
  serieIndex: number;
  serieAntes: SerieRegistroDetalleDTO;
  porcentajeAntes: string;
  rachaAntes: boolean | undefined;
}

/**
 * D6: rechazo de datos con conexión → la serie vuelve a como estaba.
 * Solo se revierte lo que tocó el marcado: el peso, las reps o el RPE editados mientras el
 * envío estaba en vuelo se conservan (revisión E7, W1).
 */
export function revertirSerieRechazada(
  actual: SesionEntrenamientoDetalleDTO,
  datos: DatosReversionSerie
): SesionEntrenamientoDetalleDTO {
  const { ejercicioIndex, serieIndex, serieAntes, porcentajeAntes, rachaAntes } = datos;
  return {
    ...actual,
    porcentajeCumplimiento: porcentajeAntes,
    cumpleReglaRacha: rachaAntes,
    ejercicios: actual.ejercicios.map((ejercicio, indice) =>
      indice === ejercicioIndex
        ? {
            ...ejercicio,
            series: ejercicio.series.map((s, indiceSerie) =>
              indiceSerie === serieIndex
                ? {
                    ...s,
                    completada: serieAntes.completada,
                    timestampCompletadaUtc: serieAntes.timestampCompletadaUtc,
                    descansoSegundos: serieAntes.descansoSegundos,
                  }
                : s
            ),
          }
        : ejercicio
    ),
  };
}

/**
 * Construye el batch de una serie para `PUT /sesiones/:id/series`.
 * Unifica las dos construcciones que vivían en la página (cambio de descanso y
 * marcado): mismo objeto, mismos nombres de campo, mismo orden.
 *
 * El peso enviado es SIEMPRE el efectivo de la serie (el propio, o el del plan si el alumno no
 * lo tocó) normalizado al contrato; un peso vaciado viaja como `null` (RN-01: es opcional). El
 * segundo parámetro se conserva por compatibilidad de firma y se ignora.
 */
export function construirPayloadSerie(
  serie: SerieRegistroDetalleDTO,
  _pesoKgNormalizado: string | null,
  descansoSegundos: number | null | undefined,
  completada: boolean
): { series: [PayloadSerie] } {
  const pesoNormalizado = normalizarKgParaContrato(pesoEfectivoKg(serie));
  const pesoKgNormalizado = pesoNormalizado === '' ? null : pesoNormalizado;
  return {
    series: [
      {
        serieId: serie.id,
        repsLogradas: serie.repsLogradas ?? serie.repsObjetivo,
        pesoKg: pesoKgNormalizado,
        rpe: serie.rpe ?? null,
        descansoSegundos: descansoSegundos ?? null,
        completada,
        // WU17: marca de inicio real capturada en esta sesión (si existe) en el mismo batch.
        // WU17: la marca de inicio viaja en el mismo batch (undefined = no se envía).
        timestampInicioUtc: serie.timestampInicioUtc ?? undefined,
        timestampCompletadaUtc: serie.timestampCompletadaUtc,
      },
    ],
  };
}
