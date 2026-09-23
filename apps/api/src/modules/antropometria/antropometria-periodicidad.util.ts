/**
 * RF-003 RN-01 / RN-04 / §6 (WU RF-003a): calendario de periodicidad y ventana del check-in remoto.
 *
 * Este módulo es PURO (sin Nest, sin DB) para que las reglas del doc se testeen con zonas horarias
 * reales sin infraestructura:
 *
 * 1. **Periodicidad (RN-01, precondición 2)**: `Semanal`, `Quincenal` o `Mensual`, anclada en la
 *    fecha `antropometriaInicio`. Las fechas programadas son `inicio + k * intervalo` (días para
 *    semanal/quincenal, meses calendario para mensual). Sin ancla o sin periodicidad NO hay
 *    calendario: la ventana de RN-04 no aplica y el alumno conserva el comportamiento previo.
 *
 * 2. **Ventana (RN-04 + §6)**: el doc define la ventana como "día programado ± 24 horas" y, en
 *    §6, como "la ventana de 48 h". Ambas lecturas coinciden en UNA sola: desde las 00:00 locales
 *    de `D-1` hasta las 00:00 locales de `D+1` (fin EXCLUSIVO), es decir 48 horas exactas alrededor
 *    del día programado `D` en el día local del alumno.
 *
 * 3. **Día local**: se usa la zona IANA del usuario (`usuarios.timezone`) — mismo patrón que
 *    nutrición y entrenamiento (`adherencia.util.ts`)—; una zona inválida cae a
 *    `America/Caracas`, la zona por defecto del producto.
 */
import { PeriodicidadAntropometria } from '@guachafit/shared';
import {
  esTimezoneIanaValida,
  fechaAnteriorYyyyMmDd,
  instanteUtcDesdeMedianocheLocal,
  obtenerFechaLocalYyyyMmDd,
} from '../../common/adherencia.util';

/** Zona por defecto del producto cuando el usuario no tiene una zona IANA válida (ADR-002). */
export const TIMEZONE_ANTROPOMETRIA_POR_DEFECTO = 'America/Caracas';

/** RN-01: hora local del recordatorio ("06:00 AM hora local"). */
export const HORA_RECORDATORIO_ANTROPOMETRIA = 6;

/**
 * RN-04: radio de la ventana activa en horas alrededor del día programado ("± 24 horas").
 * La ventana completa mide `2 * 24 = 48 h` (§6).
 */
export const HORAS_RADIO_VENTANA_ANTROPOMETRIA = 24;

/** Copy del recordatorio de RN-01 (mensaje literal del doc). */
export const MENSAJE_RECORDATORIO_ANTROPOMETRIA =
  'Hoy es día de check-in: registra tus métricas en ayunas.';

/** Intervalo en días de las periodicidades de aritmética diaria (mensual usa meses calendario). */
const INTERVALO_DIAS: Record<PeriodicidadAntropometria, number> = {
  [PeriodicidadAntropometria.SEMANAL]: 7,
  [PeriodicidadAntropometria.QUINCENAL]: 14,
  // `Mensual` no es un múltiplo fijo de días: se resuelve con meses calendario.
  [PeriodicidadAntropometria.MENSUAL]: 0,
};

/** Zona IANA válida del alumno o la zona por defecto del producto. */
export function resolverTimezoneAntropometria(timezone?: string | null): string {
  return timezone && esTimezoneIanaValida(timezone)
    ? timezone
    : TIMEZONE_ANTROPOMETRIA_POR_DEFECTO;
}

/** Suma (o resta) días a una fecha YYYY-MM-DD con aritmética UTC (sin TZ del servidor). */
export function sumarDiasCalendario(fechaYyyyMmDd: string, dias: number): string {
  const [y, m, d] = fechaYyyyMmDd.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().split('T')[0];
}

/** Diferencia de días de calendario `hasta - desde` (firmada; nunca la del reloj del proceso). */
function diferenciaDiasFirmada(desdeYyyyMmDd: string, hastaYyyyMmDd: string): number {
  const [y1, m1, d1] = desdeYyyyMmDd.split('-').map(Number);
  const [y2, m2, d2] = hastaYyyyMmDd.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/**
 * Desplaza una fecha en meses calendario conservando el día del mes y saturando al último día
 * disponible (2026-01-31 + 1 mes → 2026-02-28). Nunca depende de la TZ del servidor.
 */
export function desplazarMesesCalendario(fechaYyyyMmDd: string, meses: number): string {
  const [y, m, d] = fechaYyyyMmDd.split('-').map(Number);
  const destinoMesAbsoluto = (y * 12 + (m - 1)) + meses;
  const anio = Math.floor(destinoMesAbsoluto / 12);
  const mes = (destinoMesAbsoluto % 12 + 12) % 12;
  const ultimoDiaDelMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDiaDelMes);
  const mm = String(mes + 1).padStart(2, '0');
  const dd = String(dia).padStart(2, '0');
  return `${anio}-${mm}-${dd}`;
}

