/**
 * Etiquetas humanas de los enums de dominio visibles al usuario (00_Reglas §6).
 *
 * Ninguna superficie debe imprimir valores crudos en snake_case (`al_dia`, `inactivo_pausado`,
 * `remoto_autoreporte`) ni documentos con guion bajo (`V_12345678`): este módulo centraliza las
 * etiquetas, su tono visual y el formato humano del documento de identidad.
 */
import {
  EstadoAlumno,
  EstadoCuota,
  EstadoMedicion,
  Modalidad,
  OrigenAntropometria,
  TipoDocumento,
} from '@guachafit/shared';
import type { EtiquetaVisual } from './adherencia';

/** Semáforo de pago de la cartera (`PerfilAlumnoDirectorioDTO.semaforoPago`). */
export type SemaforoPago = 'al_dia' | 'por_vencer' | 'moroso' | 'sin_cuota';

const ETIQUETAS_ESTADO_ACTIVACION: Record<EstadoAlumno, string> = {
  [EstadoAlumno.ACTIVO]: 'Activo',
  [EstadoAlumno.INACTIVO_PAUSADO]: 'Pausado',
  [EstadoAlumno.SUSPENDIDO_PAGO]: 'Suspendido por pago',
};

/** Estado de activación del alumno; un valor desconocido cae en "Sin dato" (nunca crudo). */
export function etiquetaEstadoActivacion(estado?: string | null): string {
  return ETIQUETAS_ESTADO_ACTIVACION[estado as EstadoAlumno] ?? 'Sin dato';
}

const ETIQUETAS_MODALIDAD: Record<Modalidad, string> = {
  [Modalidad.PRESENCIAL]: 'Presencial',
  [Modalidad.REMOTO]: 'Remoto',
};

/** Modalidad del alumno en lenguaje humano; nunca el valor crudo del dominio. */
export function etiquetaModalidad(modalidad?: string | null): string {
  return ETIQUETAS_MODALIDAD[modalidad as Modalidad] ?? 'Sin dato';
}

/**
 * Semáforo de pago de la cartera.
 *
 * `sin_cuota` NO es deuda: se rotula "Sin cuota emitida" en tono neutro (RF-011 §6), nunca como
 * "Cuota pendiente" en rojo. `moroso` conserva el rojo; `por_vencer` el ámbar.
 */
export function etiquetaSemaforoPago(semaforo?: string | null): EtiquetaVisual {
  switch (semaforo) {
    case 'al_dia':
      return { texto: 'Al día', tono: 'success' };
    case 'por_vencer':
      return { texto: 'Por vencer', tono: 'warning' };
    case 'moroso':
      return { texto: 'Cuota pendiente', tono: 'danger' };
    case 'sin_cuota':
      return { texto: 'Sin cuota emitida', tono: 'neutral' };
    default:
      return { texto: 'Sin dato', tono: 'neutral' };
  }
}

/** Estado de la cuota del periodo (mismos textos que el badge del menú del alumno). */
export function etiquetaEstadoCuota(estado?: string | null): EtiquetaVisual {
  switch (estado) {
    case EstadoCuota.AL_DIA:
      return { texto: 'Al día', tono: 'success' };
    case EstadoCuota.ABONADA_PARCIAL:
      return { texto: 'Abono parcial', tono: 'warning' };
    case EstadoCuota.EMITIDA:
      return { texto: 'Pendiente', tono: 'warning' };
    case EstadoCuota.POR_VENCER:
      return { texto: 'Por vencer', tono: 'warning' };
    case EstadoCuota.PENDIENTE_REVISION:
      return { texto: 'Pago en revisión', tono: 'info' };
    case EstadoCuota.VENCIDA:
      return { texto: 'Vencida', tono: 'danger' };
    case EstadoCuota.ANULADA:
      return { texto: 'Anulada', tono: 'neutral' };
    default:
      return { texto: 'Sin dato', tono: 'neutral' };
  }
}

/** Origen de un control antropométrico, en lenguaje del alumno que ve su evolución. */
export function etiquetaOrigenAntropometria(origen?: string | null): string {
  switch (origen) {
    case OrigenAntropometria.PRESENCIAL_VERIFICADO:
      return 'Verificado por tu entrenador';
    case OrigenAntropometria.REMOTO_AUTOREPORTE:
      return 'Reportado por ti';
    default:
      return 'Sin dato';
  }
}

/** Estado de aprobación de un control antropométrico. */
export function etiquetaEstadoMedicion(estado?: string | null): EtiquetaVisual {
  switch (estado) {
    case EstadoMedicion.APROBADO:
      return { texto: 'Aprobado', tono: 'success' };
    case EstadoMedicion.PENDIENTE_APROBACION:
      return { texto: 'Pendiente de aprobación', tono: 'warning' };
    case EstadoMedicion.RECHAZADO:
      return { texto: 'Rechazado', tono: 'danger' };
    default:
      return { texto: 'Sin dato', tono: 'neutral' };
  }
}

/**
 * Documento de identidad humano: `V_` + `12345678` → `V-12345678`.
 * Devuelve `null` si falta el tipo o el número para que el llamador muestre "—".
 */
export function formatearDocumento(
  tipoDocumento?: TipoDocumento | string | null,
  numeroDocumento?: string | null
): string | null {
  const tipo = (tipoDocumento ?? '').trim();
  const numero = (numeroDocumento ?? '').trim();
  if (!tipo || !numero) return null;
  return `${tipo.replace(/_+$/, '').toUpperCase()}-${numero}`;
}
