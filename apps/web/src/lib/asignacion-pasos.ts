/**
 * Textos del formulario de asignación de una plantilla en 3 pasos (RF-017, lote E6).
 * Funciones puras, sin React.
 */
import { ModoAsignacionPlantilla, type BloqueDiaRutinaDTO } from '@guachafit/shared';
import { interpretarPesoPrescrito } from './entrada-numerica';
import { formatearSegundos } from './sesion-tiempos';

/** 'alumnos' solo existe en la asignación masiva (lote E10); 'elegir', solo en la individual. */
export type PasoAsignacion = 'alumnos' | 'elegir' | 'revisar' | 'confirmar';

/** Pasos de la asignación individual (expediente del alumno). */
export const PASOS_ASIGNACION: readonly PasoAsignacion[] = ['elegir', 'revisar', 'confirmar'];

/** Pasos de la asignación masiva (RF-017 RN-03, lote E10): elegir alumnos → revisar → confirmar. */
export const PASOS_ASIGNACION_MASIVA: readonly PasoAsignacion[] = [
  'alumnos',
  'revisar',
  'confirmar',
];

const TITULO_PASO: Record<PasoAsignacion, string> = {
  alumnos: 'Elegir alumnos',
  elegir: 'Elegir plantilla',
  revisar: 'Revisar y ajustar',
  confirmar: 'Confirmar',
};

/** 'Paso 1 de 3 · Elegir plantilla'. `pasos` indica el flujo (por defecto, el individual). */
export function textoPaso(
  paso: PasoAsignacion,
  pasos: readonly PasoAsignacion[] = PASOS_ASIGNACION
): string {
  return `Paso ${pasos.indexOf(paso) + 1} de ${pasos.length} · ${TITULO_PASO[paso]}`;
}

/** '4 × 10 · 60 kg · Esfuerzo 8 · 1 min 30 s' (el nombre va aparte). */
export function textoEjercicioPlantilla(ejercicio: BloqueDiaRutinaDTO['ejercicios'][number]): string {
  const partes = [`${ejercicio.series} × ${ejercicio.reps}`];

  const peso = interpretarPesoPrescrito(ejercicio.peso ?? '');
  if (peso.modo === 'corporal') {
    partes.push(peso.textoCorporal === 'Corporal' ? 'Peso corporal' : peso.textoCorporal);
  } else if (peso.numero !== '') {
    // '28.00' → '28 kg'; '60.5' → '60.5 kg'.
    partes.push(`${Number(peso.numero)} kg`);
  }

  if (ejercicio.rpe && ejercicio.rpe.trim() !== '') {
    partes.push(`Esfuerzo ${ejercicio.rpe.trim().replace(/\.0$/, '')}`);
  }
  if (ejercicio.descansoSegundos !== undefined && ejercicio.descansoSegundos !== null) {
    partes.push(formatearSegundos(ejercicio.descansoSegundos));
  }
  return partes.join(' · ');
}

/** Frase del paso de confirmación: qué se asigna, a quién, con cuántos ajustes y cómo. */
export function resumenAsignacion({
  plantillaNombre,
  alumnoNombre,
  numeroAjustes,
  modo,
}: {
  plantillaNombre: string;
  alumnoNombre: string;
  numeroAjustes: number;
  modo: ModoAsignacionPlantilla;
}): string {
  const ajustes =
    numeroAjustes === 0
      ? 'sin ajustes'
      : `con ${numeroAjustes} ${numeroAjustes === 1 ? 'ajuste' : 'ajustes'}`;
  const efecto =
    modo === ModoAsignacionPlantilla.REEMPLAZAR
      ? 'Reemplaza su rutina actual.'
      : 'Se añade a su rutina actual.';
  return `Se asignará «${plantillaNombre}» a ${alumnoNombre} ${ajustes}. ${efecto}`;
}

/**
 * Frase del paso de confirmación de la asignación masiva (lote E10): mismo estilo que
 * `resumenAsignacion`; con un solo alumno conocido se nombra, si no, se cuenta.
 */
export function resumenAsignacionMasiva({
  plantillaNombre,
  cantidad,
  nombreUnico,
  numeroAjustes,
  modo,
}: {
  plantillaNombre: string;
  cantidad: number;
  nombreUnico?: string;
  numeroAjustes: number;
  modo: ModoAsignacionPlantilla;
}): string {
  const destinatario =
    cantidad === 1 && nombreUnico ? nombreUnico : `${cantidad} alumno${cantidad === 1 ? '' : 's'}`;
  return resumenAsignacion({ plantillaNombre, alumnoNombre: destinatario, numeroAjustes, modo });
}
