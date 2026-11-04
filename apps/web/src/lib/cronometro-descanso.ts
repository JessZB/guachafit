/**
 * Cronómetro de descanso (RF-001, ADR-021): lógica pura con reloj inyectado.
 *
 * El estado guarda el INSTANTE ABSOLUTO de fin (`finEnMs`), no un contador que decrece: así
 * sobrevive a recargas y a la pantalla bloqueada (al volver, el restante se recalcula desde el
 * reloj). Sin React ni acceso directo a `Date.now()`: todo recibe `ahoraMs`. El almacenamiento
 * (`localStorage`) se valida al leer y nunca lanza.
 */

export interface EstadoCronometro {
  v: 1;
  sesionId: string;
  /** `null` = cronómetro libre (abierto desde la cabecera, sin serie asociada). */
  serieId: string | null;
  /** Objetivo del temporizador (no una medición, RF-001 §7.7). */
  duracionMs: number;
  /** Instante absoluto de fin; `null` si está pausado. */
  finEnMs: number | null;
  /** Restante congelado; `null` si corre. */
  pausadoRestanteMs: number | null;
  notificadoFin: boolean;
  actualizadoEnMs: number;
}

export const DURACION_MIN_MS = 10_000;
export const DURACION_MAX_MS = 600_000;
/** Un estado guardado más viejo que esto se descarta al leerlo (descanso olvidado). */
export const EDAD_MAX_MS = 6 * 60 * 60 * 1000;
/**
 * Un descanso que terminó hace MÁS de esto ya no suena al volver a la app: un beep tardío, con el
 * alumno ya en otra cosa, confunde más que avisa. Se marca como notificado en silencio.
 */
export const TOLERANCIA_AVISO_TARDE_MS = 30_000;
export const prefijoClaveCronometro = 'guachafit_cronometro_';

type AlmacenLectura = Pick<Storage, 'getItem'> | null;
type AlmacenEscritura = Pick<Storage, 'setItem' | 'removeItem'> | null;

export function claveCronometro(sesionId: string): string {
  return `${prefijoClaveCronometro}${sesionId}`;
}

function acotarDuracion(duracionMs: number): number {
  // `Math.max/min` propagan NaN: un valor no finito (NaN, ±Infinity) cae al mínimo en vez de
  // corromper `finEnMs` y el estado persistido.
  if (!Number.isFinite(duracionMs)) return DURACION_MIN_MS;
  return Math.min(DURACION_MAX_MS, Math.max(DURACION_MIN_MS, Math.round(duracionMs)));
}

export function iniciar(p: {
  sesionId: string;
  serieId: string | null;
  duracionMs: number;
  ahoraMs: number;
}): EstadoCronometro {
  const duracionMs = acotarDuracion(p.duracionMs);
  return {
    v: 1,
    sesionId: p.sesionId,
    serieId: p.serieId,
    duracionMs,
    finEnMs: p.ahoraMs + duracionMs,
    pausadoRestanteMs: null,
    notificadoFin: false,
    actualizadoEnMs: p.ahoraMs,
  };
}

export function estaPausado(e: EstadoCronometro): boolean {
  return e.finEnMs === null;
}

/** Restante entero en `[0, duracionMs]`: un reloj que retrocede o salta no lo desborda. */
export function restanteMs(e: EstadoCronometro, ahoraMs: number): number {
  const bruto = e.finEnMs === null ? e.pausadoRestanteMs ?? 0 : e.finEnMs - ahoraMs;
  return Math.min(e.duracionMs, Math.max(0, Math.round(bruto)));
}

export function estaTerminado(e: EstadoCronometro, ahoraMs: number): boolean {
  return restanteMs(e, ahoraMs) === 0;
}

export function pausar(e: EstadoCronometro, ahoraMs: number): EstadoCronometro {
  if (estaPausado(e)) return e;
  return { ...e, finEnMs: null, pausadoRestanteMs: restanteMs(e, ahoraMs), actualizadoEnMs: ahoraMs };
}

export function reanudar(e: EstadoCronometro, ahoraMs: number): EstadoCronometro {
  if (!estaPausado(e)) return e;
  return {
    ...e,
    finEnMs: ahoraMs + (e.pausadoRestanteMs ?? 0),
    pausadoRestanteMs: null,
    actualizadoEnMs: ahoraMs,
  };
}

/** Suma `deltaMs` al restante y a la duración (acotada); el restante nunca baja de 0. */
export function ajustar(e: EstadoCronometro, deltaMs: number, ahoraMs: number): EstadoCronometro {
  // Un delta no finito se ignora (equivale a 0): no debe mover ni corromper el estado.
  const delta = Number.isFinite(deltaMs) ? deltaMs : 0;
  const duracionMs = acotarDuracion(e.duracionMs + delta);
  const restante = Math.min(duracionMs, Math.max(0, restanteMs(e, ahoraMs) + delta));
  // Si ya había terminado y el ajuste devuelve tiempo, empieza otra cuenta atrás que sí avisa.
  const notificadoFin = restante > 0 ? false : e.notificadoFin;
  if (estaPausado(e)) {
    return { ...e, duracionMs, pausadoRestanteMs: restante, notificadoFin, actualizadoEnMs: ahoraMs };
  }
  return { ...e, duracionMs, finEnMs: ahoraMs + restante, notificadoFin, actualizadoEnMs: ahoraMs };
}