/** Límite defensivo del barrido (jamás un bucle sin salida con datos corruptos). */
const MAXIMO_PASOS_CALENDARIO = 4000;

/**
 * Fechas programadas que rodean al día local `hoyLocal`:
 *
 * - `anterior`: la mayor fecha programada `<= hoyLocal` (`null` si el ancla está en el futuro).
 * - `siguiente`: la menor fecha programada `>= hoyLocal` (igual a `hoyLocal` si hoy toca control).
 */
export function fechasProgramadasAntropometria(
  inicio: string,
  periodicidad: PeriodicidadAntropometria,
  hoyLocal: string
): { anterior: string | null; siguiente: string } {
  if (periodicidad === PeriodicidadAntropometria.MENSUAL) {
    return fechasMensuales(inicio, hoyLocal);
  }
  return fechasPorIntervaloDias(inicio, INTERVALO_DIAS[periodicidad], hoyLocal);
}

function fechasPorIntervaloDias(
  inicio: string,
  intervaloDias: number,
  hoyLocal: string
): { anterior: string | null; siguiente: string } {
  const diferencia = diferenciaDiasFirmada(inicio, hoyLocal);

  // Ancla futura: todavía no hay ninguna fecha programada cumplida.
  if (diferencia < 0) {
    return { anterior: null, siguiente: inicio };
  }

  let k = Math.max(0, Math.floor(diferencia / intervaloDias));
  let anterior = sumarDiasCalendario(inicio, k * intervaloDias);

  let pasos = 0;
  while (anterior > hoyLocal && k > 0 && pasos < MAXIMO_PASOS_CALENDARIO) {
    k -= 1;
    anterior = sumarDiasCalendario(inicio, k * intervaloDias);
    pasos += 1;
  }
  while (sumarDiasCalendario(inicio, (k + 1) * intervaloDias) <= hoyLocal && pasos < MAXIMO_PASOS_CALENDARIO) {
    k += 1;
    anterior = sumarDiasCalendario(inicio, k * intervaloDias);
    pasos += 1;
  }

  return {
    anterior,
    siguiente: anterior === hoyLocal ? hoyLocal : sumarDiasCalendario(inicio, (k + 1) * intervaloDias),
  };
}

function fechasMensuales(
  inicio: string,
  hoyLocal: string
): { anterior: string | null; siguiente: string } {
  const [anioInicio, mesInicio] = inicio.split('-').map(Number);
  const [anioHoy, mesHoy] = hoyLocal.split('-').map(Number);
  const diferenciaMeses = (anioHoy - anioInicio) * 12 + (mesHoy - mesInicio);

  if (diferenciaMeses < 0 || (diferenciaMeses === 0 && inicio > hoyLocal)) {
    return { anterior: null, siguiente: inicio };
  }

  let k = Math.max(0, diferenciaMeses);
  let anterior = desplazarMesesCalendario(inicio, k);

  let pasos = 0;
  while (anterior > hoyLocal && k > 0 && pasos < MAXIMO_PASOS_CALENDARIO) {
    k -= 1;
    anterior = desplazarMesesCalendario(inicio, k);
    pasos += 1;
  }
  while (
    desplazarMesesCalendario(inicio, k + 1) <= hoyLocal &&
    pasos < MAXIMO_PASOS_CALENDARIO
  ) {
    k += 1;
    anterior = desplazarMesesCalendario(inicio, k);
    pasos += 1;
  }

  return {
    anterior,
    siguiente: anterior === hoyLocal ? hoyLocal : desplazarMesesCalendario(inicio, k + 1),
  };
}

/** `true` si `hoyLocal` es una fecha programada del calendario (RN-01: toca control hoy). */
export function esDiaProgramadoAntropometria(
  inicio: string,
  periodicidad: PeriodicidadAntropometria,
  hoyLocal: string
): boolean {
  const { anterior, siguiente } = fechasProgramadasAntropometria(inicio, periodicidad, hoyLocal);
  return anterior === hoyLocal || siguiente === hoyLocal;
}

