import { BloqueDiaRutinaDTO, SemaforoAdherencia } from '@guachafit/shared';

// =============================================================================
// EVALUADOR PURO DE ADHERENCIA SEMANAL (RF-001 RN-03)
// Compartido por EntrenamientoService (monitor del coach) y EntrenadorService
// (KPIs del dashboard) para garantizar una única semántica de semáforos.
// =============================================================================

export function evaluarAdherenciaSemanal(
  sesionesPrescritas: number,
  sesionesCompletadas: number,
  diasInactivo: number
): {
  porcentajeCumplimientoSemanal: string;
  semaforoAdherencia: SemaforoAdherencia;
  nivelRiesgo: 'ALTO' | 'MEDIO' | 'BAJO';
} {
  if (sesionesPrescritas <= 0) {
    return {
      porcentajeCumplimientoSemanal: '0.00',
      semaforoAdherencia: SemaforoAdherencia.ROJO,
      nivelRiesgo: 'ALTO',
    };
  }

  const porcentaje = (sesionesCompletadas / sesionesPrescritas) * 100;
  const porcentajeStr = porcentaje.toFixed(2);

  // Regla RN-03: Inactividad > 4 días consecutivos fuerza automáticamente a ROJO
  if (diasInactivo > 4 || porcentaje < 50.0) {
    return {
      porcentajeCumplimientoSemanal: porcentajeStr,
      semaforoAdherencia: SemaforoAdherencia.ROJO,
      nivelRiesgo: 'ALTO',
    };
  }

  if (porcentaje >= 80.0) {
    return {
      porcentajeCumplimientoSemanal: porcentajeStr,
      semaforoAdherencia: SemaforoAdherencia.VERDE,
      nivelRiesgo: 'BAJO',
    };
  }

  // 50% <= porcentaje < 80%
  return {
    porcentajeCumplimientoSemanal: porcentajeStr,
    semaforoAdherencia: SemaforoAdherencia.AMARILLO,
    nivelRiesgo: 'MEDIO',
  };
}

// =============================================================================
// HELPERS DE FECHA LOCAL Y VENTANA SEMANAL (RF-001 RN-05)
// =============================================================================

/** Valida una timezone IANA usando Intl. `UTC` y `undefined` son válidas. */
export function esTimezoneIanaValida(timezone?: string | null): boolean {
  if (!timezone) return true;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fecha local YYYY-MM-DD en la timezone del cliente (RN-05).
 * Si la timezone es inválida o ausente, cae a UTC.
 */
export function obtenerFechaLocalYyyyMmDd(
  fecha: Date | string,
  timezone?: string | null
): string {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
  const tz = esTimezoneIanaValida(timezone) ? timezone! : 'UTC';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
  } catch {
    return d.toISOString().split('T')[0];
  }
}

/** Resta días a una fecha YYYY-MM-DD (aritmética en UTC, sin depender de la TZ del servidor). */
export function fechaAnteriorYyyyMmDd(fechaYyyyMmDd: string, dias = 1): string {
  const [y, m, d] = fechaYyyyMmDd.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return fecha.toISOString().split('T')[0];
}

/** Diferencia en días de calendario entre dos fechas YYYY-MM-DD (nunca negativa). */
export function diferenciaDiasCalendario(desdeYyyyMmDd: string, hastaYyyyMmDd: string): number {
  const [y1, m1, d1] = desdeYyyyMmDd.split('-').map(Number);
  const [y2, m2, d2] = hastaYyyyMmDd.split('-').map(Number);
  const desde = Date.UTC(y1, m1 - 1, d1);
  const hasta = Date.UTC(y2, m2 - 1, d2);
  return Math.max(0, Math.round((hasta - desde) / 86400000));
}

