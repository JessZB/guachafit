/**
 * RF-002 (LOTE API-N2): reglas PURAS de tiempo del reporte nutricional diario.
 *
 * - Ventana RN-02: el reporte se captura entre las 18:00 y las 23:59 del día `fecha`.
 * - Plazo de recepción: llega como máximo a las 12:00 del día siguiente.
 * - "No reportado" (§6): un día queda cerrado cuando vence su plazo.
 *
 * Todo se evalúa en la zona horaria del PERFIL del alumno. Sin E/S ni reloj implícito: el servicio
 * de nutrición y el digest semanal pasan los instantes, así los tests fijan el reloj.
 */
import {
  HORA_FIN_VENTANA_CHECKIN_NUTRICIONAL,
  HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL,
  HORA_LIMITE_RECEPCION_CHECKIN_DIA_SIGUIENTE,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
} from '@guachafit/shared';
import { esTimezoneIanaValida, fechaHoraLocal, sumarDiasCalendario } from '../../common/adherencia.util';

// =============================================================================
// VENTANA HORARIA DEL CHECK-IN (RF-002 RN-02)
// =============================================================================

export type MotivoFueraDeVentana = 'FUERA_DE_VENTANA' | 'FECHA_DISTINTA_AL_DIA_LOCAL';

interface BaseVentanaCheckin {
  /** Fecha local YYYY-MM-DD del alumno en el instante evaluado. */
  fechaLocalHoy: string;
  /** Hora local (0–23) del alumno en el instante evaluado. */
  horaLocal: number;
  /** Zona IANA efectivamente usada (la recibida si es válida; si no, la por defecto). */
  timezone: string;
}

export type ResultadoVentanaCheckinNutricional =
  | (BaseVentanaCheckin & { permitido: true; motivo?: undefined })
  | (BaseVentanaCheckin & { permitido: false; motivo: MotivoFueraDeVentana });

/** Zona IANA válida o la zona por defecto del producto (RN-05/ADR-002). */
export function resolverTimezoneNutricion(timezone?: string | null): string {
  return timezone && esTimezoneIanaValida(timezone) ? timezone : ZONA_HORARIA_ALUMNO_POR_DEFECTO;
}

/**
 * RF-002 RN-02: el check-in 1-Tap solo se habilita entre las 18:00 y las 23:59 (hora local del
 * alumno) y para el día local en curso. Fuera de esa ventana el día ya cerró: el reporte se
 * rechaza (el día quedará `No reportado` si nunca se registró), nunca se acepta tarde en
 * silencio.
 */
export function evaluarVentanaCheckinNutricional(
  fecha: string,
  zonaHoraria?: string | null,
  instante: Date = new Date()
): ResultadoVentanaCheckinNutricional {
  const timezone = resolverTimezoneNutricion(zonaHoraria);
  const local = fechaHoraLocal(instante, timezone);
  const fechaLocalHoy = local.slice(0, 10);
  const horaLocal = Number(local.slice(11, 13));

  if (fecha !== fechaLocalHoy) {
    return { permitido: false, fechaLocalHoy, horaLocal, timezone, motivo: 'FECHA_DISTINTA_AL_DIA_LOCAL' };
  }

  if (
    horaLocal < HORA_INICIO_VENTANA_CHECKIN_NUTRICIONAL ||
    horaLocal > HORA_FIN_VENTANA_CHECKIN_NUTRICIONAL
  ) {
    return { permitido: false, fechaLocalHoy, horaLocal, timezone, motivo: 'FUERA_DE_VENTANA' };
  }

  return { permitido: true, fechaLocalHoy, horaLocal, timezone };
}

// =============================================================================
// CAPTURA OFFLINE TARDÍA Y PLAZO DE RECEPCIÓN (LOTE API-N2, decisiones del dueño 2026-10-05)
// =============================================================================

/** Límite local (inclusivo) de recepción del reporte del día `fecha`: 12:00:00 del día siguiente. */
export function limiteRecepcionLocal(fecha: string): string {
  const hora = String(HORA_LIMITE_RECEPCION_CHECKIN_DIA_SIGUIENTE).padStart(2, '0');
  return `${sumarDiasCalendario(fecha, 1)}T${hora}:00:00`;
}

export type MotivoRechazoRecepcionCheckin = MotivoFueraDeVentana | 'FUERA_DE_PLAZO';

