/**
 * RF-015 (Ola 3 / N2a): resolución PURA de la matriz de preferencias por rol y categoría.
 *
 * El despachador necesita dos cosas que no puede adivinar por la categoría del evento:
 *
 * 1. **Rol del destinatario**: `FINANZAS`/`ENTRENAMIENTO`/`ANTROPOMETRIA` significan cosas distintas
 *    para un alumno y para un entrenador (p. ej. un pago reportado es "Finanzas y Pagos" para el
 *    alumno que lo emite, pero "Cobranzas Entrantes" para el coach que lo recibe).
 * 2. **Fila de la matriz**: categoría + rol → campos Push/Email reales y canales bloqueados (RN-01).
 *
 * Vive en el API (no en `@guachafit/shared`) porque es política de despacho, no contrato de datos.
 */
import {
  buscarDefinicionCategoria,
  CampoPreferenciaNotificacion,
  CategoriaNotificacion,
  DefinicionCategoriaPreferencia,
  EventoNotificacionPayload,
  MATRIZ_PREFERENCIAS_NOTIFICACION,
  PREFERENCIAS_NOTIFICACION_POR_DEFECTO,
  Rol,
} from '@guachafit/shared';

/** Subconjunto de la matriz (una fila de BD puede llegar parcial en mocks/efectos previos). */
export type MapaPreferencias = Partial<Record<CampoPreferenciaNotificacion, boolean>>;

export interface DecisionCanalesNotificacion {
  push: boolean;
  email: boolean;
  /** Trazabilidad de la decisión (logs/tests): fila aplicada y reglas que forzaron canales. */
  filaMatriz?: string;
  emailForzado: boolean;
  pushForzado: boolean;
}

/** Valor efectivo de un campo: el persistido o, si no existe, el default del doc. */
export function valorEfectivo(
  prefs: MapaPreferencias | null | undefined,
  campo: CampoPreferenciaNotificacion
): boolean {
  return prefs?.[campo] ?? PREFERENCIAS_NOTIFICACION_POR_DEFECTO[campo];
}

/**
 * Fila de la matriz cuando el rol no pudo resolverse: si la categoría pertenece a UNA SOLA fila
 * (p. ej. `ALUMNOS`/`RESUMEN_SEMANAL` son del entrenador, y `SEGURIDAD` es la misma fila en ambos
 * roles), esa fila es la correcta. Con dos filas distintas (FINANZAS, ENTRENAMIENTO, ANTROPOMETRIA)
 * devuelve `undefined`: sin rol no se inventa una preferencia ajena.
 */
export function buscarDefinicionUnica(
  categoria: CategoriaNotificacion
): DefinicionCategoriaPreferencia | undefined {
  // Se deduplica por `id` de fila: el superadmin comparte la matriz del entrenador y SEGURIDAD es
  // la misma fila en ambos roles, así que el número de IDs distintos sí representa la ambigüedad.
  const candidatas = new Map<string, DefinicionCategoriaPreferencia>();

  for (const filas of Object.values(MATRIZ_PREFERENCIAS_NOTIFICACION)) {
    const fila = filas.find((definicion) => definicion.eventos.includes(categoria));
    if (fila) {
      candidatas.set(fila.id, fila);
    }
  }

  return candidatas.size === 1 ? [...candidatas.values()][0] : undefined;
}

/**
 * Decisión de canales externos para un evento (In-App es SIEMPRE universal, RF-014 RN-04).
 *
 * Precedencia (RF-015):
 * 1. Canal obligatorio de la fila (RN-01) → siempre activo.
 * 2. `esCriticoSeguridad` (comprobantes de pago aprobado, RN-01 párrafo 2) → Email siempre.
 * 3. Preferencia del usuario (o default del doc si el campo no existe).
 * 4. Categoría sin fila de matriz para el rol → no se envía por canales externos.
 */
export function decidirCanalesNotificacion(
  evento: EventoNotificacionPayload,
  rol: Rol,
  prefs: MapaPreferencias | null | undefined
): DecisionCanalesNotificacion {
  const criticoSeguridad = evento.esCriticoSeguridad === true;
  const fila =
    buscarDefinicionCategoria(rol, evento.categoria) ?? buscarDefinicionUnica(evento.categoria);

  if (!fila) {
    // Categoría sin fila de matriz para el rol: In-App universal, sin canales externos. Una alerta
    // crítica de seguridad sigue garantizando su correo aunque la categoría sea nueva (RN-01).
    return {
      push: false,
      email: criticoSeguridad,
      emailForzado: criticoSeguridad,
      pushForzado: false,
    };
  }

  const pushObligatorio = fila.canalesObligatorios.includes('push');
  const emailObligatorio = fila.canalesObligatorios.includes('email');

  return {
    push: pushObligatorio || valorEfectivo(prefs, fila.push),
    email: emailObligatorio || criticoSeguridad || valorEfectivo(prefs, fila.email),
    filaMatriz: fila.id,
    emailForzado: emailObligatorio || criticoSeguridad,
    pushForzado: pushObligatorio,
  };
}
