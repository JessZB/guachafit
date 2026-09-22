/**
 * RF-015 (Ola 3 · N2b): lógica pura de la pantalla de preferencias de notificación.
 *
 * La UI consume la matriz que ya devuelve el API (`CategoriaPreferenciasDTO[]` con `push`/`email`
 * por fila). Para guardar hay que traducir esa matriz de presentación a los campos planos del
 * contrato (`notifyPaymentsPush`, ...): esa correspondencia vive en `@guachafit/shared`
 * (`matrizPreferenciasPorRol`), así que aquí NO se duplica ninguna lista.
 *
 * También concentra el copy humano de RN-01/RN-02 y la detección del 400 de confirmación.
 */
import {
  CAMPO_CONFIRMACION_FINANZAS,
  MENSAJE_MINIMO_CANAL_FINANZAS,
  matrizPreferenciasPorRol,
  type CanalPreferenciaNotificacion,
  type CampoPreferenciaNotificacion,
  type CategoriaPreferenciaNotificacion,
  type CategoriaPreferenciasDTO,
  type Rol,
} from '@guachafit/shared';

export type MatrizPreferenciasNotificacion = CategoriaPreferenciasDTO[];

/** Copy de RN-01 EXACTO del doc, visible junto al switch bloqueado. */
export const TEXTO_CANAL_OBLIGATORIO_SEGURIDAD = 'Obligatorio por motivos de seguridad';

/**
 * Parte humana de la advertencia RN-02 (el mensaje del contrato termina con la instrucción técnica
 * `confirmarSinCanalesFinanzas`, que nunca se muestra en la UI — §6.1).
 */
export const TEXTO_ADVERTENCIA_FINANZAS =
  'Recomendamos mantener al menos un canal activo para no perder tu acceso por cuotas vencidas.';

/**
 * Descripción corta de cada fila de la matriz, en lenguaje del usuario.
 * Cubre TODAS las filas del contrato por rol (un test lo verifica contra la matriz compartida).
 */
export const DESCRIPCION_CATEGORIA_NOTIFICACION: Record<CategoriaPreferenciaNotificacion, string> = {
  FINANZAS: 'Recordatorios de cuotas y confirmación de tus pagos.',
  PLANIFICACION_DEPORTIVA: 'Nuevas rutinas y ajustes de tu entrenador.',
  CHECKIN_ANTROPOMETRICO: 'Recordatorios de tus controles de medidas.',
  SEGURIDAD: 'Inicios de sesión, cambios de contraseña y alertas de tu cuenta.',
  COBRANZAS: 'Pagos reportados y cuotas por vencer de tus alumnos.',
  NUEVOS_REGISTROS: 'Cuando un alumno se registra con tu enlace de invitación.',
  REPORTES_PROGRESO: 'Sesiones completadas y check-ins de tus alumnos.',
  RESUMEN_SEMANAL: 'Tu resumen de la semana, con adherencia y cobros.',
};

/** Descripción humana de una fila; una fila nueva sin copy cae a un texto genérico honesto. */
export function descripcionCategoriaNotificacion(id: string): string {
  return (
    DESCRIPCION_CATEGORIA_NOTIFICACION[id as CategoriaPreferenciaNotificacion] ??
    'Avisos de esta categoría.'
  );
}

/** ¿El canal de esta fila es obligatorio (RN-01) y por tanto no puede desactivarse? */
export function canalBloqueado(
  fila: Pick<CategoriaPreferenciasDTO, 'canalesObligatorios'>,
  canal: CanalPreferenciaNotificacion
): boolean {
  return fila.canalesObligatorios.includes(canal);
}

/** Aplica un cambio de canal sobre una copia inmutable de la matriz. */
export function aplicarCambioCanal(
  matriz: MatrizPreferenciasNotificacion,
  filaId: CategoriaPreferenciaNotificacion,
  canal: CanalPreferenciaNotificacion,
  valor: boolean
): MatrizPreferenciasNotificacion {
  return matriz.map((fila) =>
    fila.id === filaId && !canalBloqueado(fila, canal) ? { ...fila, [canal]: valor } : fila
  );
}

