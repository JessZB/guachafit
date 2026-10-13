import { z } from 'zod';
import { Rol, PlataformaDispositivo, TemaUi } from '../enums';

// =============================================================================
// NOTIFICACIONES & PREFERENCIAS SCHEMAS (RF-014, RF-015, RF-016)
// =============================================================================

/** RF-015: canales físicos de entrega de la matriz de preferencias. */
export type CanalPreferenciaNotificacion = 'push' | 'email';

/**
 * RF-015 §A: mensaje EXACTO de la interfaz para el canal obligatorio de seguridad
 * (Escenario 2 — "Este canal es obligatorio para proteger tu cuenta").
 */
export const MENSAJE_CANAL_OBLIGATORIO_SEGURIDAD =
  'Este canal es obligatorio para proteger tu cuenta: el correo de seguridad no puede desactivarse.';

/**
 * RF-015 RN-02: advertencia al apagar a la vez Push y Email de "Finanzas y Pagos". El usuario
 * puede continuar confirmando explícitamente con `confirmarSinCanalesFinanzas: true`.
 */
export const MENSAJE_MINIMO_CANAL_FINANZAS =
  'Recomendamos mantener al menos un canal activo para no perder tu acceso por cuotas vencidas. ' +
  'Confirma con `confirmarSinCanalesFinanzas: true` para continuar.';

/** Campo del contrato que confirma la advertencia de RN-02. */
export const CAMPO_CONFIRMACION_FINANZAS = 'confirmarSinCanalesFinanzas';

/**
 * RF-015 §A: campos que NUNCA pueden desactivarse (RN-01 — "anulando cualquier intento de
 * desactivación"). Los comprobantes de pago aprobado no dependen de una preferencia: viajan como
 * `esCriticoSeguridad` y el despachador los garantiza por Email.
 */
export const CANALES_OBLIGATORIOS_NOTIFICACION = ['notifySeguridadEmail'] as const;

/**
 * RF-015 §A/§B: valores por defecto de la matriz COMPLETA, por campo.
 *
 * Fuente única de defaults del contrato (el `DEFAULT` de cada columna en la migración 0008 replica
 * estos mismos valores para que un alta por SQL directo nazca alineada).
 */
export const PREFERENCIAS_NOTIFICACION_POR_DEFECTO = {
  // §A Alumno / Cliente — Finanzas y Pagos
  notifyPaymentsPush: true,
  notifyPaymentsEmail: true,
  // §A Alumno / Cliente — Planificación Deportiva
  notifyWorkoutsPush: true,
  notifyWorkoutsEmail: false,
  // §A Alumno / Cliente — Check-in Antropométrico
  notifyCheckinsPush: true,
  notifyCheckinsEmail: false,
  // §A Seguridad de Cuenta (fila BLOQUEADA: Email obligatorio, Push opt-in)
  notifySeguridadPush: false,
  notifySeguridadEmail: true,
  // §B Entrenador — Cobranzas Entrantes
  notifyCobranzasPush: true,
  notifyCobranzasEmail: true,
  // §B Entrenador — Nuevos Registros
  notifyNuevosRegistrosPush: true,
  notifyNuevosRegistrosEmail: true,
  // §B Entrenador — Reportes de Progreso
  notifyReportesProgresoPush: true,
  notifyReportesProgresoEmail: false,
  // §B Entrenador — Resumen Semanal (digest dominical)
  digestWeeklyPush: false,
  digestWeeklyEmail: true,
} as const;

/**
 * RF-015: matriz de preferencias por rol y canal.
 *
 * Los 16 campos existen para CUALQUIER usuario (una fila por usuario); este esquema declara cuáles
 * son los que cada rol realmente gobierna. Cualquier campo puede llegar parcialmente (PUT).
 *
 * RN-01 se valida aquí (contrato) y se vuelve a validar en el servicio sobre el estado EFECTIVO
 * (el payload puede desactivar un canal que ya estaba apagado en base de datos).
 */
export const PreferenciasNotificacionSchema = z.object({
  notifyPaymentsPush: z.boolean(),
  notifyPaymentsEmail: z.boolean(),
  notifyWorkoutsPush: z.boolean(),
  notifyWorkoutsEmail: z.boolean(),
  notifyCheckinsPush: z.boolean(),
  notifyCheckinsEmail: z.boolean(),
  notifySeguridadPush: z.boolean(),
  notifySeguridadEmail: z.boolean(),
  notifyCobranzasPush: z.boolean(),
  notifyCobranzasEmail: z.boolean(),
  notifyNuevosRegistrosPush: z.boolean(),
  notifyNuevosRegistrosEmail: z.boolean(),
  notifyReportesProgresoPush: z.boolean(),
  notifyReportesProgresoEmail: z.boolean(),
  digestWeeklyPush: z.boolean(),
  digestWeeklyEmail: z.boolean(),
});