/** Estado del calendario de un alumno (lectura para la UI y para el recordatorio). */
export interface EstadoCalendarioAntropometria {
  /** `false` sin periodicidad/ancla configuradas: no hay fechas programadas. */
  configurado: boolean;
  hoyLocal: string;
  /** Fecha programada vigente o más cercana (la de hoy si toca control; si no, la anterior). */
  fechaProgramada: string | null;
  /** Próxima fecha programada futura (o la de hoy). `null` si no está configurado. */
  proximaFecha: string | null;
  /** `true` si hoy (día local) es una fecha programada. */
  esDiaProgramado: boolean;
}

/** Lectura del calendario de periodicidad en el día local del alumno. */
export function calcularEstadoCalendarioAntropometria(params: {
  periodicidad?: PeriodicidadAntropometria | null;
  antropometriaInicio?: string | null;
  timezone?: string | null;
  ahora?: Date;
}): EstadoCalendarioAntropometria {
  const ahora = params.ahora ?? new Date();
  const timezone = resolverTimezoneAntropometria(params.timezone);
  const hoyLocal = obtenerFechaLocalYyyyMmDd(ahora, timezone);

  if (!params.periodicidad || !params.antropometriaInicio) {
    return {
      configurado: false,
      hoyLocal,
      fechaProgramada: null,
      proximaFecha: null,
      esDiaProgramado: false,
    };
  }

  const { anterior, siguiente } = fechasProgramadasAntropometria(
    params.antropometriaInicio,
    params.periodicidad,
    hoyLocal
  );

  return {
    configurado: true,
    hoyLocal,
    fechaProgramada: anterior ?? siguiente,
    proximaFecha: siguiente,
    esDiaProgramado: anterior === hoyLocal || siguiente === hoyLocal,
  };
}

/** Motivo por el que un check-in remoto no se acepta (RF-003 §7: mensajes claros al rechazar). */
export type MotivoVentanaAntropometrica = 'SIN_PERIODICIDAD' | 'FUERA_DE_VENTANA';

/** Rango local de una ventana de check-in: `[desde 00:00, hasta 00:00)` (fin exclusivo). */
export interface RangoVentanaAntropometrica {
  /** Fecha programada `D` de la ventana. */
  fecha: string;
  /** `D-1`: primer día local de la ventana (00:00). */
  desde: string;
  /** `D+1`: día local en que la ventana cierra (00:00, fin EXCLUSIVO). */
  hasta: string;
}

export interface ResultadoVentanaAntropometrica {
  /** `false` sin calendario configurado ⇒ RN-04 no aplica (comportamiento previo preservado). */
  aplica: boolean;
  permitido: boolean;
  hoyLocal: string;
  /** Ventana vigente cuando `permitido`; `null` cuando no hay ninguna abierta. */
  ventanaVigente: RangoVentanaAntropometrica | null;
  /** Próxima ventana futura (dato accionable del mensaje de rechazo); `null` si no existe. */
  proximaVentana: RangoVentanaAntropometrica | null;
  /** Última ventana ya vencida (dato accionable del mensaje de rechazo); `null` si no existe. */
  ultimaVentanaVencida: RangoVentanaAntropometrica | null;
  motivo?: MotivoVentanaAntropometrica;
}

/** Rango local de la ventana de la fecha programada `D`. */
function rangoVentana(fechaProgramada: string): RangoVentanaAntropometrica {
  return {
    fecha: fechaProgramada,
    desde: fechaAnteriorYyyyMmDd(fechaProgramada, 1),
    hasta: sumarDiasCalendario(fechaProgramada, 1),
  };
}

/**
 * RN-04/§6: ¿puede el alumno remoto registrar su check-in AHORA?
 *
 * La ventana de la fecha programada `D` va de `D-1` 00:00 locales a `D+1` 00:00 locales
 * (fin exclusivo): "día programado ± 24 horas" (RN-04) = 48 horas exactas (§6).
 *
 * Se evalúan las dos fechas programadas que rodean al día local (la anterior y la siguiente) para
 * cubrir los días intermedios: la ventana de `D` sigue abierta durante todo el día local `D`.
 */