export function calcularRangoSemanaIso(fechaYyyyMmDd: string): {
  semanaIso: string;
  inicioSemana: string;
  finSemana: string;
  isoDay: number;
} {
  const [y, m, d] = fechaYyyyMmDd.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const jsDay = fecha.getUTCDay(); // 0 = Dom, 1 = Lun, ..., 6 = Sab
  const isoDay = jsDay === 0 ? 7 : jsDay;

  const diffToMonday = isoDay - 1;
  const lunesUtcMs = fecha.getTime() - diffToMonday * 86400000;
  const lunesDate = new Date(lunesUtcMs);
  const inicioSemana = lunesDate.toISOString().split('T')[0];

  const domingoUtcMs = lunesUtcMs + 6 * 86400000;
  const domingoDate = new Date(domingoUtcMs);
  const finSemana = domingoDate.toISOString().split('T')[0];

  const target = new Date(fecha.valueOf());
  const dayNr = (fecha.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const semanaIso = `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;

  return {
    semanaIso,
    inicioSemana,
    finSemana,
    isoDay,
  };
}

export function obtenerDiaSugeridoBloque(bloque: BloqueDiaRutinaDTO, fallbackIndex: number): number {
  if (typeof bloque.diaSugerido === 'number' && bloque.diaSugerido >= 1 && bloque.diaSugerido <= 7) {
    return bloque.diaSugerido;
  }
  const match = bloque.diaId.match(/\d+/);
  if (match) {
    const n = parseInt(match[0], 10);
    if (n >= 1 && n <= 7) return n;
  }
  return fallbackIndex + 1 <= 7 ? fallbackIndex + 1 : 1;
}

/**
 * Offset (en minutos) de una zona IANA respecto a UTC en un instante dado.
 * Positivo al este de Greenwich (ej. Europe/Madrid = +120 en verano).
 */
function obtenerOffsetMinutos(fecha: Date, timezone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const partes = Object.fromEntries(
    dtf.formatToParts(fecha).map((p) => [p.type, p.value])
  );
  const comoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour) % 24,
    Number(partes.minute),
    Number(partes.second)
  );
  return Math.round((comoUtc - fecha.getTime()) / 60000);
}

/**
 * Instante UTC exacto correspondiente a las 00:00 locales de `fechaYyyyMmDd`
 * en la zona indicada. La conversión se estabiliza en dos iteraciones para
 * absorber los cambios de offset por horario de verano.
 */
export function instanteUtcDesdeMedianocheLocal(
  fechaYyyyMmDd: string,
  timezone?: string | null
): Date {
  const tz = esTimezoneIanaValida(timezone) ? timezone! : 'UTC';
  const [y, m, d] = fechaYyyyMmDd.split('-').map(Number);
  const baseUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0);
  let ts = baseUtcMs;
  for (let i = 0; i < 2; i++) {
    ts = baseUtcMs - obtenerOffsetMinutos(new Date(ts), tz) * 60000;
  }
  return new Date(ts);
}

export interface VentanaSemana {
  /** Fecha local de hoy (YYYY-MM-DD) en la zona del cliente. */
  hoyLocal: string;
  /** Lunes de la semana en curso (YYYY-MM-DD) en la zona del cliente. */
  inicioSemanaLocal: string;
  /** Domingo de la semana en curso (YYYY-MM-DD) en la zona del cliente. */
  finSemanaLocal: string;
  /** Día ISO de hoy (1 = Lunes ... 7 = Domingo). */
  isoDayHoy: number;
  /** Instante UTC del lunes 00:00 local: inicio exacto de la ventana semanal (RN-03/RN-05). */
  inicioSemanaUtc: Date;
  /** Instante UTC de "ahora": fin de la ventana en curso. */
  ahoraUtc: Date;
}

/**
 * Ventana semanal en curso: [Lunes 00:00 local, ahora] convertida a UTC (RF-001 RN-03/RN-05).
 * `timezone` corresponde a la zona del entrenador que consulta; si es inválida, cae a UTC.
 */
export function calcularVentanaSemana(now: Date, timezone?: string | null): VentanaSemana {
  const tz = esTimezoneIanaValida(timezone) ? timezone! : 'UTC';
  const hoyLocal = obtenerFechaLocalYyyyMmDd(now, tz);
  const { inicioSemana, finSemana, isoDay } = calcularRangoSemanaIso(hoyLocal);
  return {
    hoyLocal,
    inicioSemanaLocal: inicioSemana,
    finSemanaLocal: finSemana,
    isoDayHoy: isoDay,
    inicioSemanaUtc: instanteUtcDesdeMedianocheLocal(inicioSemana, tz),
    ahoraUtc: now,
  };
}

/**
 * Sesiones prescritas de una rutina semanal que ya debieron ejecutarse en la ventana:
 * bloques con día sugerido <= día ISO de hoy (1 = Lunes).
 */
export function contarBloquesPrescritosHasta(
  bloques: BloqueDiaRutinaDTO[] | null | undefined,
  isoDayHoy: number
): number {
  if (!Array.isArray(bloques)) return 0;
  return bloques.filter((bloque, idx) => obtenerDiaSugeridoBloque(bloque, idx) <= isoDayHoy)
    .length;
}
