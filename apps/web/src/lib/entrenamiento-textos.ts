/**
 * Textos de la pantalla de entrenamiento del alumno, en español claro y sin jerga
 * (sin semana ISO, RPE, RIR ni "h local"). Funciones puras para poder testearlas en Node.
 */
import { parsearNotasAlumno } from './adherencia';

const LOCALE = 'es';

function parsearFecha(yyyyMmDd?: string | null): Date | null {
  if (!yyyyMmDd) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd);
  if (!match) return null;
  const anio = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const fecha = new Date(anio, mes - 1, dia);
  if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) {
    return null;
  }
  return fecha;
}

function diaMesCorto(yyyyMmDd: string): string | null {
  const fecha = parsearFecha(yyyyMmDd);
  if (!fecha) return null;
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }).format(fecha);
}

/** 'Tu semana · del 14 sept al 20 sept' (o 'Tu semana' si las fechas no son válidas). */
export function formatearTituloSemana(inicio: string, fin: string): string {
  const desde = diaMesCorto(inicio);
  const hasta = diaMesCorto(fin);
  if (!desde || !hasta) return 'Tu semana';
  return `Tu semana · del ${desde} al ${hasta}`;
}

/** '3 de 5 días hechos' / '1 de 1 día hecho'. */
export function formatearProgresoDias(hechos: number, total: number): string {
  return total === 1 ? `${hechos} de 1 día hecho` : `${hechos} de ${total} días hechos`;
}

function horaLocal(iso?: string | null): string | null {
  if (!iso) return null;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(fecha);
}

/** 'de 10:15 a 11:20' (hora del teléfono) o 'desde las 10:15' si aún no terminó. */
export function formatearRangoHorario(inicioIso?: string | null, finIso?: string | null): string | null {
  const inicio = horaLocal(inicioIso);
  const fin = horaLocal(finIso);
  if (inicio && fin) return `de ${inicio} a ${fin}`;
  if (inicio) return `desde las ${inicio}`;
  if (fin) return `hasta las ${fin}`;
  return null;
}

/** Descripción del esfuerzo percibido (1 a 10) para el alumno. */
export function describirEsfuerzo(valor: number): string {
  if (valor <= 3) return 'Muy suave';
  if (valor <= 5) return 'Suave, cómodo';
  if (valor === 6) return 'Moderado';
  if (valor === 7) return 'Esfuerzo notable';
  if (valor === 8) return 'Exigente: te quedaban 2 repeticiones';
  if (valor === 9) return 'Casi al límite: te quedaba 1 o ninguna';
  return 'Al máximo: no podías hacer ni una más';
}

/** 'Esfuerzo sugerido: 8 de 10' a partir del valor prescrito ('8', '8.50'...). */
export function textoEsfuerzoSugerido(valor: string): string {
  const numero = Number(valor);
  const legible = Number.isFinite(numero)
    ? new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(numero)
    : valor;
  return `Esfuerzo sugerido: ${legible} de 10`;
}

/**
 * Las notas se guardan con el formato que entiende el panel del entrenador
 * (`[RPE: 8/10] • [Molestia: Hombro] • texto`). Al alumno se le muestran legibles:
 * 'Esfuerzo 8/10 · Molestia: Hombro · texto'.
 */
export function formatearNotasParaAlumno(notas?: string | null): string {
  const { etiquetas, textoLibre } = parsearNotasAlumno(notas);
  const partes = etiquetas.map(({ titulo, valor }) => {
    if (titulo.toUpperCase() === 'RPE') return `Esfuerzo ${valor}`;
    return valor ? `${titulo}: ${valor}` : titulo;
  });
  if (textoLibre) partes.push(textoLibre);
  return partes.join(' · ');
}

/** 'jueves, 1 de octubre' (null si la fecha no es válida). */
export function formatearFechaLegible(yyyyMmDd: string): string | null {
  const fecha = parsearFecha(yyyyMmDd);
  if (!fecha) return null;
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(fecha);
}

/** D3: aviso cuando lo único guardado en el teléfono es de otro día. */
export function textoUltimoEntrenamientoGuardado(fechaProgramada: string): string {
  const legible = formatearFechaLegible(fechaProgramada) ?? fechaProgramada;
  return `Tu último entrenamiento guardado es del ${legible}`;
}

/**
 * Notas automáticas anteriores del servidor ("Bloque: Día 1 • Reps: 8-10 • Peso: Sugerido"): al
 * alumno se le muestran sin jerga ("Día 1 · 8-10 repeticiones · peso a tu criterio"). Solo formato
 * local: las notas nuevas ya llegan claras y cualquier otro texto se muestra tal cual.
 */
export function formatearNotaEntrenadorParaAlumno(nota: string): string {
  const anterior = /^Bloque:\s*(.*?)\s*•\s*Reps:\s*(.*?)\s*•\s*Peso:\s*(.*?)\s*$/i.exec(nota);
  if (!anterior) return nota;
  const [, dia, reps, peso] = anterior;
  const textoPeso = !peso || /^sugerido$/i.test(peso) ? 'peso a tu criterio' : `peso ${peso}`;
  return [dia, reps ? `${reps} repeticiones` : '', textoPeso].filter(Boolean).join(' · ');
}

/** Campos del ejercicio de la sesión con lo que indicó el entrenador. */
interface IndicacionesEjercicio {
  notasCoach?: string | null;
  notasTecnicas?: string | null;
  rpeSugerido?: string | null;
}

/** Indicaciones técnicas del entrenador (campo propio); `null` si no escribió ninguna. */
export function indicacionesDelEntrenador(ejercicio: IndicacionesEjercicio): string | null {
  const texto = ejercicio.notasTecnicas?.trim();
  return texto ? texto : null;
}

/**
 * Nota corta del entrenador para la cabecera del ejercicio. Si llegan las indicaciones técnicas
 * en su campo propio se muestran aparte (el resumen ya las repite), así que no hay nota que
 * mostrar; en sesiones anteriores se muestra la nota de siempre, ya formateada.
 */
export function notaResumenEntrenador(ejercicio: IndicacionesEjercicio): string | null {
  if (indicacionesDelEntrenador(ejercicio)) return null;
  const nota = ejercicio.notasCoach?.trim();
  return nota ? formatearNotaEntrenadorParaAlumno(nota) : null;
}

/**
 * Esfuerzo sugerido. El servidor lo envía aparte (`rpeSugerido`, no cambia cuando el
 * alumno registra su esfuerzo real); sesiones anteriores usan el valor capturado al cargar.
 */
export function resolverRpeSugerido(
  ejercicio: IndicacionesEjercicio,
  capturadoAlCargar: string | null | undefined
): string | null {
  return ejercicio.rpeSugerido || capturadoAlCargar || null;
}