export function evaluarVentanaCheckinAntropometrico(params: {
  periodicidad?: PeriodicidadAntropometria | null;
  antropometriaInicio?: string | null;
  timezone?: string | null;
  ahora?: Date;
}): ResultadoVentanaAntropometrica {
  const ahora = params.ahora ?? new Date();
  const timezone = resolverTimezoneAntropometria(params.timezone);
  const hoyLocal = obtenerFechaLocalYyyyMmDd(ahora, timezone);

  if (!params.periodicidad || !params.antropometriaInicio) {
    return {
      aplica: false,
      permitido: true,
      hoyLocal,
      ventanaVigente: null,
      proximaVentana: null,
      ultimaVentanaVencida: null,
      motivo: 'SIN_PERIODICIDAD',
    };
  }

  const { anterior, siguiente } = fechasProgramadasAntropometria(
    params.antropometriaInicio,
    params.periodicidad,
    hoyLocal
  );

  const candidatas = (anterior === siguiente ? [siguiente] : [anterior, siguiente]).filter(
    (fecha): fecha is string => Boolean(fecha)
  );

  const ventanaAbierta = candidatas.find((candidata) => {
    const rango = rangoVentana(candidata);
    const desde = instanteUtcDesdeMedianocheLocal(rango.desde, timezone);
    const hasta = instanteUtcDesdeMedianocheLocal(rango.hasta, timezone);
    return ahora >= desde && ahora < hasta;
  });

  if (ventanaAbierta) {
    return {
      aplica: true,
      permitido: true,
      hoyLocal,
      ventanaVigente: rangoVentana(ventanaAbierta),
      proximaVentana: null,
      ultimaVentanaVencida: null,
    };
  }

  // Fuera de ventana: se describen la próxima ventana y la última vencida para el mensaje.
  const rangoSiguiente = siguiente ? rangoVentana(siguiente) : null;
  const proximaVentana =
    rangoSiguiente &&
    instanteUtcDesdeMedianocheLocal(rangoSiguiente.desde, timezone) > ahora
      ? rangoSiguiente
      : null;

  const rangoAnterior = anterior ? rangoVentana(anterior) : null;
  const ultimaVentanaVencida =
    rangoAnterior &&
    instanteUtcDesdeMedianocheLocal(rangoAnterior.hasta, timezone) <= ahora
      ? rangoAnterior
      : null;

  return {
    aplica: true,
    permitido: false,
    hoyLocal,
    ventanaVigente: null,
    proximaVentana,
    ultimaVentanaVencida,
    motivo: 'FUERA_DE_VENTANA',
  };
}

/**
 * Mensaje claro de rechazo del check-in remoto. Nunca afirma una notificación que el sistema no
 * emitió: solo describe las ventanas reales del calendario del alumno y remite al entrenador.
 */
export function construirMensajeFueraDeVentana(resultado: ResultadoVentanaAntropometrica): string {
  const proxima = resultado.proximaVentana;
  const vencida = resultado.ultimaVentanaVencida;

  if (vencida && proxima) {
    return (
      `Tu ventana de check-in (del ${vencida.desde} al ${vencida.hasta}, fechas locales) ya cerró ` +
      `y la próxima se habilita del ${proxima.desde} al ${proxima.hasta}. ` +
      'Contacta a tu entrenador para reprogramar tu medición si necesitas registrar antes.'
    );
  }

  if (vencida) {
    return (
      `Tu ventana de check-in (del ${vencida.desde} al ${vencida.hasta}, fechas locales) ya cerró. ` +
      'Contacta a tu entrenador para reprogramar tu medición.'
    );
  }

  if (proxima) {
    return (
      `Tu ventana de check-in aún no está abierta: se habilita del ${proxima.desde} al ` +
      `${proxima.hasta} (fechas locales, 00:00). Podrás registrar tus medidas dentro de esa ` +
      'ventana de 48 horas.'
    );
  }

  return 'Tu check-in está fuera de la ventana activa. Contacta a tu entrenador para reprogramar tu medición.';
}

/** Resultado de la evaluación del recordatorio de las 06:00 locales (RN-01). */
export interface ResultadoRecordatorioAntropometria {
  /** `true` si hoy es la fecha programada Y la hora local es la del recordatorio (06:00). */
  corresponde: boolean;
  hoyLocal: string;
  horaLocal: number;
  fechaProgramada: string | null;
  /** Referencia determinista del aviso: `antropometria_YYYY-MM-DD` (fecha local programada). */
  referenciaId: string | null;
}

/** Hora local 0–23 de un instante en una zona IANA (h23: medianoche = 00, nunca 24). */
export function obtenerHoraLocalEnTimezone(fecha: Date, timezone: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: resolverTimezoneAntropometria(timezone),
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? '0');
  return Number.isFinite(hora) ? hora % 24 : 0;
}