/** Restaura el restante a la duración (o a `duracionMs` si se pasa), corriendo y sin aviso previo. */
export function reiniciar(
  e: EstadoCronometro,
  ahoraMs: number,
  duracionMs?: number
): EstadoCronometro {
  const duracion = acotarDuracion(duracionMs ?? e.duracionMs);
  return {
    ...e,
    duracionMs: duracion,
    finEnMs: ahoraMs + duracion,
    pausadoRestanteMs: null,
    notificadoFin: false,
    actualizadoEnMs: ahoraMs,
  };
}

export function marcarNotificado(e: EstadoCronometro): EstadoCronometro {
  return { ...e, notificadoFin: true };
}

/** El aviso de fin sale una sola vez por descanso: terminado y aún sin notificar. */
export function debeAvisarFin(e: EstadoCronometro, ahoraMs: number): boolean {
  return estaTerminado(e, ahoraMs) && !e.notificadoFin;
}

/**
 * `true` si el descanso terminó hace MÁS de `TOLERANCIA_AVISO_TARDE_MS` (en la tolerancia exacta
 * todavía es `false`). En pausa (`finEnMs === null`) nunca es tardío: no hay instante de fin.
 */
export function avisoTardio(e: EstadoCronometro, ahoraMs: number): boolean {
  return (
    e.finEnMs !== null &&
    estaTerminado(e, ahoraMs) &&
    ahoraMs - e.finEnMs > TOLERANCIA_AVISO_TARDE_MS
  );
}

/** Segundos enteros hacia arriba: no se muestra 0 mientras quede algo de tiempo. */
function segundosHaciaArriba(restante: number): number {
  return Math.ceil(Math.max(0, restante) / 1000);
}

/** Segundo que muestra el widget; una sola fórmula para el reloj `m:ss` y para el hook. */
export function restanteSegundosCeil(e: EstadoCronometro, ahoraMs: number): number {
  return segundosHaciaArriba(restanteMs(e, ahoraMs));
}

/** Reloj de cuenta atrás `m:ss`; redondea hacia arriba para no mostrar 0:00 antes de terminar. */
export function formatearRestante(restante: number): string {
  const segundosTotales = segundosHaciaArriba(restante);
  const minutos = Math.floor(segundosTotales / 60);
  const segundos = segundosTotales % 60;
  return `${minutos}:${segundos < 10 ? '0' : ''}${segundos}`;
}

export function serializar(e: EstadoCronometro): string {
  return JSON.stringify(e);
}

function esNumeroNoNegativo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;
}

/** Valida el JSON guardado; ante cualquier anomalía devuelve `null` sin lanzar. */
export function parsear(
  raw: string | null,
  p: { sesionId: string; ahoraMs: number; maxEdadMs?: number }
): EstadoCronometro | null {
  if (!raw) return null;
  let dato: unknown;
  try {
    dato = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!dato || typeof dato !== 'object') return null;
  const c = dato as Record<string, unknown>;

  if (c.v !== 1 || c.sesionId !== p.sesionId) return null;
  if (c.serieId !== null && typeof c.serieId !== 'string') return null;
  if (!esNumeroNoNegativo(c.duracionMs)) return null;
  if (c.duracionMs < DURACION_MIN_MS || c.duracionMs > DURACION_MAX_MS) return null;
  if (c.finEnMs !== null && !esNumeroNoNegativo(c.finEnMs)) return null;
  if (c.pausadoRestanteMs !== null && !esNumeroNoNegativo(c.pausadoRestanteMs)) return null;
  // Exactamente uno de los dos: corriendo (fin absoluto) o pausado (restante congelado).
  if ((c.finEnMs === null) === (c.pausadoRestanteMs === null)) return null;
  if (typeof c.notificadoFin !== 'boolean') return null;
  if (!esNumeroNoNegativo(c.actualizadoEnMs)) return null;
  if (p.ahoraMs - c.actualizadoEnMs > (p.maxEdadMs ?? EDAD_MAX_MS)) return null;

  return {
    v: 1,
    sesionId: c.sesionId,
    serieId: c.serieId as string | null,
    duracionMs: c.duracionMs,
    finEnMs: c.finEnMs as number | null,
    pausadoRestanteMs: c.pausadoRestanteMs as number | null,
    notificadoFin: c.notificadoFin,
    actualizadoEnMs: c.actualizadoEnMs,
  };
}

export function leerCronometro(
  almacen: AlmacenLectura,
  sesionId: string,
  ahoraMs: number
): EstadoCronometro | null {
  if (!almacen) return null;
  try {
    return parsear(almacen.getItem(claveCronometro(sesionId)), { sesionId, ahoraMs });
  } catch {
    // Almacenamiento bloqueado: se trata como si no hubiera nada guardado.
    return null;
  }
}

/** `null` borra la clave. Devuelve `false` si no pudo escribir (cuota llena, modo privado). */
export function guardarCronometro(
  almacen: AlmacenEscritura,
  sesionId: string,
  e: EstadoCronometro | null
): boolean {
  if (!almacen) return false;
  try {
    if (e === null) almacen.removeItem(claveCronometro(sesionId));
    else almacen.setItem(claveCronometro(sesionId), serializar(e));
    return true;
  } catch {
    return false;
  }
}
