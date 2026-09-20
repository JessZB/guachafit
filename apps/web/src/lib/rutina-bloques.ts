/**
 * Helpers puros de bloques de días de rutina, compartidos por el modal de prescripción
 * del Expediente 360° (WU5) y el editor de plantillas del banco RF-017 (WU6b).
 *
 * Extraídos de AlumnoDetallePage para tener una única fuente de verdad del título
 * generado y de la normalización del estado de edición, cubierta por tests.
 */
import type { BloqueDiaRutinaDTO } from '@guachafit/shared';

/** Mapa tolerante de nombres de día (con y sin tilde) al número ISO (1 = lunes). */
export const DIAS_SEMANA_MAP: Record<string, number> = {
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
  domingo: 7,
};

export const NOMBRES_DIAS_SEMANA: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};

export const OPCIONES_DIAS_SEMANA = [
  { valor: 0, label: 'Flexible (Sin día fijo)' },
  { valor: 1, label: 'Lunes' },
  { valor: 2, label: 'Martes' },
  { valor: 3, label: 'Miércoles' },
  { valor: 4, label: 'Jueves' },
  { valor: 5, label: 'Viernes' },
  { valor: 6, label: 'Sábado' },
  { valor: 7, label: 'Domingo' },
];

/** Ejercicio en estado de edición (contrato `BloqueDiaRutinaDTO.ejercicios` + campos de UI). */
export interface EjercicioEdicion {
  id: string;
  ejercicioId?: string;
  nombre: string;
  series: number;
  reps: string;
  /** Carga prescrita como texto; vacío = prescripción cualitativa (nunca '0.00'). */
  peso: string;
  rpe?: string;
  descansoSegundos?: number;
  /** RF-017 RN-01: notas técnicas del coach para el ejercicio. */
  notas?: string;
}

/** Bloque de día en estado de edición: campos estructurados del selectores + metadatos. */
export interface BloqueEdicion {
  diaId: string;
  diaNumero: number;
  diaSugerido?: number;
  anotacion: string;
  titulo: string;
  enfoque?: string;
  ejercicios: EjercicioEdicion[];
}

/**
 * RF-001/WU5: el título del bloque se compone de forma estructurada para evitar falla
 * humana en el texto libre: `Día N (DíaSemana): Anotación`.
 */
export function generarTituloBloque(
  diaNumero: number,
  diaSugerido?: number,
  anotacion?: string
): string {
  const diaPrefijo = `Día ${diaNumero}`;
  const nombreDia =
    diaSugerido && NOMBRES_DIAS_SEMANA[diaSugerido] ? NOMBRES_DIAS_SEMANA[diaSugerido] : undefined;
  const diaSugeridoStr = nombreDia ? ` (${nombreDia})` : '';
  const anotacionLimpia = (anotacion || '').trim();
  return anotacionLimpia
    ? `${diaPrefijo}${diaSugeridoStr}: ${anotacionLimpia}`
    : `${diaPrefijo}${diaSugeridoStr}`;
}

/**
 * Normaliza un bloque persistido al estado de edición de la UI: detecta el número de
 * día, el día sugerido y la anotación desde el título, y completa los defaults de los
 * ejercicios (sin materializar cargas en '0.00').
 */
