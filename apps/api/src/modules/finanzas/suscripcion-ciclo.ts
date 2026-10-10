/**
 * M5-L1 (RF-005 / RF-008): aritmética PURA del ciclo de suscripción de un alumno.
 *
 * Decisiones del dueño (2026-10-09):
 * - Las cuotas se emiten solas a partir del plan asignado (no hay emisión manual).
 * - Cada cuota vence al INICIO del periodo que cubre (pago por adelantado).
 * - Los ciclos son MESES DE CALENDARIO anclados al día de inicio: si el mes destino es más corto
 *   se usa su último día, pero el siguiente ciclo vuelve a calcularse desde el ancla (un plan que
 *   empieza el 31 vence el 28 de febrero y otra vez el 31 de marzo).
 * - La cuota se emite `DIAS_ANTICIPACION_EMISION` días antes del vencimiento, que coincide con el
 *   recordatorio T-5 de RF-008.
 *
 * Todas las fechas de calendario son `YYYY-MM-DD` en la zona del alumno; la aritmética se hace en
 * UTC para no depender de la zona del servidor.
 */
import {
  instanteUtcDesdeMedianocheLocal,
  sumarDiasCalendario,
} from '../../common/adherencia.util';

/** Días de anticipación con que se emite la cuota antes de su vencimiento (= recordatorio T-5). */
export const DIAS_ANTICIPACION_EMISION = 5;

function partesFecha(fechaYyyyMmDd: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = fechaYyyyMmDd.split('-').map(Number);
  return { anio, mes, dia };
}

function formatearFecha(anio: number, mes: number, dia: number): string {
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Último día del mes (1-12) del año dado. */
function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Meses de calendario entre dos fechas, contando solo año y mes. */
function mesesEntre(desdeYyyyMmDd: string, hastaYyyyMmDd: string): number {
  const desde = partesFecha(desdeYyyyMmDd);
  const hasta = partesFecha(hastaYyyyMmDd);
  return (hasta.anio - desde.anio) * 12 + (hasta.mes - desde.mes);
}

/** Suma meses de calendario y ajusta el día al último del mes destino si no existe en él. */
export function sumarMesesCalendario(fechaYyyyMmDd: string, meses: number): string {
  const { anio, mes, dia } = partesFecha(fechaYyyyMmDd);
  const indiceMes = anio * 12 + (mes - 1) + meses;
  const anioDestino = Math.floor(indiceMes / 12);
  const mesDestino = (indiceMes % 12) + 1;
  return formatearFecha(
    anioDestino,
    mesDestino,
    Math.min(dia, ultimoDiaDelMes(anioDestino, mesDestino))
  );
}

/**
 * Vencimiento del ciclo siguiente. Se calcula SIEMPRE desde el ancla para que el ajuste de fin
 * de mes de un ciclo no se arrastre a los siguientes.
 */
export function calcularSiguienteCorte(
  anclaYyyyMmDd: string,
  corteActualYyyyMmDd: string,
  duracionMeses: number
): string {
  return sumarMesesCalendario(
    anclaYyyyMmDd,
    mesesEntre(anclaYyyyMmDd, corteActualYyyyMmDd) + duracionMeses
  );
}

/** `true` cuando ya toca emitir la cuota de ese vencimiento (hoy >= vencimiento − 5 días). */
export function debeEmitirCuota(proximoCorteYyyyMmDd: string, hoyLocalYyyyMmDd: string): boolean {
  return hoyLocalYyyyMmDd >= sumarDiasCalendario(proximoCorteYyyyMmDd, -DIAS_ANTICIPACION_EMISION);
}

/**
 * Vencimiento que corresponde emitir hoy. Si el ciclo quedó atrasado (alumno pausado o barrido
 * caído) se salta a la cuota del periodo en curso: nunca se cobran en bloque los ciclos pasados.
 */
export function corteVigente(
  anclaYyyyMmDd: string,
  proximoCorteYyyyMmDd: string,
  duracionMeses: number,
  hoyLocalYyyyMmDd: string
): string {
  // Un ciclo de 0 meses nunca avanzaría: el catálogo exige al menos 1 (defensa ante datos viejos).
  const paso = Math.max(1, duracionMeses);
  let corte = proximoCorteYyyyMmDd;
  let siguiente = calcularSiguienteCorte(anclaYyyyMmDd, corte, paso);
  while (debeEmitirCuota(siguiente, hoyLocalYyyyMmDd)) {
    corte = siguiente;
    siguiente = calcularSiguienteCorte(anclaYyyyMmDd, corte, paso);
  }
  return corte;
}

/** Instante de vencimiento: último milisegundo del día local del alumno (zona inválida → UTC). */
export function instanteCorteUtc(fechaCorteYyyyMmDd: string, zonaHoraria: string): Date {
  const inicioDiaSiguiente = instanteUtcDesdeMedianocheLocal(
    sumarDiasCalendario(fechaCorteYyyyMmDd, 1),
    zonaHoraria
  );
  return new Date(inicioDiaSiguiente.getTime() - 1);
}

/** Periodo `YYYY-MM` de la cuota que vence en esa fecha. */
export function periodoDeCorte(fechaCorteYyyyMmDd: string): string {
  return fechaCorteYyyyMmDd.slice(0, 7);
}
