/**
 * WU-I (RF-009): lógica pura del Tablero de Control de Cartera del coach.
 *
 * Centraliza las etiquetas humanas de las pestañas, la lectura de la pestaña desde la URL, los
 * textos de días/saldos y la interpretación honesta de la proyección en Bs (sin tasa vigente no
 * se muestra un monto inventado). La página y la tabla solo consumen estas funciones.
 */
import {
  type FilaCarteraDTO,
  type PestanaCarteraDTO,
  type RecordatorioManualResultadoDTO,
  type ResumenCarteraDTO,
} from '@guachafit/shared';
import { formatFechaHoraLocal } from './date-format';
import { pluralizar } from './pluralizar';

export interface DefinicionPestanaCartera {
  clave: PestanaCarteraDTO;
  etiqueta: string;
  /** Copy corto del criterio real de la pestaña (RF-009 §4.B). */
  criterio: string;
}

/** Orden visual de las pestañas: primero la deuda vencida, al final los al día. */
export const PESTANAS_CARTERA: DefinicionPestanaCartera[] = [
  {
    clave: 'mora',
    etiqueta: 'En Mora',
    criterio: 'Corte superado con saldo pendiente',
  },
  {
    clave: 'por_vencer',
    etiqueta: 'Próximos a Vencer',
    criterio: 'Vencen en los próximos 5 días',
  },
  {
    clave: 'revision',
    etiqueta: 'Pendiente de Revisión',
    criterio: 'Comprobantes esperando validación',
  },
  {
    clave: 'al_dia',
    etiqueta: 'Al Día',
    criterio: 'Cuota del ciclo cubierta al 100%',
  },
];

/** Pestaña válida a partir del query param `pestana`; un valor ausente o inválido cae a `mora`. */
export function normalizarPestana(valor?: string | null): PestanaCarteraDTO {
  const encontrada = PESTANAS_CARTERA.find((pestana) => pestana.clave === valor);
  return encontrada?.clave ?? 'mora';
}

/** Mapa pestaña → clave del contador del resumen (evita derivar claves a mano en la UI). */
const CLAVES_CONTADOR: Record<PestanaCarteraDTO, keyof ResumenCarteraDTO['contadores']> = {
  mora: 'enMora',
  por_vencer: 'porVencer',
  revision: 'revision',
  al_dia: 'alDia',
};

/** Contador de la pestaña según el resumen del servidor (0 si aún no hay datos). */
export function contadorPestana(
  resumen: ResumenCarteraDTO | null | undefined,
  pestana: PestanaCarteraDTO
): number {
  if (!resumen) return 0;
  return resumen.contadores[CLAVES_CONTADOR[pestana]] ?? 0;
}

/** "12 días de atraso" / "1 día de atraso"; `null` cuando no aplica. */
export function etiquetaDiasAtraso(dias?: number | null): string | null {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) return null;
  return pluralizar(dias, 'día de atraso', 'días de atraso');
}

/** "Vence hoy" / "Vence mañana" / "Vence en 4 días"; `null` cuando no aplica. */
export function etiquetaDiasRestantes(dias?: number | null): string | null {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) return null;
  if (dias <= 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  return `Vence en ${dias} días`;
}

/** "3 días esperando" para los comprobantes en revisión; `null` cuando no aplica. */
export function etiquetaDiasEspera(dias?: number | null): string | null {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) return null;
  return pluralizar(dias, 'día esperando', 'días esperando');
}

/** Proyección en Bs con la tasa aplicada de la fila; `null` honesto sin tasa. */
export function textoSaldoBs(fila: Pick<FilaCarteraDTO, 'saldoPendienteBs'>): string | null {
  return fila.saldoPendienteBs ? `Bs. ${fila.saldoPendienteBs}` : null;
}

/** Último recordatorio manual de la fila, en lenguaje humano. */
export function textoUltimaGestion(iso?: string | null): string {
  const fecha = formatFechaHoraLocal(iso);
  return fecha ? `Último: ${fecha}` : 'Sin recordatorios manuales';
}

/** ¿El coach tiene tasa vigente para proyectar la columna en Bs? */
export function hayTasaProyectable(resumen: ResumenCarteraDTO | null | undefined): boolean {
  return Boolean(resumen?.tasaVigente && Number(resumen.tasaVigente) > 0);
}

/**
 * Feedback humano del recordatorio manual. Los motivos de negocio (cooldown, pausa, sin saldo)
 * son estados honestos, no errores: el modal los muestra con su tono correspondiente.
 */
export function tonoResultadoRecordatorio(
  resultado: RecordatorioManualResultadoDTO
): 'success' | 'warning' | 'info' {
  if (resultado.enviado) return 'success';
  if (resultado.motivo === 'cooldown_activo') return 'warning';
  return 'info';
}

/**
 * Fecha de la próxima facturación de un alumno al día.
 *
 * El sistema NO persiste una fecha de facturación futura; la única fecha real disponible es el
 * corte del ciclo ya cubierto. La UI la rotula como tal y nunca inventa un vencimiento.
 */
export function textoCorteCiclo(fechaCorteUtc?: string | null): string {
  const fecha = formatFechaHoraLocal(fechaCorteUtc);
  return fecha ? `Corte del ciclo: ${fecha}` : 'Sin fecha de corte registrada';
}
