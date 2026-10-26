import { fechaAnteriorYyyyMmDd } from '../../../common/adherencia.util';

// =============================================================================
// FUNCIONES PURAS DE DOMINIO: EVALUACIÓN DE ADHERENCIA Y RACHA (RF-001)
// Extraídas de `entrenamiento.service.ts` sin cambios (P3): la fachada las
// re-exporta para mantener los imports históricos de tests y consumidores.
// =============================================================================

export function calcularDuracionMinutos(
  fechaInicioUtc: string | Date | null | undefined,
  fechaFinUtc: string | Date | null | undefined
): number | null {
  if (!fechaInicioUtc || !fechaFinUtc) return null;
  const inicioMs = new Date(fechaInicioUtc).getTime();
  const finMs = new Date(fechaFinUtc).getTime();
  return Math.max(0, Math.round((finMs - inicioMs) / (1000 * 60)));
}

export function toIsoUtcString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

// =============================================================================
// HELPERS PUROS: FECHA LOCAL, RACHA Y CUMPLIMIENTO POR VOLUMEN (RF-001 RN-02)
// =============================================================================

/** Serie mínima requerida para evaluar la regla de racha por volumen. */
export interface SerieParaRacha {
  pesoPrescritoKg?: string | null;
  pesoKg?: string | null;
  repsObjetivo: number;
  repsLogradas?: number | null;
  completada: boolean;
}

export interface EvaluacionRacha {
  cumple: boolean;
  /** Σ (peso real × reps logradas) de series completadas con peso prescrito. */
  volumenRealizadoKg: number;
  /** Σ (peso prescrito × reps objetivo) de todas las series con peso prescrito. */
  volumenPrescritoKg: number;
  /** Ratio ponderado de volumen (null si no existe parte ponderada). */
  ratioVolumenPct: number | null;
  /** Ratio de series completadas/prescritas sin peso prescrito (null si no existe esa parte). */
  ratioSeriesPct: number | null;
}

/**
 * RN-02 (RF-001): regla del 70% combinando dos partes:
 *  - Parte ponderada (series con peso prescrito > 0): Σ(peso real × reps logradas) / Σ(peso prescrito × reps objetivo).
 *  - Parte cualitativa (series sin peso prescrito o con peso prescrito 0.00): series completadas / series prescritas.
 * `cumple` es true solo si TODAS las partes existentes alcanzan >= 70%.
 * Si no existe la parte ponderada, aplica únicamente el ratio de series (comportamiento legacy).
 */
export function evaluarCumplimientoRachaPorVolumen(series: SerieParaRacha[]): EvaluacionRacha {
  let volumenRealizadoKg = 0;
  let volumenPrescritoKg = 0;

  let seriesCualitativas = 0;
  let seriesCualitativasCompletadas = 0;

  for (const s of series) {
    const pesoPrescrito = parseFloat(s.pesoPrescritoKg || '0') || 0;
    if (pesoPrescrito > 0) {
      const repsObjetivo = s.repsObjetivo ?? 0;
      volumenPrescritoKg += pesoPrescrito * repsObjetivo;
      if (s.completada) {
        const repsLogradas = s.repsLogradas ?? repsObjetivo;
        const pesoReal = parseFloat(s.pesoKg || '0') || 0;
        volumenRealizadoKg += pesoReal * repsLogradas;
      }
    } else {
      seriesCualitativas++;
      if (s.completada) seriesCualitativasCompletadas++;
    }
  }

  const ratioVolumenPct =
    volumenPrescritoKg > 0 ? (volumenRealizadoKg / volumenPrescritoKg) * 100 : null;
  const ratioSeriesPct =
    seriesCualitativas > 0 ? (seriesCualitativasCompletadas / seriesCualitativas) * 100 : null;

  const partes: boolean[] = [];
  if (ratioVolumenPct !== null) partes.push(ratioVolumenPct >= 70.0);
  if (ratioSeriesPct !== null) partes.push(ratioSeriesPct >= 70.0);

  return {
    cumple: partes.length > 0 && partes.every(Boolean),
    volumenRealizadoKg,
    volumenPrescritoKg,
    ratioVolumenPct,
    ratioSeriesPct,
  };
}

export interface RachaEstado {
  rachaDias: number;
  rachaUltimaFecha: string | null;
}

export interface RachaActualizada extends RachaEstado {
  incrementada: boolean;
}

/**
 * Actualiza la racha al finalizar una sesión:
 *  - cumple=false → NO modifica la racha almacenada.
 *  - cumple=true y racha_ultima_fecha == fechaLocal → sin cambio (mismo día no duplica).
 *  - cumple=true y racha_ultima_fecha == ayer → +1.
 *  - cumple=true y gap (o sin registro previo) → reinicia a 1.
 */
export function actualizarRacha(
  estado: RachaEstado,
  fechaLocal: string,
  cumple: boolean
): RachaActualizada {
  if (!cumple) {
    return { ...estado, incrementada: false };
  }

  if (estado.rachaUltimaFecha === fechaLocal) {
    return { ...estado, incrementada: false };
  }

  const ayer = fechaAnteriorYyyyMmDd(fechaLocal, 1);
  const nuevaRacha =
    estado.rachaUltimaFecha === ayer ? Math.max(1, (estado.rachaDias ?? 0) + 1) : 1;

  return { rachaDias: nuevaRacha, rachaUltimaFecha: fechaLocal, incrementada: true };
}

/**
 * `calcularRachaEfectiva` vive en `common/racha.util.ts` (compartida con `alumnos`);
 * se reexporta aquí para mantener los imports históricos de entrenamiento.
 */
export { calcularRachaEfectiva } from '../../../common/racha.util';

/**
 * Resumen de la prescripción para el alumno, sin jerga ("Reps", "Peso: Sugerido"):
 * 'Día 1 · 8-10 repeticiones · peso a tu criterio · Baja controlada en 3 s.'
 * Se guarda en `notas_coach` para la web ya publicada; la web actual usa además
 * `notasTecnicas` y `rpeSugerido`.
 */
export function resumirPrescripcionParaAlumno(
  tituloDia: string,
  ejercicio: { reps?: string; peso?: string; notas?: string }
): string {
  const partes = [tituloDia.trim()];
  const reps = (ejercicio.reps ?? '').trim();
  if (reps) partes.push(`${reps} repeticiones`);
  const peso = (ejercicio.peso ?? '').trim();
  partes.push(peso ? `peso ${peso}` : 'peso a tu criterio');
  const notas = (ejercicio.notas ?? '').trim();
  if (notas) partes.push(notas);
  return partes.filter(Boolean).join(' · ');
}

/**
 * RPE prescrito con un decimal ('8' -> '8.0', '8,5' -> '8.5'); `null` si no hay un número válido.
 * Acepta la coma decimal igual que `BloqueDiaRutinaSchema.rpe`.
 */
export function normalizarRpePrescrito(rpe?: string): string | null {
  if (!rpe) return null;
  const valor = parseFloat(rpe.trim().replace(',', '.'));
  return Number.isFinite(valor) ? valor.toFixed(1) : null;
}
