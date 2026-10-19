/**
 * Mis alumnos (dueño 2026-10-19) · lógica pura de actividad del directorio.
 *
 * - `describirUltimoEntreno` y `describirRacha` traducen las señales de la tarjeta a copy en
 *   español. `alerta` marca a quien lleva `UMBRAL_DIAS_SIN_ENTRENAR_ALERTA` días o más sin entrenar.
 * - `ordenarAlumnosDirectorio` replica en memoria las reglas de orden del servidor (`orden` de
 *   `GET /alumnos`) para el modo demo, sin API.
 * - Días de calendario LOCAL: se compara el día local de la fecha con el día local de `ahora`
 *   (no las 24 h), así un entreno de ayer a las 23:00 cuenta como "ayer" a las 08:00.
 * - Sin React, sin red: testeable en Node.
 */

import type { AlumnoDirectorioItemDTO, OrdenDirectorioAlumnos } from '@guachafit/shared';
import { pluralizar } from './pluralizar';

/** Días sin entrenar a partir de los cuales la tarjeta muestra el aviso de alerta. */
export const UMBRAL_DIAS_SIN_ENTRENAR_ALERTA = 7;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface DescripcionUltimoEntreno {
  texto: string;
  alerta: boolean;
  dias: number | null;
}

/** Medianoche local del día de `fecha`, en milisegundos. */
function inicioDiaLocal(fecha: Date): number {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()).getTime();
}

/** Días de calendario locales desde `desde` hasta `hasta` (negativo si `hasta` es anterior). */
function diasEntre(desde: Date, hasta: Date): number {
  return Math.round((inicioDiaLocal(hasta) - inicioDiaLocal(desde)) / MS_POR_DIA);
}

/** Convierte una clave local `YYYY-MM-DD` (formato de `rachaUltimaFecha`) en fecha local. */
function fechaDesdeClaveLocal(clave: string): Date {
  const [anio, mes, dia] = clave.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

/** Texto del último entreno según los días de calendario locales transcurridos. */
export function describirUltimoEntreno(
  ultimaSesionFecha: string | null | undefined,
  ahora: Date
): DescripcionUltimoEntreno {
  const fecha = ultimaSesionFecha ? new Date(ultimaSesionFecha) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) {
    return { texto: 'Sin entrenos registrados', alerta: false, dias: null };
  }
  // Una fecha futura (desfase de reloj o de zona horaria) cuenta como hoy: nunca hay días negativos.
  const dias = Math.max(0, diasEntre(fecha, ahora));
  if (dias >= UMBRAL_DIAS_SIN_ENTRENAR_ALERTA) {
    return { texto: `Sin entrenar hace ${pluralizar(dias, 'día', 'días')}`, alerta: true, dias };
  }
  if (dias === 0) return { texto: 'Entrenó hoy', alerta: false, dias };
  if (dias === 1) return { texto: 'Entrenó ayer', alerta: false, dias };
  return { texto: `Entrenó hace ${pluralizar(dias, 'día', 'días')}`, alerta: false, dias };
}

/** Texto de la racha; `null` cuando no hay racha que mostrar (0 o ausente). */
export function describirRacha(rachaDias: number | undefined): string | null {
  if (!rachaDias || rachaDias <= 0) return null;
  return `Racha de ${pluralizar(rachaDias, 'día', 'días')}`;
}

/** Campos que las reglas de orden necesitan; el resto del ítem no interviene. */
export type AlumnoOrdenable = Pick<
  AlumnoDirectorioItemDTO,
  'id' | 'nombres' | 'apellidos' | 'createdAtUtc' | 'ultimaSesionFecha' | 'rachaDias' | 'rachaUltimaFecha'
>;

/**
 * Racha efectiva: 0 si la última fecha de racha es anterior a ayer (la cadena se rompió).
 * Deliberado: la demo cuenta el día con el reloj local del navegador porque el roster demo no porta
 * zona horaria (la API usa la zona de cada alumno).
 */
function rachaEfectiva(alumno: AlumnoOrdenable, ahora: Date): number {
  if (!alumno.rachaUltimaFecha) return 0;
  const diasDesde = diasEntre(fechaDesdeClaveLocal(alumno.rachaUltimaFecha), ahora);
  return diasDesde <= 1 ? alumno.rachaDias : 0;
}

/** Instante en ms de una fecha ISO; `-Infinity` si falta o no es válida. */
function instante(iso: string | null): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

function compararNumero(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compararTexto(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Desempate común: id ascendente (orden estable y determinista). */
function desempatarPorId(a: AlumnoOrdenable, b: AlumnoOrdenable): number {
  return compararTexto(a.id, b.id);
}

/**
 * Orden del directorio con las mismas reglas que el servidor:
 * - `alta_reciente`: alta más nueva primero; desempata id asc.
 * - `nombre`: nombres asc, luego apellidos asc (sin distinguir mayúsculas); desempata id asc.
 * - `sin_entrenar`: quienes nunca entrenaron primero; luego la última sesión más antigua; id asc.
 * - `mayor_racha`: racha efectiva desc (la vencida vale 0); luego nombres asc; id asc.
 * Función pura: devuelve un arreglo nuevo, no muta la entrada.
 */
export function ordenarAlumnosDirectorio<T extends AlumnoOrdenable>(
  items: readonly T[],
  orden: `${OrdenDirectorioAlumnos}`,
  ahora: Date
): T[] {
  const comparar = comparadorDelOrden(orden, ahora);
  return [...items].sort(comparar);
}

function comparadorDelOrden(
  orden: `${OrdenDirectorioAlumnos}`,
  ahora: Date
): (a: AlumnoOrdenable, b: AlumnoOrdenable) => number {
  switch (orden) {
    case 'nombre':
      return (a, b) =>
        compararTexto(a.nombres.toLowerCase(), b.nombres.toLowerCase()) ||
        compararTexto(a.apellidos.toLowerCase(), b.apellidos.toLowerCase()) ||
        desempatarPorId(a, b);
    case 'sin_entrenar':
      return (a, b) =>
        compararNumero(instante(a.ultimaSesionFecha), instante(b.ultimaSesionFecha)) ||
        desempatarPorId(a, b);
    case 'mayor_racha':
      return (a, b) =>
        compararNumero(rachaEfectiva(b, ahora), rachaEfectiva(a, ahora)) ||
        compararTexto(a.nombres.toLowerCase(), b.nombres.toLowerCase()) ||
        desempatarPorId(a, b);
    default:
      return (a, b) =>
        compararNumero(instante(b.createdAtUtc), instante(a.createdAtUtc)) ||
        desempatarPorId(a, b);
  }
}
