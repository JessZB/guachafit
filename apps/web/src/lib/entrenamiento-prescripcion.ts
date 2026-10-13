import type {
  EjercicioSesionDetalleDTO,
  SerieRegistroDetalleDTO,
} from '@guachafit/shared';
import { formatearPesoConUnidad, formatearPesoDesdeKg, type UnidadPeso } from './weight-unit';

/**
 * Una serie "intacta" conserva los valores prefijados por la API al crear la sesión:
 * el RPE que trae es la referencia prescrita. Las sesiones nuevas traen además
 * `rpeSugerido` aparte; esta captura queda como respaldo para las sesiones anteriores.
 * En cuanto el alumno registra datos reales deja de contar como referencia.
 */
export function serieSinDatosReales(serie: SerieRegistroDetalleDTO): boolean {
  return (
    !serie.completada &&
    !serie.timestampCompletadaUtc &&
    (serie.pesoKg === null || serie.pesoKg === undefined || serie.pesoKg === '') &&
    (serie.repsLogradas === null || serie.repsLogradas === undefined)
  );
}

/**
 * Captura el RPE sugerido de la sesión recién cargada (solo series intactas y uniformes).
 * Se congela al cargar para que editar el RPE real durante el checklist no borre la
 * referencia prescrita: el badge "Prescrito" permanece visible.
 */
export function capturarRpeSugerido(
  ejercicios: EjercicioSesionDetalleDTO[]
): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const ejercicioSesion of ejercicios) {
    const intactas = ejercicioSesion.series.filter(serieSinDatosReales);
    const primero = intactas[0]?.rpe;
    if (primero && intactas.every((s) => s.rpe === primero)) {
      snapshot[ejercicioSesion.id] = primero;
    }
  }
  return snapshot;
}

export interface ResumenPrescripcion {
  totalSeries: number;
  repsTexto: string | null;
  pesosKg: number[];
}

/** n series × reps objetivo × peso prescrito (cuando exista) para el badge de prescripción. */
export function calcularResumenPrescripcion(
  ejercicioSesion: EjercicioSesionDetalleDTO
): ResumenPrescripcion {
  const series = ejercicioSesion.series;
  const repsUnicas = Array.from(new Set(series.map((s) => s.repsObjetivo))).sort((a, b) => a - b);
  const pesosKg = Array.from(
    new Set(
      series
        .map((s) => {
          const valor =
            s.pesoPrescritoKg === null || s.pesoPrescritoKg === undefined
              ? NaN
              : Number(s.pesoPrescritoKg);
          return Number.isFinite(valor) && valor > 0 ? valor : NaN;
        })
        .filter((v) => Number.isFinite(v))
    )
  ).sort((a, b) => a - b);

  return {
    totalSeries: series.length,
    repsTexto:
      repsUnicas.length === 0
        ? null
        : repsUnicas.length === 1
        ? `${repsUnicas[0]}`
        : `${repsUnicas[0]}–${repsUnicas[repsUnicas.length - 1]}`,
    pesosKg,
  };
}

/** Traduce el resumen prescrito a la unidad visible: '4 series × 8–10 reps · 28 kg'. */
export function formatearPrescripcion(resumen: ResumenPrescripcion, unidad: UnidadPeso): string {
  const partes: string[] = [
    `${resumen.totalSeries} ${resumen.totalSeries === 1 ? 'serie' : 'series'}`,
  ];
  if (resumen.repsTexto) partes.push(`× ${resumen.repsTexto} reps`);
  if (resumen.pesosKg.length === 1) {
    partes.push(`· ${formatearPesoConUnidad(resumen.pesosKg[0], unidad)}`);
  } else if (resumen.pesosKg.length > 1) {
    const minimo = formatearPesoDesdeKg(resumen.pesosKg[0], unidad);
    const maximo = formatearPesoConUnidad(resumen.pesosKg[resumen.pesosKg.length - 1], unidad);
    if (minimo && maximo) partes.push(`· ${minimo}–${maximo}`);
  }
  return partes.join(' ');
}

/** Peso prescrito con carga para una serie (null cuando la prescripción es cualitativa). */
export function pesoPrescritoConCarga(serie: SerieRegistroDetalleDTO): string | null {
  const valor = serie.pesoPrescritoKg;
  if (valor === null || valor === undefined) return null;
  const numerico = Number(valor);
  return Number.isFinite(numerico) && numerico > 0 ? valor : null;
}