export function parsearBloqueParaEdicion(bloque: BloqueDiaRutinaDTO, idx: number): BloqueEdicion {
  const diaId = bloque.diaId || `d${idx + 1}`;
  let diaNumero = idx + 1;
  let diaSugerido =
    typeof bloque.diaSugerido === 'number' && bloque.diaSugerido >= 1 && bloque.diaSugerido <= 7
      ? bloque.diaSugerido
      : undefined;
  let anotacion = '';

  const rawTitulo = (bloque.titulo || '').trim();

  // Regex para detectar "Día 1 (Lunes): Anotación" o "Día 1: Anotación" o "Día 1 (Lunes)" o "Día 1"
  const match = rawTitulo.match(/^(?:D[ií]a|Bloque)\s*(\d+)(?:\s*\(([^)]+)\))?(?:\s*:\s*(.*))?$/i);

  if (match) {
    diaNumero = parseInt(match[1], 10) || idx + 1;
    const diaTexto = (match[2] || '').toLowerCase().trim();
    if (diaTexto && DIAS_SEMANA_MAP[diaTexto] && !diaSugerido) {
      diaSugerido = DIAS_SEMANA_MAP[diaTexto];
    }
    anotacion = (match[3] || '').trim();
  } else {
    const colonIdx = rawTitulo.indexOf(':');
    if (colonIdx !== -1) {
      anotacion = rawTitulo.slice(colonIdx + 1).trim();
    } else {
      anotacion = rawTitulo;
    }
  }

  const ejercicios: EjercicioEdicion[] = (bloque.ejercicios ?? []).map((ej, ejIdx) => ({
    id: ej.id || `e-${idx + 1}-${ejIdx + 1}`,
    ejercicioId: ej.ejercicioId,
    nombre: ej.nombre,
    series: ej.series,
    reps: ej.reps,
    peso: ej.peso ?? '',
    rpe: ej.rpe,
    descansoSegundos: ej.descansoSegundos,
    notas: ej.notas,
  }));

  return {
    diaId,
    diaNumero,
    diaSugerido,
    anotacion,
    titulo: generarTituloBloque(diaNumero, diaSugerido, anotacion),
    enfoque: bloque.enfoque,
    ejercicios,
  };
}

/**
 * Bloque nuevo de un día con los defaults operativos del modal de prescripción.
 * El `diaId` incluye un sufijo único: al eliminar un día intermedio y añadir otro,
 * `d{numero}` colisionaría con un bloque existente (claves React y matching de ajustes).
 */
export function crearBloqueEdicion(numero: number, idGenerado?: string): BloqueEdicion {
  const diaSugerido = numero <= 7 ? numero : undefined;
  return {
    diaId: idGenerado || `d${numero}-${Math.random().toString(36).slice(2, 7)}`,
    diaNumero: numero,
    diaSugerido,
    anotacion: '',
    titulo: generarTituloBloque(numero, diaSugerido, ''),
    enfoque: 'General',
    ejercicios: [],
  };
}

/** Ejercicio nuevo con los defaults del modal (carga vacía = cualitativa, WU5). */
export function crearEjercicioEdicion(
  nombre: string,
  ejercicioId?: string,
  idGenerado?: string
): EjercicioEdicion {
  return {
    id: idGenerado || `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ejercicioId,
    nombre,
    series: 3,
    reps: '10-12',
    peso: '',
    rpe: '8.0',
    descansoSegundos: 90,
  };
}

/**
 * Aplica cambios de configuración estructurada al bloque activo y regenera el título.
 * Misma semántica del modal WU5: `diaSugerido` null/0 → sin día fijo; anotación vacía
 * no deja dos puntos huérfanos.
 */
export function actualizarConfiguracionBloque(
  bloques: BloqueEdicion[],
  idx: number,
  cambios: {
    diaNumero?: number;
    diaSugerido?: number | null;
    anotacion?: string;
    enfoque?: string;
  }
): BloqueEdicion[] {
  const actual = bloques[idx];
  if (!actual) return bloques;

  const updated = [...bloques];
  const diaNumero =
    cambios.diaNumero !== undefined ? cambios.diaNumero : actual.diaNumero || idx + 1;
  const diaSugerido =
    cambios.diaSugerido !== undefined
      ? cambios.diaSugerido === null || cambios.diaSugerido === 0
        ? undefined
        : cambios.diaSugerido
      : actual.diaSugerido;
  const anotacion = cambios.anotacion !== undefined ? cambios.anotacion : actual.anotacion || '';
  const enfoque = cambios.enfoque !== undefined ? cambios.enfoque : actual.enfoque;

  updated[idx] = {
    ...actual,
    diaNumero,
    diaSugerido,
    anotacion,
    titulo: generarTituloBloque(diaNumero, diaSugerido, anotacion),
    enfoque,
  };
  return updated;
}