/** ¿Hay cambios reales entre la matriz guardada y el borrador? (solo canales, no etiquetas). */
export function hayCambiosPreferencias(
  original: MatrizPreferenciasNotificacion,
  actual: MatrizPreferenciasNotificacion
): boolean {
  if (original.length !== actual.length) return true;
  return actual.some((fila) => {
    const base = original.find((candidata) => candidata.id === fila.id);
    if (!base) return true;
    return base.push !== fila.push || base.email !== fila.email;
  });
}

/**
 * Payload del `PUT /notificaciones/preferencias`: recorre la matriz COMPARTIDA del rol y traduce
 * cada fila a sus campos planos. Así el payload solo incluye los campos que el rol gobierna (el
 * servicio rechaza campos ajenos) y no se envía ningún campo fuera de la matriz visible.
 */
export function construirPayloadPreferencias(
  rol: Rol | string | null | undefined,
  matriz: MatrizPreferenciasNotificacion
): Partial<Record<CampoPreferenciaNotificacion, boolean>> {
  const rolSeguro = (rol ?? 'alumno') as Rol;
  const payload: Partial<Record<CampoPreferenciaNotificacion, boolean>> = {};

  for (const definicion of matrizPreferenciasPorRol(rolSeguro)) {
    const fila = matriz.find((candidata) => candidata.id === definicion.id);
    if (!fila) continue;
    payload[definicion.push] = fila.push;
    payload[definicion.email] = fila.email;
  }

  return payload;
}

/**
 * RN-02: la fila de la categoría FINANZAS del rol tiene ambos canales apagados.
 *
 * Para el alumno es la fila "Finanzas y Pagos" (el API exige `confirmarSinCanalesFinanzas`); para
 * el coach es "Cobranzas Entrantes", donde la advertencia es una recomendación de la UI (el API la
 * acepta igualmente porque el campo de confirmación es inofensivo cuando no aplica).
 */
export function requiereConfirmacionFinanzas(
  rol: Rol | string | null | undefined,
  matriz: MatrizPreferenciasNotificacion
): boolean {
  const rolSeguro = (rol ?? 'alumno') as Rol;
  const definicion = matrizPreferenciasPorRol(rolSeguro).find((fila) =>
    fila.eventos.includes('FINANZAS')
  );
  if (!definicion) return false;

  const fila = matriz.find((candidata) => candidata.id === definicion.id);
  return !!fila && !fila.push && !fila.email;
}

/** Forma mínima del cuerpo de error del API que la UI necesita inspeccionar. */
export interface ProblemaPreferenciasNotificacion {
  error?: string;
  message?: string;
  requiereConfirmacion?: boolean;
  errores?: Array<{ campo: string; mensaje: string }>;
}

/**
 * ¿El 400 del PUT es la advertencia RN-02 (y por tanto corresponde confirmar y reintentar)?
 *
 * Cubre las dos formas del backend: el rechazo del servicio (`error: 'RN-02'`,
 * `requiereConfirmacion: true`) y el del contrato Zod del controlador (`error:
 * 'PREFERENCIAS_INVALIDAS'` con el mensaje RN-02 en `errores`).
 */
export function esErrorConfirmacionFinanzas(
  problema: ProblemaPreferenciasNotificacion | null | undefined
): boolean {
  if (!problema) return false;
  if (problema.error === 'RN-02' || problema.requiereConfirmacion === true) return true;
  if (problema.errores?.some((entrada) => entrada.mensaje === MENSAJE_MINIMO_CANAL_FINANZAS)) {
    return true;
  }
  return (
    typeof problema.message === 'string' &&
    problema.message.includes(TEXTO_ADVERTENCIA_FINANZAS)
  );
}

/** El campo de confirmación del contrato, reexportado para el body del PUT. */
export { CAMPO_CONFIRMACION_FINANZAS };