interface BaseRecepcionCheckin {
  /** Instante de captura: recepción del servidor menos los segundos que informó el teléfono. */
  capturadoEn: Date;
  /** Evaluación de la ventana 18:00–23:59 sobre la hora de captura (zona del perfil). */
  ventana: ResultadoVentanaCheckinNutricional;
}

export type ResultadoRecepcionCheckinNutricional =
  | (BaseRecepcionCheckin & { permitido: true })
  | (BaseRecepcionCheckin & { permitido: false; motivo: MotivoRechazoRecepcionCheckin });

/**
 * LOTE API-N2 (RF-002 RN-02 + captura offline tardía), todo en la zona del PERFIL del alumno:
 *
 * 1. Hora de captura = `recibidoEn` (reloj del SERVIDOR) − `segundosDesdeCaptura`. El teléfono
 *    solo mide una duración, así que un reloj del teléfono adelantado o atrasado no influye.
 * 2. La captura debe caer en 18:00–23:59 del día `fecha` → si no, el rechazo de ventana de siempre
 *    (`FUERA_DE_VENTANA` / `FECHA_DISTINTA_AL_DIA_LOCAL`).
 * 3. La recepción debe llegar como máximo a las 12:00:00 del día siguiente → `FUERA_DE_PLAZO`.
 *
 * Sin `segundosDesdeCaptura` la captura es la recepción (comportamiento previo): como 2. exige que
 * esa hora esté dentro del día `fecha`, la regla 3 nunca cambia el resultado de un envío en línea.
 */
export function evaluarRecepcionCheckinNutricional(params: {
  fecha: string;
  zonaHoraria: string;
  recibidoEn: Date;
  segundosDesdeCaptura?: number | null;
}): ResultadoRecepcionCheckinNutricional {
  const { fecha, zonaHoraria, recibidoEn } = params;
  const capturadoEn = new Date(recibidoEn.getTime() - (params.segundosDesdeCaptura ?? 0) * 1000);
  const ventana = evaluarVentanaCheckinNutricional(fecha, zonaHoraria, capturadoEn);

  if (!ventana.permitido) {
    return { permitido: false, capturadoEn, ventana, motivo: ventana.motivo };
  }

  if (fechaHoraLocal(recibidoEn, ventana.timezone) > limiteRecepcionLocal(fecha)) {
    return { permitido: false, capturadoEn, ventana, motivo: 'FUERA_DE_PLAZO' };
  }

  return { permitido: true, capturadoEn, ventana };
}

// =============================================================================
// "NO REPORTADO" DEL CALENDARIO NUTRICIONAL (RF-002 §6)
// =============================================================================

/**
 * LOTE API-N2 (RF-002 §6): último día local CERRADO del alumno en el instante `ahora`. Un día solo
 * queda definitivamente "No reportado" cuando vence su plazo de recepción (12:00:00 del día
 * siguiente, zona del perfil, inclusivo): hasta esa hora, ayer todavía puede llegar por la cola.
 */
export function ultimoDiaNutricionalCerrado(ahora: Date, zonaHoraria?: string | null): string {
  const zona = resolverTimezoneNutricion(zonaHoraria);
  const ahoraLocal = fechaHoraLocal(ahora, zona);
  const ayer = sumarDiasCalendario(ahoraLocal.slice(0, 10), -1);
  return ahoraLocal > limiteRecepcionLocal(ayer) ? ayer : sumarDiasCalendario(ayer, -1);
}

/** Fechas YYYY-MM-DD del rango inclusivo [desde, hasta]. Vacío si el rango es inválido. */
export function enumerarFechasCalendario(desde: string, hasta: string): string[] {
  const fechas: string[] = [];
  let actual = desde;
  // Guard de rango invertido o malformado: nunca un bucle sin salida.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
    return fechas;
  }
  while (actual <= hasta) {
    fechas.push(actual);
    actual = sumarDiasCalendario(actual, 1);
  }
  return fechas;
}

/**
 * RF-002 §6: cuenta los días CERRADOS del rango [desde, hasta] en los que el alumno no registró
 * el semáforo. El llamador decide qué días están cerrados (ver `ultimoDiaNutricionalCerrado`).
 * `fechasReportadas` son YYYY-MM-DD.
 */
export function contarDiasNoReportados(
  desde: string,
  hasta: string,
  fechasReportadas: ReadonlySet<string>
): number {
  return enumerarFechasCalendario(desde, hasta).filter((fecha) => !fechasReportadas.has(fecha))
    .length;
}