/** Campo booleano de la matriz de preferencias (derive del contrato, no una lista a mano). */
export type CampoPreferenciaNotificacion = keyof z.infer<typeof PreferenciasNotificacionSchema>;

/**
 * RF-015: categorías de evento del despachador que alimentan cada fila de la matriz.
 * (Reemplaza la antigua unión suelta de `types/index.ts` para poder tipar el catálogo.)
 */
export const CATEGORIAS_NOTIFICACION = [
  'FINANZAS',
  'ENTRENAMIENTO',
  'ANTROPOMETRIA',
  'RESUMEN_SEMANAL',
  'SEGURIDAD',
  /**
   * WU-E (RF-011 RN-07.4 / RF-015 §B "Nuevos Registros"): alertas operativas de onboarding del
   * coach (p. ej. alumno registrado por su deep link). El Despachador las persiste SIEMPRE en la
   * bandeja In-App (RF-014 RN-04) y enruta Push/Email por la fila "Nuevos Registros" del §B.
   */
  'ALUMNOS',
] as const;

export type CategoriaNotificacion = (typeof CATEGORIAS_NOTIFICACION)[number];

/** RF-015 §A/§B: identificadores de las filas de la matriz (por rol). */
export type CategoriaPreferenciaNotificacion =
  | 'FINANZAS'
  | 'PLANIFICACION_DEPORTIVA'
  | 'CHECKIN_ANTROPOMETRICO'
  | 'SEGURIDAD'
  | 'COBRANZAS'
  | 'NUEVOS_REGISTROS'
  | 'REPORTES_PROGRESO'
  | 'RESUMEN_SEMANAL';

/** RF-015: fila de la matriz — categoría, etiqueta de UI, canales y bloqueos. */
export interface DefinicionCategoriaPreferencia {
  id: CategoriaPreferenciaNotificacion;
  /** Etiqueta en español de la pantalla de ajustes (RF-015 §A/§B). */
  etiqueta: string;
  /** Categorías de evento que el despachador enruta por esta fila. */
  eventos: readonly CategoriaNotificacion[];
  push: CampoPreferenciaNotificacion;
  email: CampoPreferenciaNotificacion;
  /** Canales que no pueden desactivarse (RN-01). */
  canalesObligatorios: readonly CanalPreferenciaNotificacion[];
}

const CATEGORIA_SEGURIDAD: DefinicionCategoriaPreferencia = {
  id: 'SEGURIDAD',
  etiqueta: 'Seguridad de Cuenta',
  eventos: ['SEGURIDAD'],
  push: 'notifySeguridadPush',
  email: 'notifySeguridadEmail',
  canalesObligatorios: ['email'],
};

const MATRIZ_ALUMNO: readonly DefinicionCategoriaPreferencia[] = [
  {
    id: 'FINANZAS',
    etiqueta: 'Finanzas y Pagos',
    eventos: ['FINANZAS'],
    push: 'notifyPaymentsPush',
    email: 'notifyPaymentsEmail',
    canalesObligatorios: [],
  },
  {
    id: 'PLANIFICACION_DEPORTIVA',
    etiqueta: 'Planificación Deportiva',
    eventos: ['ENTRENAMIENTO'],
    push: 'notifyWorkoutsPush',
    email: 'notifyWorkoutsEmail',
    canalesObligatorios: [],
  },
  {
    id: 'CHECKIN_ANTROPOMETRICO',
    etiqueta: 'Check-in Antropométrico',
    eventos: ['ANTROPOMETRIA'],
    push: 'notifyCheckinsPush',
    email: 'notifyCheckinsEmail',
    canalesObligatorios: [],
  },
  CATEGORIA_SEGURIDAD,
];

const MATRIZ_ENTRENADOR: readonly DefinicionCategoriaPreferencia[] = [
  {
    id: 'COBRANZAS',
    etiqueta: 'Cobranzas Entrantes',
    eventos: ['FINANZAS'],
    push: 'notifyCobranzasPush',
    email: 'notifyCobranzasEmail',
    canalesObligatorios: [],
  },
  {
    id: 'NUEVOS_REGISTROS',
    etiqueta: 'Nuevos Registros',
    eventos: ['ALUMNOS'],
    push: 'notifyNuevosRegistrosPush',
    email: 'notifyNuevosRegistrosEmail',
    canalesObligatorios: [],
  },
  {
    id: 'REPORTES_PROGRESO',
    etiqueta: 'Reportes de Progreso',
    eventos: ['ENTRENAMIENTO', 'ANTROPOMETRIA'],
    push: 'notifyReportesProgresoPush',
    email: 'notifyReportesProgresoEmail',
    canalesObligatorios: [],
  },
  {
    id: 'RESUMEN_SEMANAL',
    etiqueta: 'Resumen Semanal',
    eventos: ['RESUMEN_SEMANAL'],
    push: 'digestWeeklyPush',
    email: 'digestWeeklyEmail',
    canalesObligatorios: [],
  },
  CATEGORIA_SEGURIDAD,
];

