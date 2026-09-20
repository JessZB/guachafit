/**
 * WU16: pestañas de la ficha del alumno y su representación en la URL (`?tab=`).
 *
 * El monitor enlaza a `/coach/alumnos/:id?tab=entrenamiento` para abrir el expediente directo
 * en el historial de sesiones; este módulo es la única fuente de verdad de qué valores son
 * válidos. Un valor ausente o desconocido cae al tab por defecto (`resumen`), nunca lanza.
 */

export const TABS_FICHA_ALUMNO = [
  'resumen',
  'finanzas',
  'antropometria',
  'entrenamiento',
] as const;

export type TabFichaAlumno = (typeof TABS_FICHA_ALUMNO)[number];

/** Tab inicial cuando no hay query param o el valor no es una pestaña conocida. */
export const TAB_FICHA_ALUMNO_POR_DEFECTO: TabFichaAlumno = 'resumen';

/**
 * Normaliza el query param `tab`: recorta espacios, ignora mayúsculas y valida contra la lista
 * de pestañas conocidas. Cualquier entrada inválida (null, vacío, desconocida) se resuelve al
 * tab por defecto, de modo que la URL nunca deja la ficha sin pestaña activa.
 */
export function parsearTabFichaAlumno(valor: string | null | undefined): TabFichaAlumno {
  const normalizado = (valor ?? '').trim().toLowerCase();
  return (TABS_FICHA_ALUMNO as readonly string[]).includes(normalizado)
    ? (normalizado as TabFichaAlumno)
    : TAB_FICHA_ALUMNO_POR_DEFECTO;
}

/**
 * Devuelve una copia de los query params con el tab activo aplicado, sin mutar la original.
 * El tab por defecto se elimina de la URL para no ensuciar enlaces (`/coach/alumnos/:id`);
 * cualquier otro se serializa como `?tab=<valor>`. Los parámetros ajenos se preservan.
 */
export function aplicarTabEnQuery(
  params: URLSearchParams,
  tab: TabFichaAlumno
): URLSearchParams {
  const siguientes = new URLSearchParams(params);
  if (tab === TAB_FICHA_ALUMNO_POR_DEFECTO) {
    siguientes.delete('tab');
  } else {
    siguientes.set('tab', tab);
  }
  return siguientes;
}
