/**
 * Helpers puros de adherencia y presentación del expediente (RF-001 RN-03, RF-013).
 *
 * Centralizan la semántica del semáforo semanal para que el monitor del coach, el
 * dashboard y el historial del alumno no dupliquen umbrales ni etiquetas.
 */
import {
  EstadoSesion,
  MotivoOmision,
  SemaforoAdherencia,
  type MonitorAdherenciaSemanalDTO,
} from '@guachafit/shared';

export type TonoSemaforo = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface EtiquetaVisual {
  texto: string;
  tono: TonoSemaforo;
}

/** RN-03: >= 80% verde, 50-79% amarillo, < 50% rojo. `null`/inválido = sin dato. */
export function clasificarTasaAdherencia(
  tasa: string | number | null | undefined
): SemaforoAdherencia | null {
  if (tasa === null || tasa === undefined) return null;
  const valor = typeof tasa === 'number' ? tasa : Number(String(tasa).trim());
  if (!Number.isFinite(valor) || String(tasa).trim() === '') return null;
  if (valor >= 80) return SemaforoAdherencia.VERDE;
  if (valor >= 50) return SemaforoAdherencia.AMARILLO;
  return SemaforoAdherencia.ROJO;
}

/** Etiqueta + tono del semáforo de adherencia para chips de UI. */
export function etiquetaSemaforo(semaforo: SemaforoAdherencia | null): EtiquetaVisual {
  switch (semaforo) {
    case SemaforoAdherencia.VERDE:
      return { texto: 'Verde', tono: 'success' };
    case SemaforoAdherencia.AMARILLO:
      return { texto: 'Amarillo', tono: 'warning' };
    case SemaforoAdherencia.ROJO:
      return { texto: 'Rojo', tono: 'danger' };
    default:
      return { texto: 'Sin dato', tono: 'neutral' };
  }
}

/** Peso de riesgo para ordenar la bandeja: ROJO primero, VERDE al final. */
export const PESO_RIESGO_SEMAFORO: Record<SemaforoAdherencia, number> = {
  [SemaforoAdherencia.ROJO]: 3,
  [SemaforoAdherencia.AMARILLO]: 2,
  [SemaforoAdherencia.VERDE]: 1,
};

/**
 * Orden por riesgo del monitor: los alumnos SIN plan activo y los que aún no tienen
 * bloques vencidos esta semana quedan después de los VERDE (no son un riesgo evaluable;
 * el backend los marca ROJO 0/0 por defecto, pero no hay nada que cumplir todavía).
 */
export function pesoOrdenRiesgoMonitor(alumno: MonitorAdherenciaSemanalDTO): number {
  if (!alumno.tienePlanActivo || alumno.sinPendientesSemana) return 0;
  return PESO_RIESGO_SEMAFORO[alumno.semaforoAdherencia] ?? 0;
}

/**
 * D6: etiqueta del monitor semanal por alumno.
 * Un plan activo sin bloques vencidos todavía (0/0 a inicio de semana) es un estado NEUTRAL,
 * nunca ROJO: solo el 0/0 con bloques debidos es un riesgo real de adherencia.
 */
export function etiquetaMonitorAdherencia(
  alumno: Pick<
    MonitorAdherenciaSemanalDTO,
    'tienePlanActivo' | 'sinPendientesSemana' | 'semaforoAdherencia'
  >
): EtiquetaVisual {
  if (!alumno.tienePlanActivo) return { texto: 'Sin plan', tono: 'neutral' };
  if (alumno.sinPendientesSemana) return { texto: 'Al día — sin pendientes', tono: 'neutral' };
  return etiquetaSemaforo(alumno.semaforoAdherencia);
}

/**
 * Ruta de navegación del monitor al expediente del alumno.
 *
 * `MonitorAdherenciaSemanalDTO.alumnoId` es el `usuarios.id`, pero el expediente
 * (`/coach/alumnos/:id` → `GET /alumnos/:id`) espera `perfiles_alumno.id`, expuesto en el DTO
 * como `alumnoPerfilId`. Sin perfilId (respuestas cacheadas previas o dato ausente) cae al
 * directorio para no romper la navegación.
 */
export function rutaExpedienteMonitor(alumnoPerfilId?: string | null): string {
  const perfilId = (alumnoPerfilId ?? '').trim();
  return perfilId.length > 0
    ? `/coach/alumnos/${encodeURIComponent(perfilId)}`
    : '/coach/alumnos';
}

/** Etiqueta legible del estado de sesión (RF-001 Escenario 5: motivo de omisión explícito). */
export function etiquetaEstadoSesion(
  estado: EstadoSesion,
  motivoOmision?: MotivoOmision | null
): EtiquetaVisual {
  switch (estado) {
    case EstadoSesion.PLANIFICADA:
      return { texto: 'Planificada', tono: 'neutral' };
    case EstadoSesion.EN_PROGRESO:
      return { texto: 'En progreso', tono: 'info' };
    case EstadoSesion.COMPLETADA:
      return { texto: 'Completada', tono: 'success' };
    case EstadoSesion.OMITIDA:
      if (motivoOmision === MotivoOmision.DESCANSO) {
        return { texto: 'Descansado', tono: 'warning' };
      }
      if (motivoOmision === MotivoOmision.INCOMPLETO) {
        return { texto: 'Incompleto', tono: 'danger' };
      }
      return { texto: 'Omitida', tono: 'warning' };
    default:
      return { texto: 'Sin estado', tono: 'neutral' };
  }
}

export interface EtiquetaNotaAlumno {
  titulo: string;
  valor: string;
}

export interface NotasAlumnoEstructuradas {
  etiquetas: EtiquetaNotaAlumno[];
  textoLibre: string | null;
}

/**
 * Descompone `notasAlumno` en etiquetas `[Título: valor]` y texto libre.
 * Entrada típica del cierre del alumno: `[RPE: 8.0/10] • [Molestia: Ninguna] • Buen bombeo`.
 */
export function parsearNotasAlumno(notas?: string | null): NotasAlumnoEstructuradas {
  const resultado: NotasAlumnoEstructuradas = { etiquetas: [], textoLibre: null };
  const texto = (notas ?? '').trim();
  if (!texto) return resultado;

  const partes = texto
    .split('•')
    .map((parte) => parte.trim())
    .filter(Boolean);
  const libres: string[] = [];

  for (const parte of partes) {
    const bracket = /^\[([^\]]+)\]$/.exec(parte);
    if (!bracket) {
      libres.push(parte);
      continue;
    }
    const contenido = bracket[1].trim();
    const separador = contenido.indexOf(':');
    if (separador > 0) {
      resultado.etiquetas.push({
        titulo: contenido.slice(0, separador).trim(),
        valor: contenido.slice(separador + 1).trim(),
      });
    } else {
      resultado.etiquetas.push({ titulo: contenido, valor: '' });
    }
  }

  resultado.textoLibre = libres.length > 0 ? libres.join(' • ') : null;
  return resultado;
}
