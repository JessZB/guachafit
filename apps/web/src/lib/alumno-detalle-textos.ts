/**
 * Textos del ciclo de vida de la ficha del alumno ( entraîner → alumno-detalle ).
 *
 * Lógica pura extraída de `pages/entrenador/AlumnoDetallePage.tsx` (SL-1, R1).
 * Sin dependencias de React ni de la API.
 */
import { EstadoAlumno } from '@guachafit/shared';

/**
 * C6: confirmación pendiente de la ficha (sustituye a `window.confirm`). La acción solo se
 * ejecuta al confirmar en el diálogo accesible compartido.
 */
export interface ConfirmacionFicha {
  titulo: string;
  detalle: string;
  boton: string;
  variante?: 'primaria' | 'peligro';
  accion: () => Promise<void>;
}

/**
 * WU-D (RF-012): confirmación explícita del cambio de estado con el impacto REAL de cada uno.
 * El coach siempre sabe qué gana y qué pierde el alumno antes de aplicarlo.
 */
export const CONFIRMACION_CAMBIO_ESTADO: Record<EstadoAlumno, (nombre: string) => string> = {
  [EstadoAlumno.ACTIVO]: (nombre) =>
    `¿Reactivar a ${nombre}? Recuperará el acceso completo a su planificación, reportes y pagos.`,
  [EstadoAlumno.INACTIVO_PAUSADO]: (nombre) =>
    `¿Pausar a ${nombre}? Dejará de ver su planificación y no podrá iniciar sesiones ni enviar reportes; su historial se conserva en modo lectura.`,
  [EstadoAlumno.SUSPENDIDO_PAGO]: (nombre) =>
    `¿Suspender por pago a ${nombre}? Su planificación quedará bloqueada con la pantalla de mensualidad pendiente; podrá seguir reportando pagos.`,
};

/** Separa "¿Pregunta? Detalle." en título y detalle para el diálogo de confirmación. */
export function separarPreguntaYDetalle(texto: string): { titulo: string; detalle: string } {
  const corte = texto.indexOf('? ');
  if (corte < 0) return { titulo: texto, detalle: '' };
  return { titulo: texto.slice(0, corte + 1), detalle: texto.slice(corte + 2) };
}

export const TEXTO_BOTON_CAMBIO_ESTADO: Record<EstadoAlumno, string> = {
  [EstadoAlumno.ACTIVO]: 'Reactivar',
  [EstadoAlumno.INACTIVO_PAUSADO]: 'Pausar',
  [EstadoAlumno.SUSPENDIDO_PAGO]: 'Suspender por pago',
};

/** WU-D: feedback humano solo después de un 2xx (o del cambio local en modo demo). */
export const MENSAJE_EXITO_ESTADO: Record<EstadoAlumno, string> = {
  [EstadoAlumno.ACTIVO]: 'Alumno reactivado: recupera su acceso completo.',
  [EstadoAlumno.INACTIVO_PAUSADO]: 'Alumno pausado: su historial se conserva en modo lectura.',
  [EstadoAlumno.SUSPENDIDO_PAGO]:
    'Alumno suspendido por pago: conserva el reporte de pagos y su cuenta.',
};