/** Referencia determinista del recordatorio (alimenta el `jobId` de RNF-004 §3). */
export function construirReferenciaRecordatorioAntropometria(fechaLocal: string): string {
  return `antropometria_${fechaLocal}`;
}

/** Resultado de la detección de ventana vencida sin check-in (RF-003 §6). */
export interface ResultadoExpiracionAntropometria {
  /** `true` si la última fecha programada cumplida ya cerró su ventana de 48 h. */
  expirado: boolean;
  hoyLocal: string;
  /** Fecha programada `D` cuya ventana `[D-1, D+1)` ya cerró (la más reciente). */
  fechaProgramada: string | null;
  /** Referencia determinista alumno + fecha programada (dedupe del aviso entre corridas). */
  referenciaId: string | null;
}

/** Referencia determinista de la expiración (alimenta el `jobId` de RNF-004 §3). */
export function construirReferenciaExpiracionAntropometria(
  alumnoId: string,
  fechaProgramada: string
): string {
  return `antropometria_expirado_${alumnoId}_${fechaProgramada}`;
}

/**
 * RF-003 §6: ¿el calendario del alumno tiene una fecha programada cuya ventana ya cerró?
 *
 * La ventana de `D` cierra al comenzar `D+1` local, así que la fecha vencida es la programada MÁS
 * RECIENTE anterior al día local de hoy (`anterior < hoyLocal`). La de hoy (`anterior === hoyLocal`)
 * tiene la ventana abierta y NO cuenta como expirada. El aviso es uno por fecha programada: la
 * referencia determinista `alumno + fecha` permite al barrido deduplicarlo entre corridas.
 */
export function evaluarExpiracionAntropometria(params: {
  alumnoId: string;
  periodicidad?: PeriodicidadAntropometria | null;
  antropometriaInicio?: string | null;
  timezone?: string | null;
  ahora?: Date;
}): ResultadoExpiracionAntropometria {
  const ahora = params.ahora ?? new Date();
  const timezone = resolverTimezoneAntropometria(params.timezone);
  const hoyLocal = obtenerFechaLocalYyyyMmDd(ahora, timezone);

  if (!params.periodicidad || !params.antropometriaInicio) {
    return { expirado: false, hoyLocal, fechaProgramada: null, referenciaId: null };
  }

  const { anterior } = fechasProgramadasAntropometria(
    params.antropometriaInicio,
    params.periodicidad,
    hoyLocal
  );

  if (!anterior || anterior >= hoyLocal) {
    return { expirado: false, hoyLocal, fechaProgramada: null, referenciaId: null };
  }

  return {
    expirado: true,
    hoyLocal,
    fechaProgramada: anterior,
    referenciaId: construirReferenciaExpiracionAntropometria(params.alumnoId, anterior),
  };
}

/**
 * RN-01 con job de 15 min (documentado): el processor corre cada 15 minutos en UTC y solo emite
 * para los alumnos cuya HORA LOCAL es la del recordatorio (06:00) y cuyo día local es una fecha
 * programada. La cadencia cubre offsets de hora entera, media hora (p. ej. Asia/Kolkata) y 45 min
 * (p. ej. Asia/Kathmandu) dentro de su hora local 6. Límite: si el worker está caído durante toda
 * la hora local 6, ese día no hay reemisión (no hay catch-up).
 */
export function evaluarRecordatorioAntropometria(params: {
  periodicidad?: PeriodicidadAntropometria | null;
  antropometriaInicio?: string | null;
  timezone?: string | null;
  ahora?: Date;
}): ResultadoRecordatorioAntropometria {
  const ahora = params.ahora ?? new Date();
  const timezone = resolverTimezoneAntropometria(params.timezone);
  const hoyLocal = obtenerFechaLocalYyyyMmDd(ahora, timezone);
  const horaLocal = obtenerHoraLocalEnTimezone(ahora, timezone);

  if (!params.periodicidad || !params.antropometriaInicio) {
    return { corresponde: false, hoyLocal, horaLocal, fechaProgramada: null, referenciaId: null };
  }

  const esHoy = esDiaProgramadoAntropometria(
    params.antropometriaInicio,
    params.periodicidad,
    hoyLocal
  );

  if (!esHoy) {
    return { corresponde: false, hoyLocal, horaLocal, fechaProgramada: null, referenciaId: null };
  }

  return {
    corresponde: horaLocal === HORA_RECORDATORIO_ANTROPOMETRIA,
    hoyLocal,
    horaLocal,
    fechaProgramada: hoyLocal,
    referenciaId: construirReferenciaRecordatorioAntropometria(hoyLocal),
  };
}
