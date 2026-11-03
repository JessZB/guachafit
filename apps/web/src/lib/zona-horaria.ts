/**
 * Zona horaria del perfil del alumno (RF-002 RN-02 / ADR-019).
 *
 * La ventana del reporte de nutrición y la hora de registro se interpretan con la zona IANA
 * guardada en el perfil, no con la del dispositivo. Estas utilidades son puras: reciben el instante
 * y la zona, y una zona inválida se interpreta como la zona por defecto.
 */

import { esZonaHorariaIanaValida, ZONA_HORARIA_ALUMNO_POR_DEFECTO } from '@guachafit/shared';

/** La misma zona por defecto que usa el servidor para el perfil del alumno. */
export const ZONA_HORARIA_POR_DEFECTO = ZONA_HORARIA_ALUMNO_POR_DEFECTO;

/** Zonas que se ofrecen primero en el selector, en este orden. */
export const ZONAS_HORARIAS_COMUNES: readonly string[] = [
  'America/Caracas',
  'America/Bogota',
  'America/Lima',
  'America/Mexico_City',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/New_York',
  'Europe/Madrid',
];

/** Ciudades con nombre en español; el resto se deriva del identificador. */
const NOMBRES_CIUDAD: Record<string, string> = {
  'America/Bogota': 'Bogotá',
  'America/Mexico_City': 'Ciudad de México',
  'America/New_York': 'Nueva York',
};

export function esZonaHorariaValida(zona: string | null | undefined): zona is string {
  return !!zona && esZonaHorariaIanaValida(zona);
}

function zonaEfectiva(zona: string | null | undefined): string {
  return esZonaHorariaValida(zona) ? zona : ZONA_HORARIA_POR_DEFECTO;
}

/**
 * Zonas para el selector: primero las comunes y después el resto en orden alfabético, sin
 * duplicados. Sin datos de zonas en el navegador, solo las comunes.
 */
export function listarZonasHorarias(obtenerSoportadas?: () => string[]): string[] {
  let soportadas: string[] = [];
  try {
    const obtener =
      obtenerSoportadas ??
      (() => {
        const intl = Intl as unknown as { supportedValuesOf?: (clave: string) => string[] };
        return typeof intl.supportedValuesOf === 'function' ? intl.supportedValuesOf('timeZone') : [];
      });
    soportadas = obtener();
  } catch {
    soportadas = [];
  }

  const comunes = new Set(ZONAS_HORARIAS_COMUNES);
  const resto = [...new Set(soportadas)].filter((zona) => !comunes.has(zona)).sort();
  return [...ZONAS_HORARIAS_COMUNES, ...resto];
}

/** Nombre comprensible de la zona, p. ej. "Hora de Caracas". */
export function nombreZonaHoraria(zona: string): string {
  const efectiva = zonaEfectiva(zona);
  const ciudad =
    NOMBRES_CIUDAD[efectiva] ?? (efectiva.split('/').pop() ?? efectiva).replace(/_/g, ' ');
  return `Hora de ${ciudad}`;
}

/** El mismo nombre dentro de una frase: "hora de Caracas". */
export function horaDeZona(zona: string): string {
  return nombreZonaHoraria(zona).replace(/^Hora/, 'hora');
}

export interface PartesEnZona {
  /** Fecha local YYYY-MM-DD en la zona. */
  fecha: string;
  hora: number;
  minuto: number;
}

/** Fecha, hora y minuto locales de un instante en la zona indicada. */
export function partesEnZona(instante: Date, zona: string | null | undefined): PartesEnZona {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaEfectiva(zona),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value ?? '00';
  return {
    fecha: `${valor('year')}-${valor('month')}-${valor('day')}`,
    hora: Number(valor('hour')),
    minuto: Number(valor('minute')),
  };
}

/** Día calendario 'YYYY-MM-DD' del instante en la zona indicada; nula o inválida -> America/Caracas. */
export function fechaCalendarioEnZona(
  zona: string | null | undefined,
  ahora: Date = new Date()
): string {
  return partesEnZona(ahora, zona).fecha;
}

/** `true` si el texto es un instante que `Date` puede interpretar. */
export function esInstanteValido(iso: string | null | undefined): iso is string {
  return !!iso && !Number.isNaN(new Date(iso).getTime());
}

/** Hora local `HH:mm` (24 h) de un instante ISO en la zona indicada. */
export function formatearHoraEnZona(isoUtc: string, zona: string | null | undefined): string {
  const { hora, minuto } = partesEnZona(new Date(isoUtc), zona);
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

/** Texto informativo con la hora local actual de una zona IANA. */
export function textoHoraActualEnZona(zona: string, fecha: Date = new Date()): string {
  const hora = formatearHoraEnZona(fecha.toISOString(), zona);
  return `Ahora son las ${hora} en ${horaDeZona(zona)}`;
}

/**
 * Desfase UTC (en minutos) de una zona IANA en un instante: America/Caracas -> -240. Devuelve
 * `null` si la zona es inválida o está vacía. Reconstruye la hora local de la zona como si fuera
 * UTC y la compara con el instante (sin depender de `timeZoneName: 'longOffset'`).
 */
export function desfaseMinutosEnZona(
  zona: string | null | undefined,
  instante: Date = new Date()
): number | null {
  if (!esZonaHorariaValida(zona)) return null;
  try {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: zona,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(instante);
    const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
      Number(partes.find((parte) => parte.type === tipo)?.value);
    const comoUtc = Date.UTC(
      valor('year'),
      valor('month') - 1,
      valor('day'),
      valor('hour'),
      valor('minute'),
      valor('second')
    );
    if (Number.isNaN(comoUtc)) return null;
    // El instante se trunca al segundo: las partes locales no incluyen milisegundos.
    const instanteEnSegundos = Math.floor(instante.getTime() / 1000) * 1000;
    return Math.round((comoUtc - instanteEnSegundos) / 60000);
  } catch {
    return null;
  }
}

/**
 * `true` solo si ambas zonas son válidas y tienen un desfase UTC distinto en este instante.
 * Se compara el desfase y no el nombre: America/Caracas y America/La_Paz (ambas -240) no difieren.
 */
export function hayDiscrepanciaZona(
  zonaPerfil: string | null | undefined,
  zonaDispositivo: string | null | undefined,
  instante: Date = new Date()
): boolean {
  const desfasePerfil = desfaseMinutosEnZona(zonaPerfil, instante);
  const desfaseDispositivo = desfaseMinutosEnZona(zonaDispositivo, instante);
  return desfasePerfil !== null && desfaseDispositivo !== null && desfasePerfil !== desfaseDispositivo;
}

/** Clave de `sessionStorage` con la que se recuerda que el aviso de esta pareja de zonas se descartó. */
export function claveAvisoZona(
  usuarioId: string,
  zonaPerfil: string,
  zonaDispositivo: string
): string {
  return `guachafit:aviso-zona:${usuarioId}:${zonaPerfil}|${zonaDispositivo}`;
}