/**
 * RF-015: matriz por rol. El superadmin opera la plataforma con el mismo tablero operativo que un
 * entrenador (no tiene perfil propio), por lo que hereda la matriz del entrenador.
 */
export const MATRIZ_PREFERENCIAS_NOTIFICACION: Record<
  Rol,
  readonly DefinicionCategoriaPreferencia[]
> = {
  [Rol.ALUMNO]: MATRIZ_ALUMNO,
  [Rol.ENTRENADOR]: MATRIZ_ENTRENADOR,
  [Rol.SUPERADMIN]: MATRIZ_ENTRENADOR,
};

/** RF-015: filas de la matriz que gobierna un rol. */
export function matrizPreferenciasPorRol(
  rol: Rol
): readonly DefinicionCategoriaPreferencia[] {
  return MATRIZ_PREFERENCIAS_NOTIFICACION[rol] ?? MATRIZ_ALUMNO;
}

/** RF-015: fila de la matriz que enruta una categoría de evento para un rol (o `undefined`). */
export function buscarDefinicionCategoria(
  rol: Rol,
  categoria: CategoriaNotificacion
): DefinicionCategoriaPreferencia | undefined {
  return matrizPreferenciasPorRol(rol).find((fila) => fila.eventos.includes(categoria));
}

/** RF-015: canal lógico → campo de preferencia de una fila. */
export function campoDeCanal(
  fila: DefinicionCategoriaPreferencia,
  canal: CanalPreferenciaNotificacion
): CampoPreferenciaNotificacion {
  return canal === 'push' ? fila.push : fila.email;
}

/**
 * RF-015: PUT de preferencias. Cualquier subconjunto de la matriz es válido.
 *
 * - **RN-01**: `notifySeguridadEmail = false` se rechaza en contrato (además de servicio y BD).
 * - **RN-02**: apagar Push y Email de Finanzas en el mismo payload exige
 *   `confirmarSinCanalesFinanzas = true` (la UI muestra la advertencia y reintenta).
 */
export const ActualizarPreferenciasNotificacionSchema = PreferenciasNotificacionSchema.partial()
  .extend({
    [CAMPO_CONFIRMACION_FINANZAS]: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.notifySeguridadEmail === false) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notifySeguridadEmail'],
        message: MENSAJE_CANAL_OBLIGATORIO_SEGURIDAD,
      });
    }

    if (
      data.notifyPaymentsPush === false &&
      data.notifyPaymentsEmail === false &&
      !data[CAMPO_CONFIRMACION_FINANZAS]
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notifyPaymentsPush'],
        message: MENSAJE_MINIMO_CANAL_FINANZAS,
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notifyPaymentsEmail'],
        message: MENSAJE_MINIMO_CANAL_FINANZAS,
      });
    }
  });

export const RegistrarDispositivoSchema = z.object({
  deviceToken: z.string().min(10).max(255),
  platform: z.nativeEnum(PlataformaDispositivo),
});

export const MarcarNotificacionLeidaSchema = z.object({
  leida: z.boolean().default(true),
});

/** RF-014 (Ola 3): página por defecto y techo duro de `GET /notificaciones/in-app`. */
export const LIMITE_IN_APP_POR_DEFECTO = 25;
export const LIMITE_IN_APP_MAXIMO = 100;

/**
 * Acepta booleanos reales (uso interno/tests) y strings de query (`'true'`/`'false'`).
 * `z.coerce.boolean()` NO sirve aquí: `Boolean('false') === true` convertiría un filtro
 * desactivado en activado.
 */
const BooleanoQuerySchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((valor) => (typeof valor === 'boolean' ? valor : valor === 'true'));

/**
 * RF-014 (Ola 3): filtros server-side de la bandeja In-App (campana de N2).
 *
 * - `limit`/`offset`: paginación estándar con techo duro (ADR-013).
 * - `soloNoLeidas`: recorta la lista a las no leídas; `totalNoLeidas` de la respuesta sigue
 *   describiendo TODAS las no leídas del usuario (no solo la página).
 */
export const FiltroBandejaInAppSchema = z.object({
  limit: z
    .coerce
    .number()
    .int('El límite debe ser un número entero')
    .min(1, 'El límite debe ser al menos 1')
    .max(LIMITE_IN_APP_MAXIMO, `El límite no puede exceder ${LIMITE_IN_APP_MAXIMO}`)
    .optional()
    .default(LIMITE_IN_APP_POR_DEFECTO),
  offset: z
    .coerce
    .number()
    .int('La posición de inicio debe ser un número entero')
    .min(0, 'La posición de inicio no puede ser negativa')
    .optional()
    .default(0),
  soloNoLeidas: BooleanoQuerySchema.optional().default(false),
});

export const ActualizarTemaUiSchema = z.object({
  temaUi: z.nativeEnum(TemaUi),
});
