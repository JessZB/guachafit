/**
 * RF-012 / WU-D: decisión de UI ante un bloqueo de acceso del alumno.
 *
 * La API responde `403` con `code: 'ALUMNO_BLOQUEADO'` cuando el ciclo de vida del alumno
 * (estado de activación o baja lógica) le impide operar. Este módulo traduce el código máquina
 * a la pantalla/estado informativo que ve el alumno, con el texto de RF-012 §4.A.
 *
 * La decisión es pura y testeable: recibe el error, devuelve `BloqueoAlumno` o `null`.
 */
import { CODIGO_ALUMNO_BLOQUEADO, EstadoAlumno } from '@guachafit/shared';
import { ApiError } from './api-client';

// El código vive en `@guachafit/shared` (fuente única con el API); se reexporta para
// los consumidores existentes de este módulo.
export { CODIGO_ALUMNO_BLOQUEADO };

/** Estado con el que la API identifica el bloqueo: el de activación o `archivado` (baja lógica). */
export type EstadoBloqueoAlumno = EstadoAlumno | 'archivado' | 'desconocido';

export interface BloqueoAlumno {
  codigo: typeof CODIGO_ALUMNO_BLOQUEADO;
  estado: EstadoBloqueoAlumno;
  /** Motivo máquina de la API (`ESTADO_ACTIVACION` | `CUENTA_ARCHIVADA`); `null` si no llega. */
  motivo: string | null;
  titulo: string;
  mensaje: string;
  /** Ruta interna de la acción sugerida; `null` cuando la pantalla es solo informativa. */
  rutaAccion: string | null;
  textoAccion: string | null;
}

type ProblemDetailsBloqueo = {
  code?: string;
  message?: string;
  estado?: string;
  motivo?: string;
};

type CopyBloqueo = Pick<BloqueoAlumno, 'titulo' | 'mensaje' | 'rutaAccion' | 'textoAccion'>;

/**
 * Textos de pantalla de bloqueo. El caso `suspendido_pago` usa el texto literal de RF-012
 * ("Tu acceso a la planificación se encuentra pausado por mensualidad pendiente") y ofrece el
 * botón directo para reportar el pago; los demás casos son informativos.
 */
const COPY_POR_ESTADO: Record<EstadoBloqueoAlumno, CopyBloqueo> = {
  [EstadoAlumno.SUSPENDIDO_PAGO]: {
    titulo: 'Acceso a la planificación suspendido',
    mensaje:
      'Tu acceso a la planificación se encuentra pausado por mensualidad pendiente. Tu cuenta y tus pagos siguen disponibles.',
    rutaAccion: '/app/pagos',
    textoAccion: 'Reportar pago',
  },
  [EstadoAlumno.INACTIVO_PAUSADO]: {
    titulo: 'Tu plan está en pausa',
    mensaje:
      'Tu entrenador pausó tu plan. No puedes iniciar nuevas sesiones ni enviar reportes mientras esté pausado; tu historial sigue disponible en modo lectura.',
    rutaAccion: '/app/progreso',
    textoAccion: 'Ver mi historial',
  },
  [EstadoAlumno.ACTIVO]: {
    titulo: 'Acceso restringido',
    mensaje:
      'Tu cuenta no tiene acceso a esta sección en este momento. Inténtalo de nuevo más tarde.',
    rutaAccion: null,
    textoAccion: null,
  },
  archivado: {
    titulo: 'Cuenta archivada',
    mensaje:
      'Tu entrenador archivó tu cuenta. Todo tu historial está protegido; contacta con tu entrenador para restaurar tu acceso.',
    rutaAccion: null,
    textoAccion: null,
  },
  desconocido: {
    titulo: 'Acceso restringido',
    mensaje: 'Tu cuenta no tiene acceso a esta sección en este momento.',
    rutaAccion: null,
    textoAccion: null,
  },
};

function normalizarEstado(estado?: string): EstadoBloqueoAlumno {
  if (estado === 'archivado') return 'archivado';
  if (
    estado === EstadoAlumno.ACTIVO ||
    estado === EstadoAlumno.INACTIVO_PAUSADO ||
    estado === EstadoAlumno.SUSPENDIDO_PAGO
  ) {
    return estado;
  }
  return 'desconocido';
}

/**
 * Traduce un error de la API a la decisión de pantalla de bloqueo.
 * Devuelve `null` cuando el error no es un `403 ALUMNO_BLOQUEADO` (otro código, otro status,
 * error de red): esos casos conservan el manejo de error habitual de cada pantalla.
 */
export function resolverBloqueoAlumno(error: unknown): BloqueoAlumno | null {
  if (!(error instanceof ApiError) || error.status !== 403) {
    return null;
  }

  const problem = (error.problem ?? {}) as ProblemDetailsBloqueo;
  if (problem.code !== CODIGO_ALUMNO_BLOQUEADO) {
    return null;
  }

  const estado = normalizarEstado(problem.estado);
  const copy = COPY_POR_ESTADO[estado];

  return {
    codigo: CODIGO_ALUMNO_BLOQUEADO,
    estado,
    motivo: typeof problem.motivo === 'string' ? problem.motivo : null,
    titulo: copy.titulo,
    // Para estados desconocidos se prefiere el mensaje humano real de la API (nunca un genérico vacío).
    mensaje:
      estado === 'desconocido' && problem.message ? problem.message : copy.mensaje,
    rutaAccion: copy.rutaAccion,
    textoAccion: copy.textoAccion,
  };
}
